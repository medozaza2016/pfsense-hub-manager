import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { isIP } from "node:net";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Pool } from "pg";
import { hashPassword, verifyPassword } from "./auth/password.js";
import { clearSessionCookie, createSessionToken, hashSessionToken, readSessionToken, sessionCookie, SESSION_TTL_SECONDS } from "./auth/session.js";
import type { PfSenseProvider } from "./pfsense/provider.js";
import { registry, requests, requestDuration, polls, pollErrors, pollDuration, deviceUp, lastSuccess } from "./metrics.js";

type ManagerRole = "admin" | "user";
type ManagerUser = { id: string; display_name: string; email: string; role: ManagerRole; is_active: boolean };
declare module "fastify" {
  interface FastifyRequest {
    managerUser?: ManagerUser;
    managerSessionToken?: string;
  }
}

export function buildApp({ config, pool, provider }: { config: AppConfig; pool: Pool; provider: PfSenseProvider }) {
const app = Fastify({
  logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.x-api-key", "req.headers.authorization", "req.headers.cookie"] },
  bodyLimit: 65536,
  requestTimeout: 15000
});

app.addHook("onRequest", async request => {
  (request as typeof request & { metricStart?: bigint }).metricStart = process.hrtime.bigint();
});
app.addHook("onResponse", async (request, reply) => {
  const route = request.routeOptions.url ?? "unmatched";
  const start = (request as typeof request & { metricStart?: bigint }).metricStart ?? process.hrtime.bigint();
  requests.inc({ method: request.method, route, status: String(reply.statusCode) });
  requestDuration.observe({ method: request.method, route }, Number(process.hrtime.bigint() - start) / 1e9);
});

app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async (_request, reply) => {
  try { await pool.query("SELECT 1"); return { status: "ready", database: "connected" }; }
  catch { return reply.code(503).send({ status: "not_ready" }); }
});
app.get("/metrics", async (_request, reply) => {
  reply.header("Content-Type", registry.contentType);
  return registry.metrics();
});

// Public first-run and sign-in endpoints. The first administrator is created exactly once.
app.get("/api/v1/setup/status", async () => {
  const result = await pool.query("SELECT EXISTS(SELECT 1 FROM manager_users WHERE role = 'admin') AS admin_exists");
  return { data: { setupRequired: !result.rows[0].admin_exists } };
});

function originMatches(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = forwardedProto === "https" || (Array.isArray(forwardedProto) && forwardedProto.includes("https")) ? "https" : "http";
  const expectedOrigin = request.headers.host ? protocol + "://" + request.headers.host : "";
  return Boolean(expectedOrigin) && origin === expectedOrigin;
}

const bootstrapSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128)
}).strict();

async function issueSession(userId: string, request: FastifyRequest, reply: FastifyReply) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  await pool.query("DELETE FROM manager_sessions WHERE expires_at < now() OR revoked_at IS NOT NULL");
  await pool.query(
    "INSERT INTO manager_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+($4::integer * interval '1 second'))",
    [randomUUID(), userId, tokenHash, SESSION_TTL_SECONDS]
  );
  const forwardedProto = request.headers["x-forwarded-proto"];
  const secure = forwardedProto === "https" || (Array.isArray(forwardedProto) && forwardedProto.includes("https"));
  reply.header("Set-Cookie", sessionCookie(token, secure));
}

app.post("/api/v1/setup/admin", async (request, reply) => {
  if (!originMatches(request)) return reply.code(403).send({ error: { code: "INVALID_ORIGIN", message: "The request origin was not accepted." } });
  const parsed = bootstrapSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: { code: "INVALID_SETUP_INPUT", message: "Enter a valid name, email, and password of at least 12 characters." } });
  }
  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(741902611)");
    const existing = await db.query("SELECT id FROM manager_users WHERE role = 'admin' LIMIT 1");
    if (existing.rowCount) {
      await db.query("ROLLBACK");
      return reply.code(409).send({ error: { code: "SETUP_ALREADY_COMPLETED", message: "Administrator setup has already been completed." } });
    }
    const inserted = await db.query(
      "INSERT INTO manager_users(id,display_name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin') RETURNING id,display_name,email,role,is_active",
      [randomUUID(), name, email, passwordHash]
    );
    await db.query("COMMIT");
    await issueSession(inserted.rows[0].id, request, reply);
    return reply.code(201).send({ data: inserted.rows[0] });
  } catch (error) {
    await db.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      return reply.code(409).send({ error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with that email already exists." } });
    }
    throw error;
  } finally {
    db.release();
  }
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128)
}).strict();
const loginAttempts = new Map<string, { count: number; startedAt: number }>();

app.post("/api/v1/auth/login", async (request, reply) => {
  if (!originMatches(request)) return reply.code(403).send({ error: { code: "INVALID_ORIGIN", message: "The request origin was not accepted." } });
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_LOGIN_INPUT", message: "Enter a valid email and password." } });
  const ip = request.ip + ":" + parsed.data.email.toLowerCase();
  const now = Date.now();
  const attempts = loginAttempts.get(ip);
  if (attempts && now - attempts.startedAt < 15 * 60 * 1000 && attempts.count >= 10) {
    return reply.code(429).send({ error: { code: "LOGIN_RATE_LIMITED", message: "Too many sign-in attempts. Wait 15 minutes and try again." } });
  }
  if (!attempts || now - attempts.startedAt >= 15 * 60 * 1000) loginAttempts.set(ip, { count: 1, startedAt: now });
  else attempts.count += 1;

  const email = parsed.data.email.toLowerCase();
  const result = await pool.query(
    "SELECT id,display_name,email,password_hash,role,is_active FROM manager_users WHERE email=$1 LIMIT 1",
    [email]
  );
  const user = result.rows[0];
  const valid = user && user.is_active && await verifyPassword(parsed.data.password, user.password_hash);
  if (!valid) return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });

  loginAttempts.delete(ip);
  await pool.query("UPDATE manager_users SET last_login_at=now() WHERE id=$1", [user.id]);
  await issueSession(user.id, request, reply);
  return { data: { id: user.id, name: user.display_name, email: user.email, role: user.role } };
});

// All remaining manager API routes require a valid server-side session.
app.addHook("preHandler", async (request, reply) => {
  // First-run status, bootstrap, and login must be reachable without an existing session.
  const publicRoutes = new Set(["/api/v1/setup/status", "/api/v1/setup/admin", "/api/v1/auth/login"]);
  if (publicRoutes.has(request.url.split("?")[0] ?? "")) return;
  if (!request.url.startsWith("/api/v1/")) return;
  const token = readSessionToken(request.headers.cookie ?? "");
  if (!token) return reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to continue." } });
  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT u.id,u.display_name,u.email,u.role,u.is_active,s.id AS session_id
     FROM manager_sessions s JOIN manager_users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active=true LIMIT 1`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return reply.code(401).send({ error: { code: "SESSION_EXPIRED", message: "Your session has expired. Sign in again." } });
  request.managerUser = { id: row.id, display_name: row.display_name, email: row.email, role: row.role, is_active: row.is_active };
  request.managerSessionToken = token;
  const method = request.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !originMatches(request)) {
    return reply.code(403).send({ error: { code: "INVALID_ORIGIN", message: "The request origin was not accepted." } });
  }
  await pool.query("UPDATE manager_sessions SET last_seen_at=now() WHERE id=$1", [row.session_id]);
});

app.get("/api/v1/version", async () => ({ data: { name: "pfSense Hub Manager", version: "0.2.0", apiVersion: "v1" } }));
app.get("/api/v1/auth/me", async request => ({
  data: { id: request.managerUser!.id, name: request.managerUser!.display_name, email: request.managerUser!.email, role: request.managerUser!.role }
}));
app.post("/api/v1/auth/logout", async (request, reply) => {
  if (request.managerSessionToken) {
    await pool.query("UPDATE manager_sessions SET revoked_at=now() WHERE token_hash=$1", [hashSessionToken(request.managerSessionToken)]);
  }
  const secure = request.headers["x-forwarded-proto"] === "https";
  reply.header("Set-Cookie", clearSessionCookie(secure));
  return { data: { loggedOut: true } };
});

app.get("/api/v1/users", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const result = await pool.query("SELECT id,display_name AS name,email,role,is_active AS active,created_at,last_login_at FROM manager_users ORDER BY created_at");
  return { data: result.rows };
});

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
  role: z.enum(["admin", "user"]).default("user")
}).strict();

app.post("/api/v1/users", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = createUserSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_USER_INPUT", message: "Check the name, email, role, and password. Passwords must be at least 12 characters." } });
  try {
    const result = await pool.query(
      "INSERT INTO manager_users(id,display_name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,display_name AS name,email,role,is_active AS active,created_at",
      [randomUUID(), parsed.data.name, parsed.data.email.toLowerCase(), await hashPassword(parsed.data.password), parsed.data.role]
    );
    return reply.code(201).send({ data: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with that email already exists." } });
    throw error;
  }
});

const roleSchema = z.object({ role: z.enum(["admin", "user"]) }).strict();
app.patch("/api/v1/users/:userId/role", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = roleSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_ROLE", message: "Role must be admin or user." } });
  const { userId } = request.params as { userId: string };
  if (userId === request.managerUser!.id && parsed.data.role !== "admin") {
    return reply.code(400).send({ error: { code: "CANNOT_DEMOTE_SELF", message: "You cannot remove your own administrator role." } });
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(741902612)");
    const target = await db.query("SELECT role FROM manager_users WHERE id=$1 FOR UPDATE", [userId]);
    if (!target.rowCount) {
      await db.query("ROLLBACK");
      return reply.code(404).send({ error: { code: "USER_NOT_FOUND", message: "User was not found." } });
    }
    if (parsed.data.role === "user" && target.rows[0].role === "admin") {
      const count = await db.query("SELECT count(*)::int AS count FROM manager_users WHERE role='admin' AND is_active=true");
      if (count.rows[0].count <= 1) {
        await db.query("ROLLBACK");
        return reply.code(409).send({ error: { code: "LAST_ADMIN_REQUIRED", message: "At least one active administrator must remain." } });
      }
    }
    const updated = await db.query("UPDATE manager_users SET role=$1,updated_at=now() WHERE id=$2 RETURNING id,display_name AS name,email,role,is_active AS active", [parsed.data.role, userId]);
    await db.query("COMMIT");
    return { data: updated.rows[0] };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
});

app.get("/api/v1/devices", async () => ({ data: await provider.listDevices() }));
app.get("/api/v1/devices/:deviceId", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  const device = (await provider.listDevices()).find(item => item.id === deviceId);
  if (!device) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: device };
});
async function discoverFirewallCertificate(apiBaseUrl: string) {
  const url = new URL(apiBaseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Firewall URL must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  const port = Number(url.port || 443);
  return await new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: url.hostname,
      port,
      ...(isIP(url.hostname) ? {} : { servername: url.hostname }),
      rejectUnauthorized: false,
      timeout: 5000
    });
    const fail = (error: Error) => { socket.destroy(); reject(new Error(error.message.includes("timeout") ? "TLS certificate discovery timed out." : "Unable to retrieve the firewall TLS certificate.")); };
    socket.once("error", fail);
    socket.once("timeout", () => fail(new Error("timeout")));
    socket.once("secureConnect", () => {
      try {
        const certificate = socket.getPeerCertificate();
        if (!certificate.raw) throw new Error("The firewall did not present a TLS certificate.");
        const subjectAltName = certificate.subjectaltname ?? "";
        const dnsNames = [...subjectAltName.matchAll(/DNS:([^,]+)/g)].map(match => match[1]?.trim()).filter((value): value is string => Boolean(value));
        const ipAddresses = [...subjectAltName.matchAll(/IP Address:([^,]+)/g)].map(match => match[1]?.trim()).filter((value): value is string => Boolean(value));
        resolve({
          subject: certificate.subject,
          issuer: certificate.issuer,
          subjectAltName,
          dnsNames,
          ipAddresses,
          suggestedServername: dnsNames.length === 1 ? dnsNames[0] : null,
          fingerprint256: certificate.fingerprint256 ?? null,
          validTo: certificate.valid_to ?? null
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Unable to inspect the firewall certificate."));
      } finally {
        socket.end();
      }
    });
  });
}

const firewallInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional(),
  edition: z.enum(["plus", "ce", "unknown"]),
  apiBaseUrl: z.string().url().max(500),
  apiKey: z.string().min(1).max(4096),
  caCertificatePem: z.string().max(65536).optional(),
  tlsServername: z.string().trim().min(1).max(253).optional()
}).strict();

app.post("/api/v1/devices/discover-certificate", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = z.object({ apiBaseUrl: z.string().url().max(500) }).strict().safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_FIREWALL_URL", message: "Enter a valid HTTPS firewall URL." } });
  try {
    return { data: await discoverFirewallCertificate(parsed.data.apiBaseUrl) };
  } catch (error) {
    return reply.code(400).send({ error: { code: "CERTIFICATE_DISCOVERY_FAILED", message: error instanceof Error ? error.message : "Unable to discover the firewall certificate." } });
  }
});

app.post("/api/v1/devices/test-connection", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = firewallInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_FIREWALL_INPUT", message: "Check the firewall name, HTTPS API URL, edition, API key, and optional CA certificate." } });
  try {
    const connection = await provider.testConnection(parsed.data);
    return { data: connection };
  } catch (error) {
    return reply.code(400).send({ error: { code: "FIREWALL_CONNECTION_FAILED", message: error instanceof Error ? error.message : "Unable to connect to the firewall." } });
  }
});

app.post("/api/v1/devices", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = firewallInputSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_FIREWALL_INPUT", message: "Check the firewall name, HTTPS API URL, edition, API key, and optional CA certificate." } });
  try {
    const result = await provider.registerDevice(parsed.data);
    return reply.code(201).send({ data: result });
  } catch (error) {
    return reply.code(400).send({ error: { code: "FIREWALL_REGISTRATION_FAILED", message: error instanceof Error ? error.message : "Unable to register the firewall." } });
  }
});

const updateDeviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).nullable(),
  edition: z.enum(["plus", "ce", "unknown"]),
  enabled: z.boolean()
}).strict();

app.patch("/api/v1/devices/:deviceId", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = updateDeviceSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_DEVICE_INPUT", message: "Check the appliance name, location, edition, and enabled status." } });
  const { deviceId } = request.params as { deviceId: string };
  const updated = await provider.updateDevice(deviceId, parsed.data);
  if (!updated) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: updated };
});

const updateDeviceCredentialsSchema = z.object({
  apiKey: z.string().min(1).max(4096),
  caCertificatePem: z.string().max(65536).nullable().optional(),
  tlsServername: z.string().trim().min(1).max(253).nullable().optional()
}).strict();

app.patch("/api/v1/devices/:deviceId/credentials", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const parsed = updateDeviceCredentialsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_CREDENTIAL_INPUT", message: "Enter a valid API key and optional CA certificate and TLS server name." } });
  const { deviceId } = request.params as { deviceId: string };
  try {
    const credentialInput = {
      apiKey: parsed.data.apiKey,
      ...(parsed.data.caCertificatePem !== undefined ? { caCertificatePem: parsed.data.caCertificatePem } : {}),
      ...(parsed.data.tlsServername !== undefined ? { tlsServername: parsed.data.tlsServername } : {})
    };
    const updated = await provider.updateDeviceCredentials(deviceId, credentialInput);
    if (!updated) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    return { data: updated };
  } catch (error) {
    return reply.code(400).send({ error: { code: "CREDENTIAL_UPDATE_FAILED", message: error instanceof Error ? error.message : "Unable to update firewall credentials." } });
  }
});

app.delete("/api/v1/devices/:deviceId", async (request, reply) => {
  if (request.managerUser!.role !== "admin") return reply.code(403).send({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
  const { deviceId } = request.params as { deviceId: string };
  const deleted = await provider.deleteDevice(deviceId);
  if (!deleted) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: { id: deviceId, deleted: true, pollHistoryDeleted: true } };
});

app.get("/api/v1/devices/:deviceId/capabilities", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  const device = (await provider.listDevices()).find(item => item.id === deviceId);
  if (!device) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: await provider.capabilities() };
});
app.get("/api/v1/devices/:deviceId/overview", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  const device = (await provider.listDevices()).find(item => item.id === deviceId);
  if (!device || !device.enabled) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  const started = Date.now();
  const result = await provider.collect(deviceId, (group, outcome, errorClass, durationMs) => {
    polls.inc({ device_id: deviceId, operation_group: group, result: outcome });
    pollDuration.observe({ device_id: deviceId, operation_group: group }, (durationMs ?? 0) / 1000);
    if (outcome === "failure") pollErrors.inc({ device_id: deviceId, operation_group: group, error_class: errorClass ?? "unknown" });
    else lastSuccess.set({ device_id: deviceId }, Date.now() / 1000);
  });
  const failures = result?.failedOperations ?? 8;
  deviceUp.set({ device_id: deviceId }, failures === 0 ? 1 : 0);
  return reply.code(failures === 8 ? 502 : 200).send({
    data: result?.results ?? {},
    meta: { deviceId, outcome: failures === 0 ? "success" : "partial", failedOperations: failures, durationMs: Date.now() - started }
  });
});

app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found." } }));
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Request failed");
  reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId: request.id } });
});

  return app;
}

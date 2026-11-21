import Fastify from "fastify";
import { z } from "zod";
import { loadConfig, loadApiKey, loadEncryptionKey } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { PfSenseClient } from "./pfsense/client.js";
import { PfSenseProvider } from "./pfsense/provider.js";
import { createSession, deleteSession, findSession, hashPassword, verifyPassword } from "./auth.js";
import { registry, requests, requestDuration, polls, pollErrors, pollDuration, deviceUp, lastSuccess } from "./metrics.js";

const config = loadConfig();
const apiKey = await loadApiKey(config.PFSENSE_API_KEY_FILE);
const encryptionKey = await loadEncryptionKey(config.APP_ENCRYPTION_KEY_FILE);
void encryptionKey;
const pool = createPool(config);
await migrate(pool);
const client = new PfSenseClient(config, apiKey);
const provider = new PfSenseProvider(client, config, pool);
await provider.ensureDevice();
const app = Fastify({
  logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.x-api-key", "req.headers.authorization", "req.headers.cookie"] },
  bodyLimit: 65536,
  requestTimeout: 15000
});

const COOKIE_NAME = "pfsense_hub_session";
const usernameSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/);
const passwordSchema = z.string().min(14).max(128);
const setupSchema = z.object({ username: usernameSchema, password: passwordSchema }).strict();
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
const hubSettingsSchema = z.object({
  reachabilityMethod: z.enum(["local", "tailscale", "hostname"]),
  addressType: z.enum(["magic_dns", "tailscale_ip", "hostname", "ip"]).nullable(),
  address: z.string().trim().max(253).nullable(),
  httpsPort: z.number().int().min(1).max(65535)
}).strict();

const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();
function getCookie(request: { headers: { cookie?: string } }): string | null {
  const raw = request.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === COOKIE_NAME) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}
function setSessionCookie(reply: { header: (name: string, value: string) => unknown }, token: string, secure: boolean): void {
  reply.header("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure ? "; Secure" : ""}`);
}
function clearSessionCookie(reply: { header: (name: string, value: string) => unknown }, secure: boolean): void {
  reply.header("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`);
}
async function adminCount(): Promise<number> {
  const result = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM admin_users");
  return Number(result.rows[0]?.count ?? 0);
}

app.addHook("onRequest", async (request, reply) => {
  (request as typeof request & { metricStart?: bigint }).metricStart = process.hrtime.bigint();
  const path = (request.raw.url ?? "").split("?")[0] ?? "";
  if (!path.startsWith("/api/v1/") || path === "/api/v1/version" || path.startsWith("/api/v1/auth/")) return;
  const token = getCookie(request);
  const admin = token ? await findSession(pool, token) : null;
  if (!admin) {
    return reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to access this resource." } });
  }
  (request as typeof request & { admin?: typeof admin }).admin = admin;
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

app.get("/api/v1/auth/status", async () => ({ data: { setupRequired: (await adminCount()) === 0 } }));
app.post("/api/v1/auth/setup", async (request, reply) => {
  const parsed = setupSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_SETUP", message: "Use a 3 to 64 character username and a password of at least 14 characters." } });
  const credentials = await hashPassword(parsed.data.password);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock($1)", [741928362]);
    const existing = await db.query("SELECT 1 FROM admin_users LIMIT 1");
    if (existing.rowCount) {
      await db.query("ROLLBACK");
      return reply.code(409).send({ error: { code: "SETUP_ALREADY_COMPLETED", message: "An administrator account already exists." } });
    }
    const created = await db.query<{ id: string; username: string }>(
      "INSERT INTO admin_users(username,password_hash,password_salt,password_iterations) VALUES($1,$2,$3,$4) RETURNING id,username",
      [parsed.data.username, credentials.hash, credentials.salt, credentials.iterations]
    );
    const user = created.rows[0];
    if (!user) throw new Error("Administrator account creation returned no user.");
    await db.query("COMMIT");
    const token = await createSession(pool, user.id);
    setSessionCookie(reply, token.token, (request.protocol === "https" || request.headers["x-forwarded-proto"] === "https"));
    return reply.code(201).send({ data: { id: user.id, username: user.username } });
  } catch (error) {
    try { await db.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    db.release();
  }
});
app.post("/api/v1/auth/login", async (request, reply) => {
  const ip = request.ip;
  const now = Date.now();
  const attempts = loginAttempts.get(ip);
  if (attempts && now - attempts.windowStartedAt < 15 * 60 * 1000 && attempts.count >= 10) {
    return reply.code(429).send({ error: { code: "LOGIN_RATE_LIMITED", message: "Too many sign-in attempts. Wait 15 minutes and try again." } });
  }
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_LOGIN", message: "Enter a valid username and password." } });
  const found = await pool.query<{ id: string; username: string; password_hash: string; password_salt: string; password_iterations: number }>(
    "SELECT id,username,password_hash,password_salt,password_iterations FROM admin_users WHERE lower(username)=lower($1)",
    [parsed.data.username]
  );
  const user = found.rows[0];
  const valid = user ? await verifyPassword(parsed.data.password, user.password_hash, user.password_salt, user.password_iterations) : false;
  if (!user || !valid) {
    const current = attempts && now - attempts.windowStartedAt < 15 * 60 * 1000 ? attempts : { count: 0, windowStartedAt: now };
    loginAttempts.set(ip, { count: current.count + 1, windowStartedAt: current.windowStartedAt });
    return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Username or password is incorrect." } });
  }
  loginAttempts.delete(ip);
  const session = await createSession(pool, user.id);
  setSessionCookie(reply, session.token, request.protocol === "https");
  return { data: { id: user.id, username: user.username } };
});
app.post("/api/v1/auth/logout", async (request, reply) => {
  const token = getCookie(request);
  if (token) await deleteSession(pool, token);
  clearSessionCookie(reply, request.protocol === "https");
  return { data: { signedOut: true } };
});
app.get("/api/v1/auth/me", async (request, reply) => {
  const token = getCookie(request);
  const admin = token ? await findSession(pool, token) : null;
  if (!admin) return reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to continue." } });
  return { data: admin };
});

app.get("/api/v1/hub-settings", async () => {
  const result = await pool.query(
    "SELECT reachability_method AS \"reachabilityMethod\", address_type AS \"addressType\", address, https_port AS \"httpsPort\", updated_at AS \"updatedAt\" FROM hub_settings WHERE id=1"
  );
  return { data: result.rows[0] ?? { reachabilityMethod: "local", addressType: null, address: null, httpsPort: 443 } };
});
app.put("/api/v1/hub-settings", async (request, reply) => {
  const parsed = hubSettingsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_HUB_SETTINGS", message: "Check the reachability method, address type, address, and HTTPS port." } });
  const value = parsed.data;
  if (value.reachabilityMethod === "local" && (value.addressType !== null || value.address !== null)) {
    return reply.code(400).send({ error: { code: "INVALID_HUB_SETTINGS", message: "Local access uses the default local binding and does not need an address." } });
  }
  if (value.reachabilityMethod !== "local" && (!value.addressType || !value.address)) {
    return reply.code(400).send({ error: { code: "INVALID_HUB_SETTINGS", message: "An address is required for the selected optional reachability method." } });
  }
  if (value.addressType === "tailscale_ip" && !z.string().ip({ version: "v4" }).safeParse(value.address).success) {
    return reply.code(400).send({ error: { code: "INVALID_HUB_SETTINGS", message: "Enter a valid Tailscale IPv4 address." } });
  }
  if (value.addressType === "magic_dns" && (!value.address?.includes(".") || /\s/.test(value.address))) {
    return reply.code(400).send({ error: { code: "INVALID_HUB_SETTINGS", message: "Enter the MagicDNS hostname assigned to the device." } });
  }
  const admin = (request as typeof request & { admin?: { id: string } }).admin;
  const result = await pool.query(
    `UPDATE hub_settings SET reachability_method=$1,address_type=$2,address=$3,https_port=$4,updated_at=now(),updated_by=$5
      WHERE id=1
      RETURNING reachability_method AS "reachabilityMethod",address_type AS "addressType",address,https_port AS "httpsPort",updated_at AS "updatedAt"`,
    [value.reachabilityMethod, value.addressType, value.address, value.httpsPort, admin?.id ?? null]
  );
  return { data: { ...result.rows[0], applyStatus: "not_applied", note: "Saved as a preference only. This does not change Docker host bindings, DNS, Tailscale, or firewall reachability." } };
});

app.get("/metrics", async (_request, reply) => {
  reply.header("Content-Type", registry.contentType);
  return registry.metrics();
});
app.get("/api/v1/version", async () => ({ data: { name: "pfSense Hub Manager", version: "0.1.0", apiVersion: "v1" } }));
app.get("/api/v1/devices", async () => ({ data: await provider.listDevices() }));
app.get("/api/v1/devices/:deviceId", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  const device = (await provider.listDevices()).find(item => item.id === deviceId);
  if (!device) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: device };
});
app.get("/api/v1/devices/:deviceId/capabilities", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  if (deviceId !== config.PFSENSE_DEVICE_ID) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: await provider.capabilities() };
});
app.get("/api/v1/devices/:deviceId/overview", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  if (deviceId !== config.PFSENSE_DEVICE_ID) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  const started = Date.now();
  const result = await provider.collect(deviceId, (group, outcome, errorClass, durationMs) => {
    polls.inc({ device_id: deviceId, operation_group: group, result: outcome });
    pollDuration.observe({ device_id: deviceId, operation_group: group }, (durationMs ?? 0) / 1000);
    if (outcome === "failure") pollErrors.inc({ device_id: deviceId, operation_group: group, error_class: errorClass ?? "unknown" });
    else lastSuccess.set({ device_id: deviceId }, Date.now() / 1000);
  });
  const failures = result?.failedOperations ?? 8;
  deviceUp.set({ device_id: deviceId }, failures === 0 ? 1 : 0);
  return reply.code(failures === 8 ? 502 : 200).send({ data: result?.results ?? {}, meta: { deviceId, outcome: failures === 0 ? "success" : "partial", failedOperations: failures, durationMs: Date.now() - started } });
});
app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found." } }));
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Request failed");
  reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId: request.id } });
});
await app.listen({ host: config.HOST, port: config.PORT });
app.log.info("pfSense Hub Manager API started");
const shutdown = async () => { await app.close(); await client.close(); await pool.end(); };
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadConfig, loadApiKey, loadEncryptionKey } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { DevicePfSenseClientFactory } from "./pfsense/device-client-factory.js";
import { PfSenseProvider } from "./pfsense/provider.js";
import { DeviceRepository } from "./devices/device-repository.js";
import { registerDeviceAdminRoutes } from "./devices/admin-routes.js";
import { authorizationFailure, createSession, deleteSession, findSession, hashPassword, verifyPassword, type AdminUser } from "./auth.js";
import { registry, requests, requestDuration, polls, pollErrors, pollDuration, deviceUp, lastSuccess } from "./metrics.js";
import { appendAudit, upsertAlert } from "./audit.js";
import { hubAccessEndpointsSchema } from "./hub-settings.js";
import { dispatchHubDeployment } from "./hub-deployment-service.js";

const config = loadConfig();
const apiKey = await loadApiKey(config.PFSENSE_API_KEY_FILE);
const encryptionKey = await loadEncryptionKey(config.APP_ENCRYPTION_KEY_FILE);
const deploymentAgentToken = config.HUB_DEPLOYMENT_AGENT_TOKEN ?? null;
const pool = createPool(config);
await migrate(pool);
const devices = new DeviceRepository(pool, encryptionKey);
const clientFactory = new DevicePfSenseClientFactory(config, devices);
const provider = new PfSenseProvider(clientFactory, devices, config, apiKey, pool);
await provider.ensureDevice();
const app = Fastify({
  logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.x-api-key", "req.headers.authorization", "req.headers.cookie"] },
  bodyLimit: 65536,
  requestTimeout: 15000
});

const COOKIE_NAME = "pfsense_hub_session";
const usernameSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/);
const passwordSchema = z.string().min(14).max(128);
const userCreateSchema = z.object({ username: usernameSchema, password: passwordSchema, role: z.enum(["admin", "user"]) }).strict();
const userUpdateSchema = z.object({ role: z.enum(["admin", "user"]).optional(), isActive: z.boolean().optional(), password: passwordSchema.optional() }).strict().refine(v => Object.keys(v).length > 0);
const setupSchema = z.object({ username: usernameSchema, password: passwordSchema }).strict();
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();
function getCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === COOKIE_NAME) {
      try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
    }
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

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = (request as typeof request & { admin?: AdminUser }).admin ?? null;
  const failure = authorizationFailure(user);
  if (failure === 401) {
    await reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to access this resource." } });
    return;
  }
  if (failure === 403) {
    await reply.code(403).send({ error: { code: "ADMINISTRATOR_REQUIRED", message: "Administrator permissions are required for this operation." } });
  }
}

app.addHook("onRequest", async (request, reply) => {
  (request as typeof request & { metricStart?: bigint }).metricStart = process.hrtime.bigint();
  const path = (request.raw.url ?? "").split("?")[0] ?? "";
  if (path === "/api/v1/internal/host-deployment-config" && request.method === "GET") {
    const authorization = request.headers.authorization ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const expected = deploymentAgentToken ?? "";
    const valid = Boolean(expected) && Buffer.byteLength(supplied) === Buffer.byteLength(expected)
      && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!valid) return reply.code(401).send({ error: { code: "HOST_AGENT_AUTHENTICATION_REQUIRED" } });
    return;
  }
  if (!path.startsWith("/api/v1/") || path === "/api/v1/version" || path.startsWith("/api/v1/auth/")) return;
  const token = getCookie(request.headers.cookie);
  const admin = token ? await findSession(pool, token) : null;
  if (!admin) {
    return reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to access this resource." } });
  }
  (request as typeof request & { admin?: typeof admin }).admin = admin;
});

// Keep operational and user-administration API namespaces administrator-only.
app.addHook("preHandler", async (request, reply) => {
  const path = (request.raw.url ?? "").split("?")[0] ?? "";
  const adminOnly = path === "/api/v1/system/operations"
    || path.startsWith("/api/v1/system/operations/")
    || path === "/api/v1/users"
    || path.startsWith("/api/v1/users/")
    || path === "/api/v1/audit" || path.startsWith("/api/v1/audit/")
    || (path === "/api/v1/hub-settings/access-endpoints" && request.method === "PUT")
    || path.startsWith("/api/v1/hub-settings/deployments")
    || (path.startsWith("/api/v1/alerts/") && request.method !== "GET")
    || (path === "/api/v1/devices" && request.method !== "GET")
    || (path.startsWith("/api/v1/devices/") && (request.method !== "GET" || path.endsWith("/connection-test")));
  if (adminOnly) await requireAdmin(request, reply);
});

app.addHook("onResponse", async (request, reply) => {
  const route = request.routeOptions.url ?? "unmatched";
  const start = (request as typeof request & { metricStart?: bigint }).metricStart ?? process.hrtime.bigint();
  requests.inc({ method: request.method, route, status: String(reply.statusCode) });
  if (reply.statusCode === 401 || reply.statusCode === 403) { const actor = (request as typeof request & { admin?: AdminUser }).admin; void appendAudit(pool, { actorId: actor?.id ?? null, actorUsername: actor?.username ?? null, actorType: actor ? "user" : "anonymous", action: reply.statusCode === 403 ? "auth.access_denied" : "auth.authentication_required", outcome: "denied", summary: "Protected API request was denied", requestId: request.id, metadata: { method: request.method, route } }).catch(() => undefined); }
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
    const created = await db.query<{ id: string; username: string; role: "admin" | "user" }>(
      "INSERT INTO admin_users(username,password_hash,password_salt,password_iterations) VALUES($1,$2,$3,$4) RETURNING id,username,role",
      [parsed.data.username, credentials.hash, credentials.salt, credentials.iterations]
    );
    const user = created.rows[0];
    if (!user) throw new Error("Administrator account creation returned no user.");
    await db.query("COMMIT");
    const token = await createSession(pool, user.id);
    await appendAudit(pool, { actorId: user.id, actorUsername: user.username, action: "auth.setup", outcome: "success", summary: "Initial administrator account created", requestId: request.id });
    setSessionCookie(reply, token.token, ((request.protocol === "https" || request.headers["x-forwarded-proto"] === "https") || request.headers["x-forwarded-proto"] === "https"));
    return reply.code(201).send({ data: { id: user.id, username: user.username, role: user.role } });
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
  const found = await pool.query<{ id: string; username: string; role: "admin" | "user"; is_active: boolean; password_hash: string; password_salt: string; password_iterations: number }>(
    "SELECT id,username,role,is_active,password_hash,password_salt,password_iterations FROM admin_users WHERE lower(username)=lower($1)",
    [parsed.data.username]
  );
  const user = found.rows[0];
  const valid = user ? await verifyPassword(parsed.data.password, user.password_hash, user.password_salt, user.password_iterations) : false;
  if (!user || !user.is_active || !valid) {
    await appendAudit(pool, { actorType: "anonymous", actorUsername: parsed.data.username, action: "auth.login", outcome: "failure", summary: "Sign-in failed", requestId: request.id });
    const current = attempts && now - attempts.windowStartedAt < 15 * 60 * 1000 ? attempts : { count: 0, windowStartedAt: now };
    loginAttempts.set(ip, { count: current.count + 1, windowStartedAt: current.windowStartedAt });
    return reply.code(401).send({ error: { code: "INVALID_CREDENTIALS", message: "Username or password is incorrect." } });
  }
  loginAttempts.delete(ip);
  await appendAudit(pool, { actorId: user.id, actorUsername: user.username, action: "auth.login", outcome: "success", summary: "User signed in", requestId: request.id });
  const session = await createSession(pool, user.id);
  setSessionCookie(reply, session.token, (request.protocol === "https" || request.headers["x-forwarded-proto"] === "https"));
  return { data: { id: user.id, username: user.username, role: user.role } };
});
app.post("/api/v1/auth/logout", async (request, reply) => {
  const token = getCookie(request.headers.cookie);
  if (token) { const user = await findSession(pool, token); if (user) await appendAudit(pool, { actorId: user.id, actorUsername: user.username, action: "auth.logout", outcome: "success", summary: "User signed out", requestId: request.id }); await deleteSession(pool, token); }
  clearSessionCookie(reply, (request.protocol === "https" || request.headers["x-forwarded-proto"] === "https"));
  return { data: { signedOut: true } };
});
app.get("/api/v1/auth/me", async (request, reply) => {
  const token = getCookie(request.headers.cookie);
  const admin = token ? await findSession(pool, token) : null;
  if (!admin) return reply.code(401).send({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to continue." } });
  return { data: admin };
});


app.get("/api/v1/users", async (request) => {
  const query = z.object({ search: z.string().trim().max(100).optional() }).safeParse(request.query);
  const search = query.success ? query.data.search ?? "" : "";
  const result = await pool.query(
    `SELECT id,username,role,is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt"
       FROM admin_users
      WHERE ($1 = '' OR username ILIKE '%' || $1 || '%')
      ORDER BY lower(username)`, [search]
  );
  return { data: result.rows };
});
app.post("/api/v1/users", async (request, reply) => {
  const parsed = userCreateSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_USER", message: "Provide a valid username, a password of at least 14 characters, and a supported role." } });
  const actor = (request as typeof request & { admin: AdminUser }).admin;
  const credentials = await hashPassword(parsed.data.password);
  try {
    const result = await pool.query(
      `INSERT INTO admin_users(username,password_hash,password_salt,password_iterations,role)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id,username,role,is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt"`,
      [parsed.data.username,credentials.hash,credentials.salt,credentials.iterations,parsed.data.role]
    );
    const created = result.rows[0];
    await appendAudit(pool, { actorId: actor.id, actorUsername: actor.username, action: "user.create", outcome: "success", targetType: "user", targetId: created.id, summary: "Created manager user", metadata: { username: created.username, role: created.role }, requestId: request.id });
    return reply.code(201).send({ data: created });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: { code: "USERNAME_EXISTS", message: "That username is already in use." } });
    throw error;
  }
});
app.patch("/api/v1/users/:userId", async (request, reply) => {
  const parsed = userUpdateSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_USER_UPDATE", message: "Provide at least one valid account change." } });
  const { userId } = request.params as { userId: string };
  if (!z.string().uuid().safeParse(userId).success) return reply.code(400).send({ error: { code: "INVALID_USER_ID", message: "Invalid user identifier." } });
  const actor = (request as typeof request & { admin: AdminUser }).admin;
  if (userId === actor.id) return reply.code(409).send({ error: { code: "SELF_ACCOUNT_PROTECTED", message: "You cannot change your own administrator account from User Management. Use the account security workflow instead." } });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock($1)", [741928363]);
    const current = await db.query<{ id:string; username:string; role:"admin"|"user"; is_active:boolean }>(
      "SELECT id,username,role,is_active FROM admin_users WHERE id=$1 FOR UPDATE", [userId]
    );
    const target = current.rows[0];
    if (!target) { await db.query("ROLLBACK"); return reply.code(404).send({ error: { code: "USER_NOT_FOUND", message: "User was not found." } }); }
    const nextRole = parsed.data.role ?? target.role;
    const nextActive = parsed.data.isActive ?? target.is_active;
    if (target.role === "admin" && target.is_active && (nextRole !== "admin" || !nextActive)) {
      const count = await db.query<{ count:string }>("SELECT count(*)::text AS count FROM admin_users WHERE role='admin' AND is_active=true");
      if (Number(count.rows[0]?.count ?? 0) <= 1) { await db.query("ROLLBACK"); return reply.code(409).send({ error: { code: "LAST_ACTIVE_ADMIN", message: "The last active administrator cannot be disabled or demoted." } }); }
    }
    let result;
    if (parsed.data.password) {
      const credentials = await hashPassword(parsed.data.password);
      result = await db.query(
        `UPDATE admin_users SET role=$2,is_active=$3,password_hash=$4,password_salt=$5,password_iterations=$6,updated_at=now()
         WHERE id=$1 RETURNING id,username,role,is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt"`,
        [userId,nextRole,nextActive,credentials.hash,credentials.salt,credentials.iterations]
      );
    } else {
      result = await db.query(
        `UPDATE admin_users SET role=$2,is_active=$3,updated_at=now()
         WHERE id=$1 RETURNING id,username,role,is_active AS "isActive",created_at AS "createdAt",updated_at AS "updatedAt"`,
        [userId,nextRole,nextActive]
      );
    }
    if (target.role !== nextRole || target.is_active !== nextActive || parsed.data.password) await db.query("DELETE FROM admin_sessions WHERE admin_user_id=$1", [userId]);
    await db.query("COMMIT");
    await appendAudit(pool, { actorId: actor.id, actorUsername: actor.username, action: "user.update", outcome: "success", targetType: "user", targetId: userId, summary: "Updated manager user", metadata: { roleChanged: target.role !== nextRole, activeChanged: target.is_active !== nextActive, passwordReset: Boolean(parsed.data.password) }, requestId: request.id });
    return { data: result.rows[0] };
  } catch (error) {
    try { await db.query("ROLLBACK"); } catch { /* transaction already closed */ }
    throw error;
  } finally { db.release(); }
});
app.get("/api/v1/audit", async (request) => {
  const parsed = z.object({ search:z.string().trim().max(100).optional(), limit:z.coerce.number().int().min(1).max(200).default(100) }).safeParse(request.query);
  const search = parsed.success ? parsed.data.search ?? "" : "";
  const limit = parsed.success ? parsed.data.limit : 100;
  const result = await pool.query(
    `SELECT id,occurred_at AS "occurredAt",actor_username AS "actorUsername",actor_type AS "actorType",
      action,outcome,target_type AS "targetType",target_id AS "targetId",summary,request_id AS "requestId",metadata
     FROM audit_events
     WHERE ($1='' OR actor_username ILIKE '%' || $1 || '%' OR action ILIKE '%' || $1 || '%' OR summary ILIKE '%' || $1 || '%')
     ORDER BY occurred_at DESC,id DESC LIMIT $2`, [search,limit]
  );
  return { data: result.rows };
});
app.get("/api/v1/alerts", async (request) => {
  const parsed = z.object({ status:z.enum(["active","acknowledged","resolved","all"]).default("all"), severity:z.enum(["critical","warning","info"]).optional() }).safeParse(request.query);
  const status = parsed.success ? parsed.data.status : "all";
  const severity = parsed.success ? parsed.data.severity ?? null : null;
  const result = await pool.query(
    `SELECT a.id,a.severity,a.title,a.message,a.source,a.resource_type AS "resourceType",a.resource_id AS "resourceId",
      a.status,a.first_seen_at AS "firstSeenAt",a.last_seen_at AS "lastSeenAt",a.occurrence_count AS "occurrenceCount",
      a.acknowledged_at AS "acknowledgedAt",u.username AS "acknowledgedBy",a.resolved_at AS "resolvedAt",r.username AS "resolvedBy"
     FROM alerts a LEFT JOIN admin_users u ON u.id=a.acknowledged_by LEFT JOIN admin_users r ON r.id=a.resolved_by
     WHERE ($1='all' OR a.status=$1) AND ($2::text IS NULL OR a.severity=$2)
     ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,a.last_seen_at DESC LIMIT 250`, [status,severity]
  );
  return { data: result.rows };
});
app.post("/api/v1/alerts/:alertId/acknowledge", async (request, reply) => {
  const { alertId } = request.params as { alertId:string };
  const actor = (request as typeof request & { admin: AdminUser }).admin;
  const result = await pool.query(
    `UPDATE alerts SET status='acknowledged',acknowledged_at=now(),acknowledged_by=$2
      WHERE id=$1 AND status='active' RETURNING id`, [alertId,actor.id]
  );
  if (!result.rowCount) return reply.code(409).send({ error: { code:"ALERT_NOT_ACTIVE",message:"Alert is not active or no longer exists." } });
  await appendAudit(pool,{actorId:actor.id,actorUsername:actor.username,action:"alert.acknowledge",outcome:"success",targetType:"alert",targetId:alertId,summary:"Acknowledged alert",requestId:request.id});
  return { data:{ acknowledged:true } };
});
app.post("/api/v1/alerts/:alertId/resolve", async (request, reply) => {
  const { alertId } = request.params as { alertId:string };
  const actor = (request as typeof request & { admin: AdminUser }).admin;
  const result = await pool.query(
    `UPDATE alerts SET status='resolved',resolved_at=now(),resolved_by=$2
      WHERE id=$1 AND status IN ('active','acknowledged') RETURNING id`, [alertId,actor.id]
  );
  if (!result.rowCount) return reply.code(409).send({ error: { code:"ALERT_NOT_OPEN",message:"Alert is already resolved or no longer exists." } });
  await appendAudit(pool,{actorId:actor.id,actorUsername:actor.username,action:"alert.resolve",outcome:"success",targetType:"alert",targetId:alertId,summary:"Resolved alert",requestId:request.id});
  return { data:{ resolved:true } };
});

app.get("/api/v1/internal/host-deployment-config", async (request, reply) => {
  if (!deploymentAgentToken) return reply.code(503).send({ error: { code: "HOST_AGENT_NOT_CONFIGURED" } });
  const parsed = z.object({
    deploymentId: z.string().uuid(),
    desiredRevision: z.coerce.number().int().min(1)
  }).strict().safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_DEPLOYMENT_REQUEST" } });
  const deployment = await pool.query<{ id: string; desired_revision: number; requested_method: "local" | "tailscale" | "hostname"; state: string }>(
    `SELECT id,desired_revision,requested_method,state FROM hub_access_deployments
      WHERE id=$1 AND desired_revision=$2`,
    [parsed.data.deploymentId, parsed.data.desiredRevision]
  );
  const row = deployment.rows[0];
  if (!row || !["validating", "applying", "verifying"].includes(row.state)) {
    return reply.code(409).send({ error: { code: "DEPLOYMENT_NOT_CURRENT" } });
  }
  const state = await pool.query<{ desired_revision: number }>(
    "SELECT desired_revision FROM hub_access_deployment_state WHERE id=1"
  );
  if (Number(state.rows[0]?.desired_revision) !== parsed.data.desiredRevision) {
    return reply.code(409).send({ error: { code: "STALE_DEPLOYMENT" } });
  }
  const endpoints = await pool.query<{
    method: "local" | "tailscale" | "hostname";
    address_type: string | null;
    address: string | null;
    https_port: number;
    enabled: boolean;
  }>(
    `SELECT method,address_type,address,https_port,enabled FROM hub_access_endpoints
      WHERE method=$1`,
    [row.requested_method]
  );
  const endpoint = endpoints.rows[0];
  if (!endpoint || !endpoint.enabled) return reply.code(409).send({ error: { code: "DEPLOYMENT_ENDPOINT_INVALID" } });
  return { data: {
    deploymentId: row.id,
    desiredRevision: row.desired_revision,
    method: endpoint.method,
    scheme: "https",
    addressType: endpoint.address_type,
    address: endpoint.address,
    port: endpoint.https_port
  } };
});

app.get("/api/v1/hub-settings", async () => {
  const [endpointResult, stateResult] = await Promise.all([
    pool.query(
      'SELECT method, address_type AS "addressType", address, https_port AS "httpsPort", enabled, updated_at AS "updatedAt" FROM hub_access_endpoints ORDER BY CASE method WHEN \'local\' THEN 1 WHEN \'tailscale\' THEN 2 ELSE 3 END'
    ),
    pool.query(
      'SELECT desired_revision AS "desiredRevision", applied_revision AS "appliedRevision", updated_at AS "updatedAt", applied_at AS "appliedAt" FROM hub_access_deployment_state WHERE id=1'
    )
  ]);
  const deployment = stateResult.rows[0] ?? { desiredRevision: 1, appliedRevision: 0, updatedAt: null, appliedAt: null };
  const [latest, previousSuccess] = await Promise.all([
    pool.query(
      `SELECT id,state,safe_error_code AS "errorCode",applied_origin AS "appliedOrigin",
          rollback_succeeded AS "rollbackSucceeded",created_at AS "createdAt",finished_at AS "finishedAt"
         FROM hub_access_deployments ORDER BY desired_revision DESC LIMIT 1`
    ),
    pool.query<{ appliedOrigin: string }>(
      `SELECT applied_origin AS "appliedOrigin" FROM hub_access_deployments
        WHERE state='succeeded' AND applied_origin IS NOT NULL
        ORDER BY desired_revision DESC LIMIT 1`
    )
  ]);
  return { data: {
    endpoints: endpointResult.rows,
    deployment: {
      ...deployment,
      status: Number(deployment.desiredRevision) === Number(deployment.appliedRevision) ? "applied" : (latest.rows[0]?.state ?? "pending"),
      latest: latest.rows[0] ?? null,
      previousAppliedOrigin: previousSuccess.rows[0]?.appliedOrigin ?? null
    }
  } };
});

app.put("/api/v1/hub-settings/access-endpoints", async (request, reply) => {
  const parsed = hubAccessEndpointsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_HUB_ACCESS_ENDPOINTS", message: parsed.error.issues[0]?.message ?? "Check each access method, address, and HTTPS port." } });
  const admin = (request as typeof request & { admin?: AdminUser }).admin;
  const db = await pool.connect();
  let revision = 1;
  let appliedRevision = 0;
  let deploymentId = "";
  try {
    await db.query("BEGIN");
    await db.query("DELETE FROM hub_access_endpoints");
    for (const endpoint of parsed.data.endpoints) {
      await db.query(
        `INSERT INTO hub_access_endpoints(method,address_type,address,https_port,enabled,updated_at,updated_by)
         VALUES($1,$2,$3,$4,$5,now(),$6)`,
        [endpoint.method, endpoint.addressType, endpoint.address, endpoint.httpsPort, endpoint.enabled, admin?.id ?? null]
      );
    }
    const state = await db.query<{ desiredRevision: number; appliedRevision: number }>(
      'UPDATE hub_access_deployment_state SET desired_revision=desired_revision+1,updated_at=now(),updated_by=$1 WHERE id=1 RETURNING desired_revision AS "desiredRevision", applied_revision AS "appliedRevision"',
      [admin?.id ?? null]
    );
    revision = Number(state.rows[0]?.desiredRevision ?? 1);
    appliedRevision = Number(state.rows[0]?.appliedRevision ?? 0);
    const selectedMethod = parsed.data.endpoints.find(endpoint => endpoint.enabled)?.method;
    if (!selectedMethod) throw new Error("No active Hub access method was selected.");
    const deployment = await db.query<{ id: string }>(
      `INSERT INTO hub_access_deployments(desired_revision,requested_method,state,actor_id)
       VALUES($1,$2,'queued',$3) RETURNING id`,
      [revision, selectedMethod, admin?.id ?? null]
    );
    deploymentId = deployment.rows[0]?.id ?? "";
    if (!deploymentId) throw new Error("Deployment queue record was not created.");
    await db.query("COMMIT");
  } catch (error) {
    try { await db.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    db.release();
  }
  await appendAudit(pool, {
    actorId: admin?.id ?? null,
    actorUsername: admin?.username ?? null,
    action: "hub.access_endpoints.update",
    outcome: "success",
    targetType: "hub_access_endpoints",
    summary: "Updated Hub access endpoints",
    requestId: request.id,
    metadata: { methods: parsed.data.endpoints.map(endpoint => endpoint.method), enabledCount: parsed.data.endpoints.filter(endpoint => endpoint.enabled).length, desiredRevision: revision, deploymentId }
  });
  void dispatchHubDeployment(pool, { id: deploymentId, desired_revision: revision }, {
    socketPath: config.HUB_DEPLOYMENT_AGENT_SOCKET || null
  }).catch(() => undefined);
  return { data: { endpoints: parsed.data.endpoints, deploymentId, desiredRevision: revision, appliedRevision, deploymentStatus: "queued" } };
});

app.get("/api/v1/hub-settings/deployments", async (request) => {
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(request.query);
  const limit = parsed.success ? parsed.data.limit : 20;
  const result = await pool.query(
    `SELECT id,desired_revision AS "desiredRevision",requested_method AS "requestedMethod",
        state,safe_error_code AS "errorCode",applied_origin AS "appliedOrigin",
        rollback_succeeded AS "rollbackSucceeded",created_at AS "createdAt",
        started_at AS "startedAt",finished_at AS "finishedAt"
       FROM hub_access_deployments ORDER BY desired_revision DESC LIMIT $1`,
    [limit]
  );
  return { data: result.rows };
});

app.get("/api/v1/hub-settings/deployments/:deploymentId", async (request, reply) => {
  const { deploymentId } = request.params as { deploymentId: string };
  if (!z.string().uuid().safeParse(deploymentId).success) {
    return reply.code(400).send({ error: { code: "INVALID_DEPLOYMENT_ID", message: "Invalid deployment identifier." } });
  }
  const result = await pool.query(
    `SELECT id,desired_revision AS "desiredRevision",requested_method AS "requestedMethod",
        state,safe_error_code AS "errorCode",applied_origin AS "appliedOrigin",
        rollback_succeeded AS "rollbackSucceeded",created_at AS "createdAt",
        started_at AS "startedAt",finished_at AS "finishedAt"
       FROM hub_access_deployments WHERE id=$1`,
    [deploymentId]
  );
  if (!result.rowCount) return reply.code(404).send({ error: { code: "DEPLOYMENT_NOT_FOUND", message: "Deployment was not found." } });
  return { data: result.rows[0] };
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
  const device = (await provider.listDevices()).find(item => item.id === deviceId);
  if (!device || device.isDemo) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  return { data: await provider.capabilities() };
});
app.get("/api/v1/devices/:deviceId/overview", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  const device = (await provider.listDevices()).find(item => item.id === deviceId);
  if (!device || device.isDemo) return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
  if (!device.enabled) return reply.code(409).send({ error: { code: "DEVICE_DISABLED", message: "Enable this firewall before requesting live status." } });
  const started = Date.now();
  const result = await provider.collect(deviceId, (group, outcome, errorClass, durationMs) => {
    polls.inc({ device_id: deviceId, operation_group: group, result: outcome });
    pollDuration.observe({ device_id: deviceId, operation_group: group }, (durationMs ?? 0) / 1000);
    if (outcome === "failure") pollErrors.inc({ device_id: deviceId, operation_group: group, error_class: errorClass ?? "unknown" });
    else lastSuccess.set({ device_id: deviceId }, Date.now() / 1000);
  });
  if (!result) return reply.code(409).send({ error: { code: "DEVICE_UNAVAILABLE", message: "The firewall is no longer available for polling." } });
  const failures = result.failedOperations;
  if (failures > 0) {
    await upsertAlert(pool, {
      deduplicationKey: "device-poll:" + deviceId,
      severity: failures === 8 ? "critical" : "warning",
      title: failures === 8 ? "Firewall is unreachable" : "Firewall polling is degraded",
      message: failures + " of 8 read-only status operations failed. Review the integration and network path.",
      source: "pfSense integration",
      resourceType: "device",
      resourceId: deviceId
    });
  } else {
    const resolved = await pool.query(
      `UPDATE alerts SET status='resolved',resolved_at=now(),last_seen_at=now()
        WHERE deduplication_key='device-poll:' || $1 AND status IN ('active','acknowledged') RETURNING id`, [deviceId]
    );
    if (resolved.rowCount) await appendAudit(pool, { actorType: "system", action: "alert.auto_resolve", outcome: "success", targetType: "device", targetId: deviceId, summary: "Automatically resolved recovered firewall polling alert", metadata: { resolvedCount: resolved.rowCount }, requestId: request.id });
  }
  deviceUp.set({ device_id: deviceId }, failures === 0 ? 1 : 0);
  return reply.code(failures === 8 ? 502 : 200).send({ data: result?.results ?? {}, meta: { deviceId, outcome: failures === 0 ? "success" : "partial", failedOperations: failures, durationMs: Date.now() - started } });
});
await registerDeviceAdminRoutes(app, { devices, clientFactory, pool });

app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found." } }));
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Request failed");
  const requestError = error as Error & { statusCode?: number; code?: string };
  const statusCode = typeof requestError.statusCode === "number" && requestError.statusCode >= 400 && requestError.statusCode <= 599 ? requestError.statusCode : 500;
  const isClientError = statusCode < 500;
  reply.code(statusCode).send({ error: {
    code: isClientError && typeof requestError.code === "string" ? requestError.code : "INTERNAL_ERROR",
    message: isClientError ? requestError.message : "The request could not be completed.",
    requestId: request.id
  } });
});
await app.listen({ host: config.HOST, port: config.PORT });
app.log.info("pfSense Hub Manager API started");
const shutdown = async () => { await app.close(); await pool.end(); };
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

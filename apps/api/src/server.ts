import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { loadConfig, loadApiKey } from "./config.js";
import { createPool } from "./db/pool.js";
import { PfSenseClient } from "./pfsense/client.js";
import { PfSenseProvider } from "./pfsense/provider.js";
import { registry, requests, requestDuration, polls, pollErrors, pollDuration, deviceUp, lastSuccess } from "./metrics.js";

const config = loadConfig();
const apiKey = await loadApiKey(config.PFSENSE_API_KEY_FILE);
const pool = createPool(config);
const client = new PfSenseClient(config, apiKey);
const provider = new PfSenseProvider(client, config, pool);
const app = Fastify({ logger: { level: config.NODE_ENV === "production" ? "info" : "debug", redact: ["req.headers.x-api-key", "req.headers.authorization"] }, bodyLimit: 64 * 1024, requestTimeout: 15000 });

app.addHook("onRequest", async (request) => {
  request.id = request.id || randomUUID();
  (request as typeof request & { metricStart?: bigint }).metricStart = process.hrtime.bigint();
});
app.addHook("onResponse", async (request, reply) => {
  const route = request.routeOptions.url ?? "unmatched";
  const elapsed = Number(process.hrtime.bigint() - ((request as typeof request & { metricStart?: bigint }).metricStart ?? process.hrtime.bigint())) / 1e9;
  requests.inc({ method: request.method, route, status: String(reply.statusCode) });
  requestDuration.observe({ method: request.method, route }, elapsed);
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

app.get("/api/v1/version", async () => ({ data: { name: "pfSense Hub Manager", version: "0.1.0", apiVersion: "v1" } }));
app.get("/api/v1/devices", async () => ({ data: await provider.listDevices() }));
app.get("/api/v1/devices/:deviceId", async (request, reply) => {
  const { deviceId } = request.params as { deviceId: string };
  const devices = await provider.listDevices();
  const device = devices.find((item) => item.id === deviceId);
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
  let failures = 0;
  const overview = await provider.collect(deviceId, (group, result, errorClass, durationMs) => {
    polls.inc({ device_id: deviceId, operation_group: group, result });
    pollDuration.observe({ device_id: deviceId, operation_group: group }, (durationMs ?? 0) / 1000);
    if (result === "failure") {
      failures++;
      pollErrors.inc({ device_id: deviceId, operation_group: group, error_class: errorClass ?? "unknown" });
    } else {
      lastSuccess.set({ device_id: deviceId }, Date.now() / 1000);
    }
  });
  deviceUp.set({ device_id: deviceId }, failures === 0 ? 1 : 0);
  return reply.code(failures === 8 ? 502 : 200).send({
    data: overview,
    meta: { deviceId, outcome: failures === 0 ? "success" : "partial", failedOperations: failures, durationMs: Date.now() - started }
  });
});
app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found." } }));
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "Request failed");
  reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed.", requestId: request.id } });
});

await provider.ensureDevice();
await app.listen({ host: config.HOST, port: config.PORT });
app.log.info("pfSense Hub Manager API started");
const shutdown = async () => {
  await app.close();
  await client.close();
  await pool.end();
};
process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

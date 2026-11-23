import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { registerHostSystemRoutes } from "./routes.js";
import type { HostSystemService } from "./service.js";
import type { LogsResult, OperationRecord, SystemStatusView } from "./protocol.js";

const OPERATION_ID = "c8d2e3f4-5a61-4b72-9c83-d4e5f6071829";
const ADMIN_ID = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";

const operationRecord: OperationRecord = {
  id: OPERATION_ID,
  action: "restart",
  target: "web",
  state: "requested",
  requestedAt: "2026-11-22T08:00:00.000Z",
  completedAt: null,
  verifiedAt: null,
  safeErrorCode: null,
  requestedBy: "admin"
};

const statusView: SystemStatusView = {
  host: {
    cpuPercent: 12.5,
    cpuCount: 8,
    loadAverage: [0.5, 0.4, 0.3],
    memoryPercent: 25,
    memoryTotalBytes: 8_000_000_000,
    memoryAvailableBytes: 6_000_000_000,
    diskPercent: 40,
    diskTotalBytes: 100_000_000_000,
    diskFreeBytes: 60_000_000_000,
    uptimeSeconds: 90_000
  },
  collectedAt: "2026-11-22T08:00:00Z",
  services: { available: true, errorCode: null, items: [] },
  agent: { reachable: true, protocolVersion: 2 },
  operationsEnabled: false,
  recentOperations: []
};

const logsResult: LogsResult = {
  state: "ok",
  service: "web",
  lines: ["boot complete"],
  truncated: false,
  discardedLines: 0,
  collectedAt: "2026-11-22T08:00:00Z"
};

function setup(options: { role?: "admin" | "user" | null } = {}) {
  const role = options.role === undefined ? "admin" : options.role;
  const status = vi.fn(async () => statusView);
  const logs = vi.fn(async () => logsResult);
  const validateCompose = vi.fn(async () => ({ state: "valid" as const }));
  const requestOperation = vi.fn(async () => operationRecord);
  const listOperations = vi.fn(async () => [operationRecord]);
  const operation = vi.fn(async (_pool: Pool, id: string) => ({ ...operationRecord, id }));
  const pool = {} as Pool;
  const app = Fastify();
  app.addHook("onRequest", async (request) => {
    if (role) (request as unknown as { admin: unknown }).admin = { id: ADMIN_ID, username: "admin", role };
  });
  const ready = registerHostSystemRoutes(app, {
    service: { status, logs, validateCompose, requestOperation, listOperations, operation } as unknown as HostSystemService,
    pool
  });
  return { app, ready, status, logs, validateCompose, requestOperation, listOperations, operation, pool };
}

describe("host system routes", () => {
  it("returns the read-only status view", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({ method: "GET", url: "/api/v1/system/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: statusView });
  });

  it("reports a disabled feature as unavailable rather than failing upstream", async () => {
    const state = setup();
    await state.ready;
    state.status.mockRejectedValueOnce(new Error("HOST_MONITORING_DISABLED"));
    const response = await state.app.inject({ method: "GET", url: "/api/v1/system/status" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: "HOST_MONITORING_DISABLED", message: "Host monitoring is disabled for this deployment." }
    });
  });

  it("maps an agent timeout to a gateway error without leaking internals", async () => {
    const state = setup();
    await state.ready;
    state.status.mockRejectedValueOnce(new Error("HOST_AGENT_TIMEOUT"));
    const response = await state.app.inject({ method: "GET", url: "/api/v1/system/status" });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("HOST_AGENT_TIMEOUT");
  });

  it("collapses an unexpected error into a fixed code", async () => {
    const state = setup();
    await state.ready;
    state.status.mockRejectedValueOnce(new Error("connect UNKNOWN /run/agent.sock"));
    const response = await state.app.inject({ method: "GET", url: "/api/v1/system/status" });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: { code: "HOST_AGENT_FAILURE", message: "The Host Agent request could not be completed." }
    });
    expect(response.body).not.toContain("/run/agent.sock");
  });

  it("returns service logs with the default line count", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({ method: "GET", url: "/api/v1/system/services/web/logs" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: logsResult });
    expect(state.logs).toHaveBeenCalledWith("web", 100);
  });

  it("rejects a service outside the allowlist before calling the agent", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({ method: "GET", url: "/api/v1/system/services/code-server/logs" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_LOG_REQUEST");
    expect(state.logs).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range line count and undeclared query fields", async () => {
    const state = setup();
    await state.ready;
    const tooMany = await state.app.inject({ method: "GET", url: "/api/v1/system/services/api/logs?lines=501" });
    const zero = await state.app.inject({ method: "GET", url: "/api/v1/system/services/api/logs?lines=0" });
    const extra = await state.app.inject({
      method: "GET",
      url: "/api/v1/system/services/api/logs?lines=10&follow=true"
    });
    for (const response of [tooMany, zero, extra]) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_LOG_REQUEST");
    }
    expect(state.logs).not.toHaveBeenCalled();
  });

  it("returns the Compose validation result", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({ method: "POST", url: "/api/v1/system/compose/validate" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { state: "valid" } });
  });

  it("refuses Compose validation while operations are disabled", async () => {
    const state = setup();
    await state.ready;
    state.validateCompose.mockRejectedValueOnce(new Error("HOST_OPERATIONS_DISABLED"));
    const response = await state.app.inject({ method: "POST", url: "/api/v1/system/compose/validate" });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("HOST_OPERATIONS_DISABLED");
  });

  it("queues an administrator operation and returns it for polling", async () => {
    const state = setup();
    await state.ready;
    const response = await state.app.inject({
      method: "POST",
      url: "/api/v1/system/operations",
      payload: { action: "restart", target: "web" }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ data: operationRecord });
    expect(state.requestOperation).toHaveBeenCalledWith(
      state.pool,
      { id: ADMIN_ID, username: "admin", role: "admin" },
      { action: "restart", target: "web" },
      expect.any(String)
    );
  });

  it("rejects a non-administrator before the operation is journaled", async () => {
    for (const role of ["user", null] as const) {
      const state = setup({ role });
      await state.ready;
      const response = await state.app.inject({
        method: "POST",
        url: "/api/v1/system/operations",
        payload: { action: "restart", target: "web" }
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("ADMINISTRATOR_REQUIRED");
      expect(state.requestOperation).not.toHaveBeenCalled();
    }
  });

  it("rejects an unsupported action, target, or extra field before dispatch", async () => {
    const state = setup();
    await state.ready;
    const bodies = [
      { action: "reboot", target: "web" },
      { action: "restart", target: "internet" },
      { action: "restart", target: "web", command: "docker restart web" },
      { action: "stop", target: "stack", confirmStackStop: false }
    ];
    for (const payload of bodies) {
      const response = await state.app.inject({ method: "POST", url: "/api/v1/system/operations", payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_OPERATION_REQUEST");
    }
    expect(state.requestOperation).not.toHaveBeenCalled();
  });

  it("maps a concurrent and an unconfirmed request to fixed client errors", async () => {
    const state = setup();
    await state.ready;
    state.requestOperation.mockRejectedValueOnce(new Error("HOST_OPERATION_IN_PROGRESS"));
    const busy = await state.app.inject({
      method: "POST",
      url: "/api/v1/system/operations",
      payload: { action: "restart", target: "api" }
    });
    expect(busy.statusCode).toBe(409);
    expect(busy.json().error.code).toBe("HOST_OPERATION_IN_PROGRESS");

    state.requestOperation.mockRejectedValueOnce(new Error("HOST_OPERATION_CONFIRMATION_REQUIRED"));
    const unconfirmed = await state.app.inject({
      method: "POST",
      url: "/api/v1/system/operations",
      payload: { action: "stop", target: "stack" }
    });
    expect(unconfirmed.statusCode).toBe(400);
    expect(unconfirmed.json().error.code).toBe("HOST_OPERATION_CONFIRMATION_REQUIRED");
  });

  it("serves operation history and one operation by identifier", async () => {
    const state = setup();
    await state.ready;
    const history = await state.app.inject({ method: "GET", url: "/api/v1/system/operations?limit=5" });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual({ data: [operationRecord] });
    expect(state.listOperations).toHaveBeenCalledWith(state.pool, 5);

    const one = await state.app.inject({ method: "GET", url: `/api/v1/system/operations/${OPERATION_ID}` });
    expect(one.statusCode).toBe(200);
    expect(one.json()).toEqual({ data: operationRecord });
    expect(state.operation).toHaveBeenCalledWith(state.pool, OPERATION_ID);
  });

  it("rejects a malformed identifier and reports an unknown operation", async () => {
    const state = setup();
    await state.ready;
    const malformed = await state.app.inject({ method: "GET", url: "/api/v1/system/operations/not-a-uuid" });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe("INVALID_OPERATION_ID");
    expect(state.operation).not.toHaveBeenCalled();

    state.operation.mockRejectedValueOnce(new Error("HOST_OPERATION_NOT_FOUND"));
    const missing = await state.app.inject({ method: "GET", url: `/api/v1/system/operations/${OPERATION_ID}` });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("HOST_OPERATION_NOT_FOUND");
  });
});

import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "../auth.js";
import { HostSystemService } from "./service.js";

const servers: Server[] = [];
const connections: import("node:net").Socket[] = [];
const directories: string[] = [];

const OPERATION_ID = "b7c1d2e3-4f50-4a61-8b72-c3d4e5f60718";
const actor: AdminUser = {
  id: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
  username: "admin",
  role: "admin"
};

interface AgentFixture {
  socketPath: string;
  requests: () => unknown[];
}

async function agent(responder: (request: unknown) => unknown): Promise<AgentFixture> {
  const directory = await mkdtemp(join(tmpdir(), "hub-system-service-"));
  directories.push(directory);
  const socketPath = join(directory, "agent.sock");
  const seen: unknown[] = [];
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const request = JSON.parse(input.slice(0, newline)) as unknown;
      seen.push(request);
      socket.end(JSON.stringify(responder(request)) + "\n");
    });
  });
  server.on("connection", socket => {
    connections.push(socket);
    socket.on("error", () => undefined);
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return { socketPath, requests: () => seen };
}

afterEach(async () => {
  vi.useRealTimers();
  for (const connection of connections.splice(0)) connection.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const host = {
  cpuPercent: 12.5,
  cpuCount: 8,
  loadAverage: [0.5, 0.4, 0.3] as [number, number, number],
  memoryPercent: 25,
  memoryTotalBytes: 8_000_000_000,
  memoryAvailableBytes: 6_000_000_000,
  diskPercent: 40,
  diskTotalBytes: 100_000_000_000,
  diskFreeBytes: 60_000_000_000,
  uptimeSeconds: 90_000
};

const statusOk = {
  state: "ok",
  collectedAt: "2026-11-22T08:00:00Z",
  host,
  services: { available: true, errorCode: null, items: [] }
};

/** Read-only paths must never consult the journal; any query here would be a defect. */
function unusedPool(): Pool {
  return {
    query: () => Promise.reject(new Error("Unexpected journal query"))
  } as unknown as Pool;
}

interface FakeResult {
  rows?: unknown[];
  rowCount?: number | null;
  error?: Error;
}

/** Deterministic stand-in for a pg pool: each call consumes the next canned result. */
function sequenced(results: FakeResult[]) {
  const pending = [...results];
  const query = vi.fn(async (_text: string, _params?: unknown[]) => {
    const next = pending.shift();
    if (!next) throw new Error("Unexpected extra query");
    if (next.error) throw next.error;
    return { rows: next.rows ?? [], rowCount: next.rowCount ?? null };
  });
  return query;
}

function operationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    action: "restart",
    target: "web",
    state: "requested",
    requestedAt: new Date(),
    completedAt: null,
    verifiedAt: null,
    safeErrorCode: null,
    requestedBy: "admin",
    ...overrides
  };
}

describe.skipIf(process.platform === "win32")("HostSystemService", () => {
  it("refuses every call while monitoring is disabled", async () => {
    const service = new HostSystemService({
      socketPath: "/tmp/never-used.sock",
      monitoringEnabled: false,
      operationsEnabled: false
    });
    await expect(service.status(unusedPool())).rejects.toThrow("HOST_MONITORING_DISABLED");
    await expect(service.logs("web", 10)).rejects.toThrow("HOST_MONITORING_DISABLED");
    await expect(service.validateCompose()).rejects.toThrow("HOST_OPERATIONS_DISABLED");
  });

  it("reports an unconfigured agent socket distinctly from a disabled feature", async () => {
    const service = new HostSystemService({ socketPath: null, monitoringEnabled: true, operationsEnabled: false });
    await expect(service.status(unusedPool())).rejects.toThrow("HOST_AGENT_NOT_CONFIGURED");
    await expect(service.logs("web", 10)).rejects.toThrow("HOST_AGENT_NOT_CONFIGURED");
  });

  it("builds the read-only status view from a host sample", async () => {
    const fixture = await agent(() => statusOk);
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: false
    });
    await expect(service.status(unusedPool())).resolves.toEqual({
      host,
      collectedAt: "2026-11-22T08:00:00Z",
      services: { available: true, errorCode: null, items: [] },
      agent: { reachable: true, protocolVersion: 2 },
      operationsEnabled: false,
      recentOperations: []
    });
    expect(fixture.requests()).toEqual([{ protocolVersion: 2, operation: "system.status" }]);
  });

  it("keeps partial results usable when Docker is unavailable", async () => {
    const fixture = await agent(() => ({
      state: "partial",
      collectedAt: "2026-11-22T08:00:00Z",
      host,
      services: { available: false, errorCode: "DOCKER_UNAVAILABLE", items: [] }
    }));
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: false
    });
    const view = await service.status(unusedPool());
    expect(view.services).toEqual({ available: false, errorCode: "DOCKER_UNAVAILABLE", items: [] });
    expect(view.host).toEqual(host);
  });

  it("serves concurrent viewers from one agent exchange within the cache window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const fixture = await agent(() => statusOk);
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: false
    });

    await Promise.all([service.status(unusedPool()), service.status(unusedPool()), service.status(unusedPool())]);
    expect(fixture.requests()).toHaveLength(1);

    vi.setSystemTime(new Date(Date.now() + 4_000));
    await service.status(unusedPool());
    expect(fixture.requests()).toHaveLength(2);
  });

  it("maps a protocol mismatch instead of reporting an invalid response", async () => {
    const fixture = await agent(() => ({ state: "error", errorCode: "PROTOCOL_VERSION_UNSUPPORTED" }));
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });
    await expect(service.status(unusedPool())).rejects.toThrow("HOST_AGENT_PROTOCOL_MISMATCH");
    await expect(service.logs("api", 5)).rejects.toThrow("HOST_AGENT_PROTOCOL_MISMATCH");
    await expect(service.validateCompose()).rejects.toThrow("HOST_AGENT_PROTOCOL_MISMATCH");
  });

  it("passes an agent-level failure code through unchanged", async () => {
    const fixture = await agent(() => ({ state: "error", errorCode: "DOCKER_UNAVAILABLE" }));
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });
    await expect(service.logs("web", 10)).rejects.toThrow("DOCKER_UNAVAILABLE");
  });

  it("validates the Compose file only when operations are enabled", async () => {
    const fixture = await agent(() => ({
      state: "invalid",
      detail: "invalid: <project>/.env: HUB_TOKEN=[REDACTED]"
    }));
    const disabled = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: false
    });
    await expect(disabled.validateCompose()).rejects.toThrow("HOST_OPERATIONS_DISABLED");
    expect(fixture.requests()).toEqual([]);

    const enabled = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });
    await expect(enabled.validateCompose()).resolves.toEqual({
      state: "invalid",
      detail: "invalid: <project>/.env: HUB_TOKEN=[REDACTED]"
    });
  });

  it("journals an operation and dispatches only its identifier, action, and target", async () => {
    const fixture = await agent((request) =>
      (request as { operation?: string }).operation === "system.operation"
        ? { state: "accepted", operationId: OPERATION_ID }
        : { state: "error", errorCode: "UNEXPECTED_OPERATION" }
    );
    const clientQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [operationRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const client = { query: clientQuery, release: vi.fn() };
    const query = sequenced([{ rowCount: 1 }]);
    const pool = { query, connect: vi.fn(async () => client) } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });

    const created = await service.requestOperation(pool, actor, { action: "restart", target: "web" }, "req-1");

    expect(created).toEqual({
      id: OPERATION_ID,
      action: "restart",
      target: "web",
      state: "requested",
      requestedAt: created.requestedAt,
      completedAt: null,
      verifiedAt: null,
      safeErrorCode: null,
      requestedBy: "admin"
    });
    expect(clientQuery.mock.calls.map(call => String(call[0]))).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO host_operations"),
      expect.stringContaining("INSERT INTO audit_events"),
      "COMMIT"
    ]);
    expect(clientQuery.mock.calls[1]?.[1]).toEqual([actor.id, "admin", "restart", "web", "req-1"]);
    expect(client.release).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(query.mock.calls.some(([text]) => String(text).includes("SET state = 'running'"))).toBe(true);
    });
    // The agent never receives a command, path, Compose override, or URL.
    expect(fixture.requests()).toEqual([{
      protocolVersion: 2,
      operation: "system.operation",
      operationId: OPERATION_ID,
      action: "restart",
      target: "web"
    }]);
  });

  it("records a dispatch refusal as failed instead of leaving the operation open", async () => {
    const fixture = await agent(() => ({ state: "error", errorCode: "DOCKER_UNAVAILABLE" }));
    const clientQuery = sequenced([{ rowCount: 0 }, { rows: [operationRow()], rowCount: 1 }, { rowCount: 1 }, { rowCount: 0 }]);
    const client = { query: clientQuery, release: vi.fn() };
    const query = sequenced([{ rowCount: 1 }, { rowCount: 1 }]);
    const pool = { query, connect: vi.fn(async () => client) } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });

    await service.requestOperation(pool, actor, { action: "stop", target: "web" }, "req-2");

    await vi.waitFor(() => {
      expect(query.mock.calls.some(([text]) => String(text).includes("SET state = $2"))).toBe(true);
    });
    const settle = query.mock.calls.find(([text]) => String(text).includes("SET state = $2"));
    expect(settle?.[1]).toEqual([OPERATION_ID, "failed", "DOCKER_UNAVAILABLE", null]);
  });

  it("refuses a stack stop that was not explicitly confirmed, before any dispatch", async () => {
    const fixture = await agent(() => ({ state: "accepted", operationId: OPERATION_ID }));
    const connect = vi.fn();
    const pool = { connect } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });

    await expect(
      service.requestOperation(pool, actor, { action: "stop", target: "stack" }, "req-3")
    ).rejects.toThrow("HOST_OPERATION_CONFIRMATION_REQUIRED");
    expect(connect).not.toHaveBeenCalled();
    expect(fixture.requests()).toEqual([]);
  });

  it("reports a concurrent operation as in progress", async () => {
    const duplicate = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    const clientQuery = sequenced([{ rowCount: 0 }, { error: duplicate }, { rowCount: 0 }]);
    const client = { query: clientQuery, release: vi.fn() };
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: "/tmp/hub-unused-agent.sock",
      monitoringEnabled: true,
      operationsEnabled: true
    });

    await expect(
      service.requestOperation(pool, actor, { action: "restart", target: "api" }, "req-4")
    ).rejects.toThrow("HOST_OPERATION_IN_PROGRESS");
    expect(clientQuery.mock.calls.map(call => String(call[0]))).toEqual(["BEGIN", expect.any(String), "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("settles a completed operation from the agent result journal and records verification", async () => {
    const fixture = await agent((request) =>
      (request as { operation?: string }).operation === "system.operationResult"
        ? { state: "completed", result: "succeeded", errorCode: null, verified: true, finishedAt: "2026-11-22T08:05:00Z" }
        : { state: "error", errorCode: "UNEXPECTED_OPERATION" }
    );
    const query = sequenced([
      { rows: [operationRow({ state: "running" })], rowCount: 1 },
      { rowCount: 1 },
      { rowCount: 1 }
    ]);
    const pool = { query } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });

    await service.reconcile(pool);

    expect(query.mock.calls[0]?.[0]).toContain("WHERE state IN ('requested', 'running')");
    expect(query.mock.calls[1]?.[1]).toEqual([OPERATION_ID, "succeeded", null, "2026-11-22T08:05:00Z"]);
    expect(fixture.requests()).toEqual([{
      protocolVersion: 2,
      operation: "system.operationResult",
      operationId: OPERATION_ID
    }]);
  });

  it("settles an operation the agent has no record of as unknown", async () => {
    const fixture = await agent((request) =>
      (request as { operation?: string }).operation === "system.operationResult"
        ? { state: "error", errorCode: "OPERATION_NOT_FOUND" }
        : { state: "error", errorCode: "UNEXPECTED_OPERATION" }
    );
    const query = sequenced([
      { rows: [operationRow({ state: "running" })], rowCount: 1 },
      { rowCount: 1 },
      { rowCount: 1 }
    ]);
    const pool = { query } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: fixture.socketPath,
      monitoringEnabled: true,
      operationsEnabled: true
    });

    await service.reconcile(pool);

    // The agent's journal lost the id: report unknown instead of leaving it pending.
    expect(query.mock.calls[1]?.[0]).toContain("UPDATE host_operations");
    expect(query.mock.calls[1]?.[1]).toEqual([OPERATION_ID, "unknown", "OPERATION_NOT_FOUND", null]);
  });

  it("leaves a pending operation untouched while the agent is unreachable", async () => {
    const query = sequenced([{ rows: [operationRow({ state: "running" })], rowCount: 1 }]);
    const pool = { query } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: "/tmp/hub-missing-agent.sock",
      monitoringEnabled: true,
      operationsEnabled: true
    });

    await service.reconcile(pool);

    // A transient outage must not invent an outcome for the operation.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("reports an operation that outlived its timeout as unknown", async () => {
    const query = sequenced([
      { rows: [operationRow({ state: "running", requestedAt: new Date(Date.now() - 60_000) })], rowCount: 1 },
      { rowCount: 1 },
      { rowCount: 1 }
    ]);
    const pool = { query } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: "/tmp/hub-missing-agent.sock",
      monitoringEnabled: true,
      operationsEnabled: true,
      operationTimeoutMs: 1_000
    });

    await service.reconcile(pool);

    expect(query.mock.calls[1]?.[1]).toEqual([OPERATION_ID, "unknown", "OPERATION_TIMEOUT", null]);
  });

  it("skips settling when a concurrent actor already recorded the outcome", async () => {
    const query = sequenced([
      { rows: [operationRow({ state: "running", requestedAt: new Date(Date.now() - 60_000) })], rowCount: 1 },
      { rowCount: 0 }
    ]);
    const pool = { query } as unknown as Pool;
    const service = new HostSystemService({
      socketPath: "/tmp/hub-missing-agent.sock",
      monitoringEnabled: true,
      operationsEnabled: true,
      operationTimeoutMs: 1_000
    });

    await service.reconcile(pool);

    // No audit event is written by the loser of the conditional update.
    expect(query).toHaveBeenCalledTimes(2);
  });
});


import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  requestHostComposeValidation,
  requestHostServiceLogs,
  requestHostSystemStatus
} from "./client.js";

const servers: Server[] = [];
const connections: import("node:net").Socket[] = [];
const directories: string[] = [];

async function listen(handler: (request: string) => string, onRequest?: (request: string) => void) {
  const directory = await mkdtemp(join(tmpdir(), "hub-system-test-"));
  directories.push(directory);
  const socketPath = join(directory, "agent.sock");
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const request = input.slice(0, newline);
      onRequest?.(request);
      socket.end(handler(request) + "\n");
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
  return socketPath;
}

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const host = {
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
};

const statusOk = {
  state: "ok",
  collectedAt: "2026-11-22T08:00:00Z",
  host,
  services: {
    available: true,
    errorCode: null,
    items: [{
      service: "web",
      containerName: "pfsense-hub-web-1",
      state: "running",
      health: "healthy",
      statusText: "Up 2 hours (healthy)",
      restartCount: 0,
      startedAt: "2026-11-22T06:00:00Z"
    }]
  }
};

const logsOk = {
  state: "ok",
  service: "web",
  lines: ["[REDACTED] boot complete"],
  truncated: false,
  discardedLines: 0,
  collectedAt: "2026-11-22T08:00:00Z"
};

describe.skipIf(process.platform === "win32")("host system agent client", () => {
  it("sends only the strict status request and parses the envelope", async () => {
    let received = "";
    const socketPath = await listen(
      () => JSON.stringify(statusOk),
      value => { received = value; }
    );
    await expect(requestHostSystemStatus(socketPath)).resolves.toEqual(statusOk);
    expect(JSON.parse(received)).toEqual({ protocolVersion: 2, operation: "system.status" });
  });

  it("sends the allowlisted service and bounded line count", async () => {
    let received = "";
    const socketPath = await listen(
      () => JSON.stringify(logsOk),
      value => { received = value; }
    );
    await expect(requestHostServiceLogs(socketPath, "db", 40)).resolves.toEqual(logsOk);
    expect(JSON.parse(received)).toEqual({
      protocolVersion: 2,
      operation: "system.logs",
      service: "db",
      lines: 40
    });
  });

  it("refuses to serialize a service outside the allowlist", async () => {
    await expect(
      requestHostServiceLogs("/tmp/unused-agent.sock", "code-server" as never, 10)
    ).rejects.toThrow("HOST_AGENT_REQUEST_INVALID");
    await expect(requestHostServiceLogs("/tmp/unused-agent.sock", "web", 0)).rejects.toThrow(
      "HOST_AGENT_REQUEST_INVALID"
    );
  });

  it("returns an operation-level failure for the caller to translate", async () => {
    const socketPath = await listen(
      () => JSON.stringify({ state: "error", errorCode: "PROTOCOL_VERSION_UNSUPPORTED" })
    );
    await expect(requestHostSystemStatus(socketPath)).resolves.toEqual({
      state: "error",
      errorCode: "PROTOCOL_VERSION_UNSUPPORTED"
    });
  });

  it("rejects a response envelope with undeclared fields", async () => {
    const socketPath = await listen(
      () => JSON.stringify({ ...statusOk, command: "docker compose down" })
    );
    await expect(requestHostSystemStatus(socketPath)).rejects.toThrow("HOST_AGENT_RESPONSE_INVALID");
  });

  it("passes a sanitized validation detail through unchanged", async () => {
    const socketPath = await listen(
      () => JSON.stringify({ state: "invalid", detail: "invalid: <project>/.env: HUB_TOKEN=[REDACTED]" })
    );
    await expect(requestHostComposeValidation(socketPath)).resolves.toEqual({
      state: "invalid",
      detail: "invalid: <project>/.env: HUB_TOKEN=[REDACTED]"
    });
  });
});

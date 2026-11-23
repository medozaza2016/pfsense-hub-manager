import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exchangeHostAgent } from "./host-agent-transport.js";

const servers: Server[] = [];
const connections: import("node:net").Socket[] = [];
const directories: string[] = [];

async function listen(respond: (socket: import("node:net").Socket) => void) {
  const directory = await mkdtemp(join(tmpdir(), "hub-transport-test-"));
  directories.push(directory);
  const socketPath = join(directory, "agent.sock");
  const server = createServer(respond);
  // A handler that never reads leaves the socket paused, so the peer's FIN is
  // never processed and `server.close()` would wait forever. Track every
  // connection so teardown can destroy it.
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

function acceptAndReply(payload: string) {
  return (socket: import("node:net").Socket) => {
    socket.once("data", () => socket.end(payload));
  };
}

const parseOk = (value: unknown) => {
  const parsed = value as { ok?: unknown };
  if (parsed?.ok !== true) throw new Error("invalid");
  return parsed;
};

const request = { protocolVersion: 2, operation: "system.status" };

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.destroy();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe.skipIf(process.platform === "win32")("host agent Unix socket transport", () => {
  it("sends one newline-delimited request and parses the first response line", async () => {
    let received = "";
    const socketPath = await listen(socket => {
      socket.on("data", chunk => {
        received += chunk.toString("utf8");
        if (!received.includes("\n")) return;
        socket.end(JSON.stringify({ ok: true }) + "\n" + "ignored trailing data");
      });
    });
    await expect(exchangeHostAgent(socketPath, request, parseOk)).resolves.toEqual({ ok: true });
    expect(received).toBe(JSON.stringify(request) + "\n");
  });

  it("rejects a non-absolute socket path without touching the filesystem", async () => {
    await expect(exchangeHostAgent("relative/agent.sock", request, parseOk))
      .rejects.toThrow("HOST_AGENT_SOCKET_NOT_CONFIGURED");
  });

  it("rejects out-of-range limits before connecting", async () => {
    await expect(exchangeHostAgent("/tmp/agent.sock", request, parseOk, { timeoutMs: 10 }))
      .rejects.toThrow("HOST_AGENT_TIMEOUT_INVALID");
    await expect(exchangeHostAgent("/tmp/agent.sock", request, parseOk, { maxResponseBytes: 200_000_000 }))
      .rejects.toThrow("HOST_AGENT_LIMIT_INVALID");
  });

  it("rejects an unparseable request payload", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(exchangeHostAgent("/tmp/agent.sock", circular, parseOk))
      .rejects.toThrow("HOST_AGENT_REQUEST_INVALID");
  });

  it("fails closed on oversized, invalid, and truncated responses", async () => {
    const oversized = await listen(acceptAndReply("x".repeat(2048) + "\n"));
    await expect(exchangeHostAgent(oversized, request, parseOk, { maxResponseBytes: 1024 }))
      .rejects.toThrow("HOST_AGENT_RESPONSE_TOO_LARGE");

    const invalid = await listen(acceptAndReply("not json\n"));
    await expect(exchangeHostAgent(invalid, request, parseOk)).rejects.toThrow("HOST_AGENT_RESPONSE_INVALID");

    const notOk = await listen(acceptAndReply(JSON.stringify({ ok: false }) + "\n"));
    await expect(exchangeHostAgent(notOk, request, parseOk)).rejects.toThrow("HOST_AGENT_RESPONSE_INVALID");

    const truncated = await listen(socket => socket.end("{"));
    await expect(exchangeHostAgent(truncated, request, parseOk)).rejects.toThrow("HOST_AGENT_RESPONSE_INCOMPLETE");
  });

  it("reports timeouts and unavailable sockets with safe codes only", async () => {
    const silent = await listen(() => { /* never responds */ });
    await expect(exchangeHostAgent(silent, request, parseOk, { timeoutMs: 100 }))
      .rejects.toThrow("HOST_AGENT_TIMEOUT");

    const directory = await mkdtemp(join(tmpdir(), "hub-transport-missing-"));
    directories.push(directory);
    const missing = join(directory, "missing.sock");
    const error = await exchangeHostAgent(missing, request, parseOk).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("HOST_AGENT_UNAVAILABLE");
    expect((error as Error).message).not.toContain(directory);
  });
});

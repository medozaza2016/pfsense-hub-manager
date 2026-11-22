import { createServer, type Server } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { requestHostDeployment } from "./deployment-agent-client.js";

const servers: Server[] = [];
const directories: string[] = [];

async function listen(handler: (request: string) => string, onRequest?: (request: string) => void) {
  const directory = await mkdtemp(join(tmpdir(), "hub-agent-test-"));
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
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return socketPath;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

const request = {
  protocolVersion: 1 as const,
  deploymentId: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
  desiredRevision: 4
};

describe("host deployment agent socket client", () => {
  it("sends only the strict deployment identifier and revision", async () => {
    let received = "";
    const socketPath = await listen(
      () => JSON.stringify({ state: "succeeded", appliedOrigin: "http://192.168.1.20:8080" }),
      value => { received = value; }
    );
    await expect(requestHostDeployment(socketPath, request)).resolves.toEqual({
      state: "succeeded",
      appliedOrigin: "http://192.168.1.20:8080"
    });
    expect(JSON.parse(received)).toEqual(request);
  });

  it("rejects an invalid agent response", async () => {
    const socketPath = await listen(() => JSON.stringify({
      state: "succeeded",
      appliedOrigin: "http://192.168.1.20:8080",
      command: "docker compose down"
    }));
    await expect(requestHostDeployment(socketPath, request)).rejects.toThrow("HOST_AGENT_RESPONSE_INVALID");
  });

  it("rejects an unavailable socket with a safe error code", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hub-agent-missing-"));
    directories.push(directory);
    await expect(requestHostDeployment(join(directory, "missing.sock"), request)).rejects.toThrow("HOST_AGENT_UNAVAILABLE");
  });

  it("rejects a non-absolute socket path", async () => {
    await expect(requestHostDeployment("relative/agent.sock", request)).rejects.toThrow("HOST_AGENT_SOCKET_NOT_CONFIGURED");
  });
});

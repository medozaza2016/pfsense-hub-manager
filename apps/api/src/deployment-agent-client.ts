import { createConnection } from "node:net";
import {
  hostDeploymentRequestSchema,
  parseHostDeploymentResult,
  type HostDeploymentRequest,
  type HostDeploymentResult
} from "./deployment-agent-protocol.js";

const MAX_RESPONSE_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Exchange one newline-delimited JSON request/response with the local host agent.
 * The socket path is trusted process configuration, never request data.
 */
export function requestHostDeployment(
  socketPath: string,
  request: HostDeploymentRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<HostDeploymentResult> {
  if (!socketPath || !socketPath.startsWith("/")) {
    return Promise.reject(new Error("HOST_AGENT_SOCKET_NOT_CONFIGURED"));
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    return Promise.reject(new Error("HOST_AGENT_TIMEOUT_INVALID"));
  }

  const validatedRequest = hostDeploymentRequestSchema.parse(request);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath });
    let response = "";
    let settled = false;

    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(code));
    };

    socket.setTimeout(timeoutMs, () => fail("HOST_AGENT_TIMEOUT"));
    socket.once("error", () => fail("HOST_AGENT_UNAVAILABLE"));
    socket.once("connect", () => {
      socket.write(JSON.stringify(validatedRequest) + "\n");
    });
    socket.on("data", (chunk: Buffer) => {
      if (settled) return;
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response, "utf8") > MAX_RESPONSE_BYTES) {
        fail("HOST_AGENT_RESPONSE_TOO_LARGE");
        return;
      }
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      const line = response.slice(0, newline);
      try {
        const result = parseHostDeploymentResult(JSON.parse(line) as unknown);
        settled = true;
        socket.end();
        resolve(result);
      } catch {
        fail("HOST_AGENT_RESPONSE_INVALID");
      }
    });
    socket.once("end", () => {
      if (!settled) fail("HOST_AGENT_RESPONSE_INCOMPLETE");
    });
  });
}

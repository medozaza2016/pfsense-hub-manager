import { createConnection } from "node:net";

const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 270_000;
const MIN_RESPONSE_BYTES = 1_024;
const MAX_RESPONSE_BYTES_LIMIT = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024;

export interface HostAgentExchangeOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Exchange one newline-delimited JSON request/response with the local host agent.
 *
 * The socket path is trusted process configuration, never request data. Every
 * rejection carries a stable code so callers can map it to a response without
 * exposing socket paths, request payloads, or agent-provided text.
 */
export function exchangeHostAgent<TResult>(
  socketPath: string,
  request: unknown,
  parse: (value: unknown) => TResult,
  options: HostAgentExchangeOptions = {}
): Promise<TResult> {
  if (!socketPath || !socketPath.startsWith("/")) {
    return Promise.reject(new Error("HOST_AGENT_SOCKET_NOT_CONFIGURED"));
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    return Promise.reject(new Error("HOST_AGENT_TIMEOUT_INVALID"));
  }
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes)
    || maxResponseBytes < MIN_RESPONSE_BYTES
    || maxResponseBytes > MAX_RESPONSE_BYTES_LIMIT) {
    return Promise.reject(new Error("HOST_AGENT_LIMIT_INVALID"));
  }
  let payload: string;
  try {
    const serialized = JSON.stringify(request);
    if (typeof serialized !== "string") {
      return Promise.reject(new Error("HOST_AGENT_REQUEST_INVALID"));
    }
    payload = serialized + "\n";
  } catch {
    return Promise.reject(new Error("HOST_AGENT_REQUEST_INVALID"));
  }

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
      socket.write(payload);
    });
    socket.on("data", (chunk: Buffer) => {
      if (settled) return;
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response, "utf8") > maxResponseBytes) {
        fail("HOST_AGENT_RESPONSE_TOO_LARGE");
        return;
      }
      const newline = response.indexOf("\n");
      if (newline < 0) return;
      const line = response.slice(0, newline);
      try {
        const result = parse(JSON.parse(line) as unknown);
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

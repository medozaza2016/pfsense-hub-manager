import { exchangeHostAgent } from "./host-agent-transport.js";
import {
  hostDeploymentRequestSchema,
  parseHostDeploymentResult,
  type HostDeploymentRequest,
  type HostDeploymentResult
} from "./deployment-agent-protocol.js";

const MAX_RESPONSE_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 240_000;

/**
 * Exchange one Hub access-deployment request with the local host agent.
 * The socket path is trusted process configuration, never request data.
 */
export function requestHostDeployment(
  socketPath: string,
  request: HostDeploymentRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<HostDeploymentResult> {
  const validatedRequest = hostDeploymentRequestSchema.parse(request);
  return exchangeHostAgent(socketPath, validatedRequest, parseHostDeploymentResult, {
    timeoutMs,
    maxResponseBytes: MAX_RESPONSE_BYTES
  });
}


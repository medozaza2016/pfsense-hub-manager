import { z } from "zod";

/** Strict request sent over the private API-to-host-agent Unix socket. */
export const hostDeploymentRequestSchema = z.object({
  protocolVersion: z.literal(1),
  deploymentId: z.string().uuid(),
  desiredRevision: z.number().int().min(1)
}).strict();

const verifiedOriginSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username && !url.password
      && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}, "A verified origin must be an HTTPS origin without credentials, path, query, or fragment.");

export const hostDeploymentResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("succeeded"), appliedOrigin: verifiedOriginSchema }).strict(),
  z.object({ state: z.literal("rolled_back"), errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/), rollbackSucceeded: z.literal(true) }).strict(),
  z.object({ state: z.literal("failed"), errorCode: z.string().regex(/^[A-Z0-9_]{1,64}$/), rollbackSucceeded: z.boolean().nullable() }).strict()
]);

export type HostDeploymentRequest = z.infer<typeof hostDeploymentRequestSchema>;
export type HostDeploymentResult = z.infer<typeof hostDeploymentResultSchema>;

/**
 * The API never sends shell commands, paths, service names, ports, or environment
 * values to the host agent. The agent resolves all operational details from its
 * own root-owned configuration.
 */
export function createHostDeploymentRequest(deploymentId: string, desiredRevision: number): HostDeploymentRequest {
  return hostDeploymentRequestSchema.parse({ protocolVersion: 1, deploymentId, desiredRevision });
}

export function parseHostDeploymentResult(value: unknown): HostDeploymentResult {
  return hostDeploymentResultSchema.parse(value);
}

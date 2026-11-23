import { z } from "zod";
import { HOST_AGENT_PROTOCOL_VERSION } from "../deployment-agent-protocol.js";

export { HOST_AGENT_PROTOCOL_VERSION };

/**
 * Host system protocol shared by the API and the host agent.
 *
 * Requests are strict objects with an explicit operation discriminator so the
 * agent never infers a capability from the request shape. Results are validated
 * as strictly as requests: the agent is a trusted local service, but anything it
 * returns is still treated as untrusted input.
 */

/** Fixed service allowlist. `code-server` and unknown services are unreachable. */
export const HOST_SERVICES = ["web", "api", "db"] as const;
export const HOST_OPERATION_TARGETS = ["web", "api", "db", "stack"] as const;
export const HOST_OPERATION_ACTIONS = ["start", "stop", "restart"] as const;
export const MAX_LOG_LINES = 500;

export const hostServiceSchema = z.enum(HOST_SERVICES);
export const operationTargetSchema = z.enum(HOST_OPERATION_TARGETS);
export const operationActionSchema = z.enum(HOST_OPERATION_ACTIONS);

export type HostService = z.infer<typeof hostServiceSchema>;
export type OperationTarget = z.infer<typeof operationTargetSchema>;
export type OperationAction = z.infer<typeof operationActionSchema>;

/** Stable machine-readable code. Never free text, never a secret. */
export const safeCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);

const isoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/);
const protocolVersionSchema = z.literal(HOST_AGENT_PROTOCOL_VERSION);
const percentSchema = z.number().min(0).max(100).nullable();
const countSchema = z.number().int().min(0).nullable();
const bytesSchema = z.number().int().min(0).nullable();

export const systemStatusRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  operation: z.literal("system.status")
}).strict();

export const systemLogsRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  operation: z.literal("system.logs"),
  service: hostServiceSchema,
  lines: z.number().int().min(1).max(MAX_LOG_LINES)
}).strict();

export const composeValidateRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  operation: z.literal("compose.validate")
}).strict();

export const operationDispatchRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  operation: z.literal("system.operation"),
  operationId: z.string().uuid(),
  action: operationActionSchema,
  target: operationTargetSchema
}).strict();

export const operationResultRequestSchema = z.object({
  protocolVersion: protocolVersionSchema,
  operation: z.literal("system.operationResult"),
  operationId: z.string().uuid()
}).strict();

export type SystemStatusRequest = z.infer<typeof systemStatusRequestSchema>;
export type SystemLogsRequest = z.infer<typeof systemLogsRequestSchema>;
export type ComposeValidateRequest = z.infer<typeof composeValidateRequestSchema>;
export type OperationDispatchRequest = z.infer<typeof operationDispatchRequestSchema>;
export type OperationResultRequest = z.infer<typeof operationResultRequestSchema>;

export const hostMetricsSchema = z.object({
  cpuPercent: percentSchema,
  cpuCount: countSchema,
  loadAverage: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]).nullable(),
  memoryPercent: percentSchema,
  memoryTotalBytes: bytesSchema,
  memoryAvailableBytes: bytesSchema,
  diskPercent: percentSchema,
  diskTotalBytes: bytesSchema,
  diskFreeBytes: bytesSchema,
  uptimeSeconds: countSchema
}).strict();

export const hostServiceStateSchema = z.object({
  service: hostServiceSchema,
  containerName: z.string().min(1).max(120).nullable(),
  state: z.enum(["running", "exited", "paused", "restarting", "created", "dead", "missing", "unknown"]),
  health: z.enum(["healthy", "unhealthy", "starting", "none"]),
  statusText: z.string().min(1).max(200).nullable(),
  restartCount: countSchema,
  startedAt: isoDateTimeSchema.nullable()
}).strict();

export const systemStatusResultSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("ok"),
    collectedAt: isoDateTimeSchema,
    host: hostMetricsSchema,
    services: z.object({
      available: z.literal(true),
      errorCode: z.null(),
      items: z.array(hostServiceStateSchema).max(HOST_SERVICES.length)
    }).strict()
  }).strict(),
  z.object({
    state: z.literal("partial"),
    collectedAt: isoDateTimeSchema,
    host: hostMetricsSchema,
    services: z.object({
      available: z.literal(false),
      errorCode: safeCodeSchema,
      items: z.array(hostServiceStateSchema).length(0)
    }).strict()
  }).strict(),
  z.object({ state: z.literal("error"), errorCode: safeCodeSchema }).strict()
]);

export const logsResultSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("ok"),
    service: hostServiceSchema,
    lines: z.array(z.string().min(1).max(2000)).max(MAX_LOG_LINES),
    truncated: z.boolean(),
    discardedLines: z.number().int().min(0).max(1_000_000),
    collectedAt: isoDateTimeSchema
  }).strict(),
  z.object({ state: z.literal("error"), errorCode: safeCodeSchema }).strict()
]);

export const composeValidationResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("valid") }).strict(),
  z.object({ state: z.literal("invalid"), detail: z.string().min(1).max(500) }).strict(),
  z.object({ state: z.literal("error"), errorCode: safeCodeSchema }).strict()
]);

export const operationAcceptedSchema = z.object({
  state: z.literal("accepted"),
  operationId: z.string().uuid()
}).strict();

/**
 * Dispatch outcome. A refusal is a discriminated arm rather than a thrown
 * error so the manager records the agent's own stable code in the journal
 * instead of collapsing every refusal into one generic failure.
 */
export const operationDispatchResultSchema = z.discriminatedUnion("state", [
  operationAcceptedSchema,
  z.object({ state: z.literal("error"), errorCode: safeCodeSchema }).strict()
]);

export const operationResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending") }).strict(),
  z.object({
    state: z.literal("completed"),
    result: z.enum(["succeeded", "failed"]),
    errorCode: safeCodeSchema.nullable(),
    verified: z.boolean(),
    finishedAt: isoDateTimeSchema
  }).strict(),
  /**
   * The agent holds no journal entry for this id (its state file was cleared or
   * the host was rebuilt). Reporting the code lets the manager settle the row as
   * unknown immediately instead of waiting for its timeout.
   */
  z.object({ state: z.literal("error"), errorCode: safeCodeSchema }).strict()
]);

export type HostMetrics = z.infer<typeof hostMetricsSchema>;
export type HostServiceState = z.infer<typeof hostServiceStateSchema>;
export type SystemStatusResult = z.infer<typeof systemStatusResultSchema>;
export type LogsResult = z.infer<typeof logsResultSchema>;
export type ComposeValidationResult = z.infer<typeof composeValidationResultSchema>;
export type OperationAccepted = z.infer<typeof operationAcceptedSchema>;
export type OperationDispatchResult = z.infer<typeof operationDispatchResultSchema>;
export type OperationResult = z.infer<typeof operationResultSchema>;

/** Request body accepted by `POST /api/v1/system/operations`. Unknown keys are rejected. */
export const operationSubmissionSchema = z.object({
  action: operationActionSchema,
  target: operationTargetSchema,
  confirmStackStop: z.literal(true).optional()
}).strict();

export type OperationSubmission = z.infer<typeof operationSubmissionSchema>;

export function parseSystemStatusResult(value: unknown): SystemStatusResult {
  return systemStatusResultSchema.parse(value);
}

export function parseLogsResult(value: unknown): LogsResult {
  return logsResultSchema.parse(value);
}

export function parseComposeValidationResult(value: unknown): ComposeValidationResult {
  return composeValidationResultSchema.parse(value);
}

export function parseOperationAccepted(value: unknown): OperationAccepted {
  return operationAcceptedSchema.parse(value);
}

export function parseOperationDispatchResult(value: unknown): OperationDispatchResult {
  return operationDispatchResultSchema.parse(value);
}

export function parseOperationResult(value: unknown): OperationResult {
  return operationResultSchema.parse(value);
}

export type OperationState = "requested" | "running" | "succeeded" | "failed" | "unknown";

/** Manager-side projection of one audited host operation. */
export interface OperationRecord {
  id: string;
  action: OperationAction;
  target: OperationTarget;
  state: OperationState;
  requestedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  safeErrorCode: string | null;
  requestedBy: string | null;
}

/** Read-only view returned by `GET /api/v1/system/status`. */
export interface SystemStatusView {
  host: HostMetrics;
  collectedAt: string;
  services: { available: boolean; errorCode: string | null; items: HostServiceState[] };
  agent: { reachable: true; protocolVersion: typeof HOST_AGENT_PROTOCOL_VERSION };
  operationsEnabled: boolean;
  recentOperations: OperationRecord[];
}

/** A stack stop removes the interface that would show the operation, so it needs explicit intent. */
export function requiresStackStopConfirmation(submission: OperationSubmission): boolean {
  return submission.action === "stop" && submission.target === "stack";
}


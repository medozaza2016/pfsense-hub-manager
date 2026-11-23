import { exchangeHostAgent } from "../host-agent-transport.js";
import {
  HOST_AGENT_PROTOCOL_VERSION,
  composeValidateRequestSchema,
  operationDispatchRequestSchema,
  operationResultRequestSchema,
  parseComposeValidationResult,
  parseLogsResult,
  parseOperationDispatchResult,
  parseOperationResult,
  parseSystemStatusResult,
  systemLogsRequestSchema,
  systemStatusRequestSchema,
  type ComposeValidationResult,
  type HostService,
  type LogsResult,
  type OperationAction,
  type OperationDispatchResult,
  type OperationResult,
  type OperationTarget,
  type SystemStatusResult
} from "./protocol.js";

/**
 * Fixed-size limits per read operation. Bounds are intentionally tighter than
 * the transport maximum so one slow or chatty agent cannot stall the dashboard.
 */
const STATUS_LIMITS = { timeoutMs: 5_000, maxResponseBytes: 32 * 1024 };
const LOGS_LIMITS = { timeoutMs: 15_000, maxResponseBytes: 96 * 1024 };
const VALIDATION_LIMITS = { timeoutMs: 30_000, maxResponseBytes: 16 * 1024 };
/** Dispatch only acknowledges; it never waits for the Compose work to finish. */
const DISPATCH_LIMITS = { timeoutMs: 10_000, maxResponseBytes: 4 * 1024 };
const RESULT_LIMITS = { timeoutMs: 5_000, maxResponseBytes: 4 * 1024 };

export interface HostAgentCallOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

interface OperationLimits {
  timeoutMs: number;
  maxResponseBytes: number;
}

/**
 * Every call serializes a schema-validated request, so an unsupported service or
 * an unvalidated field can never reach the agent. The parsed envelope is returned
 * unchanged: translating an operation-level failure is the caller's decision.
 */
async function call<TResult>(
  socketPath: string,
  request: unknown,
  parse: (value: unknown) => TResult,
  limits: OperationLimits,
  options: HostAgentCallOptions = {}
): Promise<TResult> {
  return exchangeHostAgent(socketPath, request, parse, {
    timeoutMs: options.timeoutMs ?? limits.timeoutMs,
    maxResponseBytes: options.maxResponseBytes ?? limits.maxResponseBytes
  });
}

/**
 * Validate a request against its strict schema. A rejected promise rather than a
 * thrown Zod error keeps every caller on one failure path, and the stable code
 * keeps schema shape out of the response.
 */
function invalidRequest(): never {
  throw new Error("HOST_AGENT_REQUEST_INVALID");
}

export async function requestHostSystemStatus(
  socketPath: string,
  options: HostAgentCallOptions = {}
): Promise<SystemStatusResult> {
  const parsed = systemStatusRequestSchema.safeParse({
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    operation: "system.status"
  });
  if (!parsed.success) invalidRequest();
  return call(socketPath, parsed.data, parseSystemStatusResult, STATUS_LIMITS, options);
}

export async function requestHostServiceLogs(
  socketPath: string,
  service: HostService,
  lines: number,
  options: HostAgentCallOptions = {}
): Promise<LogsResult> {
  const parsed = systemLogsRequestSchema.safeParse({
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    operation: "system.logs",
    service,
    lines
  });
  if (!parsed.success) invalidRequest();
  return call(socketPath, parsed.data, parseLogsResult, LOGS_LIMITS, options);
}

export async function requestHostComposeValidation(
  socketPath: string,
  options: HostAgentCallOptions = {}
): Promise<ComposeValidationResult> {
  const parsed = composeValidateRequestSchema.safeParse({
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    operation: "compose.validate"
  });
  if (!parsed.success) invalidRequest();
  return call(socketPath, parsed.data, parseComposeValidationResult, VALIDATION_LIMITS, options);
}

/**
 * Ask the agent to start/stop/restart one approved target. The manager owns the
 * identifiers, the agent owns the execution: no command string, no Compose
 * service override, and no caller-supplied path is sent across the socket.
 */
export async function requestHostOperation(
  socketPath: string,
  operation: { operationId: string; action: OperationAction; target: OperationTarget },
  options: HostAgentCallOptions = {}
): Promise<OperationDispatchResult> {
  const parsed = operationDispatchRequestSchema.safeParse({
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    operation: "system.operation",
    operationId: operation.operationId,
    action: operation.action,
    target: operation.target
  });
  if (!parsed.success) invalidRequest();
  return call(socketPath, parsed.data, parseOperationDispatchResult, DISPATCH_LIMITS, options);
}

/** Read the journaled outcome for one operation. Never executes anything. */
export async function requestHostOperationResult(
  socketPath: string,
  operationId: string,
  options: HostAgentCallOptions = {}
): Promise<OperationResult> {
  const parsed = operationResultRequestSchema.safeParse({
    protocolVersion: HOST_AGENT_PROTOCOL_VERSION,
    operation: "system.operationResult",
    operationId
  });
  if (!parsed.success) invalidRequest();
  return call(socketPath, parsed.data, parseOperationResult, RESULT_LIMITS, options);
}

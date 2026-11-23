import { describe, expect, it } from "vitest";
import {
  HOST_AGENT_PROTOCOL_VERSION,
  MAX_LOG_LINES,
  composeValidationResultSchema,
  logsResultSchema,
  operationAcceptedSchema,
  operationDispatchRequestSchema,
  operationResultSchema,
  operationSubmissionSchema,
  parseSystemStatusResult,
  requiresStackStopConfirmation,
  systemLogsRequestSchema,
  systemStatusRequestSchema
} from "./protocol.js";

const uuid = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";

const host = {
  cpuPercent: 12.5,
  cpuCount: 4,
  loadAverage: [0.4, 0.5, 0.6],
  memoryPercent: 41,
  memoryTotalBytes: 8_000_000_000,
  memoryAvailableBytes: 4_000_000_000,
  diskPercent: 55,
  diskTotalBytes: 100_000_000_000,
  diskFreeBytes: 45_000_000_000,
  uptimeSeconds: 90_000
};

describe("host system protocol requests", () => {
  it("pins every request to the current protocol version", () => {
    expect(HOST_AGENT_PROTOCOL_VERSION).toBe(2);
    expect(systemStatusRequestSchema.parse({ protocolVersion: 2, operation: "system.status" }))
      .toEqual({ protocolVersion: 2, operation: "system.status" });
    expect(() => systemStatusRequestSchema.parse({ protocolVersion: 1, operation: "system.status" })).toThrow();
  });

  it("rejects extra keys so no caller can smuggle an instruction", () => {
    expect(() => systemStatusRequestSchema.parse({
      protocolVersion: 2, operation: "system.status", command: "docker compose down"
    })).toThrow();
    expect(() => operationDispatchRequestSchema.parse({
      protocolVersion: 2, operation: "system.operation", operationId: uuid,
      action: "restart", target: "web", container: "code-server"
    })).toThrow();
  });

  it("bounds log line requests and rejects unknown services", () => {
    expect(() => systemLogsRequestSchema.parse({
      protocolVersion: 2, operation: "system.logs", service: "web", lines: 0
    })).toThrow();
    expect(() => systemLogsRequestSchema.parse({
      protocolVersion: 2, operation: "system.logs", service: "web", lines: MAX_LOG_LINES + 1
    })).toThrow();
    expect(() => systemLogsRequestSchema.parse({
      protocolVersion: 2, operation: "system.logs", service: "code-server", lines: 10
    })).toThrow();
    expect(systemLogsRequestSchema.parse({
      protocolVersion: 2, operation: "system.logs", service: "db", lines: MAX_LOG_LINES
    }).service).toBe("db");
  });

  it("restricts operation actions and targets to the allowlist", () => {
    expect(() => operationDispatchRequestSchema.parse({
      protocolVersion: 2, operation: "system.operation", operationId: uuid, action: "kill", target: "web"
    })).toThrow();
    expect(() => operationDispatchRequestSchema.parse({
      protocolVersion: 2, operation: "system.operation", operationId: uuid, action: "restart", target: "code-server"
    })).toThrow();
    expect(operationDispatchRequestSchema.parse({
      protocolVersion: 2, operation: "system.operation", operationId: uuid, action: "restart", target: "stack"
    }).target).toBe("stack");
  });

  it("accepts a strict operation submission body", () => {
    expect(operationSubmissionSchema.parse({ action: "start", target: "web" }))
      .toEqual({ action: "start", target: "web" });
    expect(() => operationSubmissionSchema.parse({ action: "start", target: "web", extra: true })).toThrow();
    expect(() => operationSubmissionSchema.parse({ action: "exec", target: "web" })).toThrow();
  });

  it("requires explicit confirmation only for a stack stop", () => {
    expect(requiresStackStopConfirmation({ action: "stop", target: "stack" })).toBe(true);
    expect(requiresStackStopConfirmation({ action: "restart", target: "stack" })).toBe(false);
    expect(requiresStackStopConfirmation({ action: "stop", target: "web" })).toBe(false);
  });
});

describe("host system protocol results", () => {
  it("accepts a complete status result and rejects fabricated shapes", () => {
    const ok = parseSystemStatusResult({
      state: "ok",
      collectedAt: "2026-11-22T10:00:00Z",
      host,
      services: {
        available: true,
        errorCode: null,
        items: [{
          service: "web",
          containerName: "pfsense-hub-manager-web-1",
          state: "running",
          health: "healthy",
          statusText: "Up 3 hours (healthy)",
          restartCount: 0,
          startedAt: "2026-11-22T07:00:00Z"
        }]
      }
    });
    expect(ok.state).toBe("ok");

    expect(() => parseSystemStatusResult({
      state: "ok", collectedAt: "2026-11-22T10:00:00Z", host,
      services: { available: true, errorCode: null }
    })).toThrow();
    expect(() => parseSystemStatusResult({
      state: "ok", collectedAt: "2026-11-22T10:00:00Z",
      host: { ...host, cpuPercent: 140 },
      services: { available: true, errorCode: null, items: [] }
    })).toThrow();
    expect(() => parseSystemStatusResult({
      state: "error", errorCode: "docker unavailable because the socket is missing"
    })).toThrow();
  });

  it("keeps a partial result honest about unavailable container data", () => {
    expect(parseSystemStatusResult({
      state: "partial",
      collectedAt: "2026-11-22T10:00:00Z",
      host,
      services: { available: false, errorCode: "DOCKER_UNAVAILABLE", items: [] }
    }).state).toBe("partial");
    expect(() => parseSystemStatusResult({
      state: "partial",
      collectedAt: "2026-11-22T10:00:00Z",
      host,
      services: {
        available: false,
        errorCode: "DOCKER_UNAVAILABLE",
        items: [{
          service: "web", containerName: null, state: "unknown", health: "none",
          statusText: null, restartCount: null, startedAt: null
        }]
      }
    })).toThrow();
  });

  it("bounds log payloads and validation detail", () => {
    const logs = logsResultSchema.parse({
      state: "ok", service: "web", lines: ["line one"], truncated: false,
      discardedLines: 0, collectedAt: "2026-11-22T10:00:00Z"
    });
    expect(logs.state === "ok" ? logs.lines.length : -1).toBe(1);
    expect(() => logsResultSchema.parse({
      state: "ok", service: "web", lines: Array.from({ length: MAX_LOG_LINES + 1 }, () => "x"),
      truncated: false, discardedLines: 0, collectedAt: "2026-11-22T10:00:00Z"
    })).toThrow();
    expect(() => composeValidationResultSchema.parse({ state: "invalid", detail: "x".repeat(501) })).toThrow();
    expect(composeValidationResultSchema.parse({ state: "valid" }).state).toBe("valid");
  });

  it("validates operation responses", () => {
    expect(operationAcceptedSchema.parse({ state: "accepted", operationId: uuid }).operationId).toBe(uuid);
    expect(() => operationAcceptedSchema.parse({ state: "accepted", operationId: "not-a-uuid" })).toThrow();
    expect(operationResultSchema.parse({ state: "pending" }).state).toBe("pending");
    expect(operationResultSchema.parse({ state: "error", errorCode: "OPERATION_NOT_FOUND" }).state).toBe("error");
    expect(() => operationResultSchema.parse({
      state: "error", errorCode: "OPERATION_NOT_FOUND", verified: true
    })).toThrow();
    expect(() => operationResultSchema.parse({
      state: "completed", result: "succeeded", errorCode: "X", verified: true,
      finishedAt: "2026-11-22T10:00:00Z"
    })).toThrow();
  });
});

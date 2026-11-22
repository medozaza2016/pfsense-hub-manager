import { describe, expect, it } from "vitest";
import { createHostDeploymentRequest, parseHostDeploymentResult } from "./deployment-agent-protocol.js";

describe("host deployment protocol", () => {
  it("creates a minimal versioned request", () => {
    expect(createHostDeploymentRequest("00000000-0000-4000-8000-000000000001", 7)).toEqual({
      protocolVersion: 1, deploymentId: "00000000-0000-4000-8000-000000000001", desiredRevision: 7
    });
  });

  it("rejects arbitrary operational instructions in requests", () => {
    expect(() => createHostDeploymentRequest("00000000-0000-4000-8000-000000000001", 7)).not.toThrow();
    expect(() => parseHostDeploymentResult({ state: "succeeded", appliedOrigin: "https://hub.example.test", command: "docker compose down" })).toThrow();
  });

  it("accepts only a verified success origin", () => {
    expect(parseHostDeploymentResult({ state: "succeeded", appliedOrigin: "https://hub.example.test:443" }).state).toBe("succeeded");
    expect(() => parseHostDeploymentResult({ state: "succeeded", appliedOrigin: "http://192.0.2.10:8080" })).toThrow();
    expect(() => parseHostDeploymentResult({ state: "succeeded", appliedOrigin: "not-a-url" })).toThrow();
  });

  it("requires explicit rollback evidence for a rolled-back result", () => {
    expect(parseHostDeploymentResult({ state: "rolled_back", errorCode: "PROBE_FAILED", rollbackSucceeded: true }).state).toBe("rolled_back");
    expect(() => parseHostDeploymentResult({ state: "rolled_back", errorCode: "PROBE_FAILED", rollbackSucceeded: false })).toThrow();
  });
});

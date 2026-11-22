import { describe, expect, it } from "vitest";
import { deploymentConfirmationSchema, hubAccessEndpointsSchema } from "./hub-settings.js";

const endpoint = (method: "local" | "tailscale" | "hostname", overrides: Record<string, unknown> = {}) => ({
  method,
  addressType: null,
  address: null,
  httpsPort: 443,
  enabled: method === "local",
  ...overrides
});

const allMethods = (overrides: Record<string, Record<string, unknown>> = {}) => ({
  endpoints: [
    endpoint("local", overrides.local),
    endpoint("tailscale", overrides.tailscale),
    endpoint("hostname", overrides.hostname)
  ]
});

describe("Hub access endpoint validation", () => {
  it("accepts all three saved methods with exactly LAN active", () => {
    expect(hubAccessEndpointsSchema.safeParse(allMethods()).success).toBe(true);
  });

  it("accepts switching the sole active method to Tailscale", () => {
    const result = hubAccessEndpointsSchema.safeParse(allMethods({
      local: { enabled: false },
      tailscale: { addressType: "magic_dns", address: "hub.example-tailnet.ts.net", enabled: true }
    }));
    expect(result.success).toBe(true);
  });

  it("preserves an incomplete address selection on an inactive tab", () => {
    const result = hubAccessEndpointsSchema.safeParse(allMethods({
      tailscale: { addressType: "magic_dns", address: null, enabled: false }
    }));
    expect(result.success).toBe(true);
  });

  it("requires an address for an active Tailscale or Custom method", () => {
    expect(hubAccessEndpointsSchema.safeParse(allMethods({
      local: { enabled: false },
      tailscale: { enabled: true, addressType: "magic_dns", address: null }
    })).success).toBe(false);
    expect(hubAccessEndpointsSchema.safeParse(allMethods({
      local: { enabled: false },
      hostname: { enabled: true, addressType: "hostname", address: null }
    })).success).toBe(false);
  });

  it("requires exactly one active method", () => {
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint("local", { enabled: false }),
      endpoint("tailscale", { enabled: false }),
      endpoint("hostname", { enabled: false })
    ] }).success).toBe(false);
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint("local", { enabled: true }),
      endpoint("tailscale", { enabled: true, addressType: "magic_dns", address: "hub.example-tailnet.ts.net" }),
      endpoint("hostname", { enabled: false })
    ] }).success).toBe(false);
  });

  it("requires all three methods exactly once", () => {
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint("local"), endpoint("local"), endpoint("hostname")
    ] }).success).toBe(false);
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint("local"), endpoint("tailscale")
    ] }).success).toBe(false);
  });

  it("rejects invalid IP addresses, wildcard addresses, and ports", () => {
    expect(hubAccessEndpointsSchema.safeParse(allMethods({
      local: { addressType: "ip", address: "not-an-ip" }
    })).success).toBe(false);
    expect(hubAccessEndpointsSchema.safeParse(allMethods({
      local: { addressType: "ip", address: "0.0.0.0" }
    })).success).toBe(false);
    expect(hubAccessEndpointsSchema.safeParse(allMethods({
      local: { httpsPort: 70000 }
    })).success).toBe(false);
  });
});

describe("Hub deployment confirmation validation", () => {
  it("requires an explicit confirmation for the exact positive revision", () => {
    expect(deploymentConfirmationSchema.safeParse({ confirmation: "APPLIED", expectedRevision: 1 }).success).toBe(true);
    expect(deploymentConfirmationSchema.safeParse({ confirmation: "APPLIED" }).success).toBe(false);
    expect(deploymentConfirmationSchema.safeParse({ confirmation: "APPLIED", expectedRevision: 0 }).success).toBe(false);
    expect(deploymentConfirmationSchema.safeParse({ confirmation: "APPLIED", expectedRevision: 1, extra: true }).success).toBe(false);
  });
});

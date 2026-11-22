import { describe, expect, it } from "vitest";
import { hubAccessEndpointsSchema } from "./hub-settings.js";

const endpoint = (overrides: Record<string, unknown> = {}) => ({
  method: "local",
  addressType: null,
  address: null,
  httpsPort: 443,
  enabled: true,
  ...overrides
});

describe("Hub access endpoint validation", () => {
  it("accepts local, Tailscale, and hostname endpoints together", () => {
    const result = hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint(),
      endpoint({ method: "tailscale", addressType: "magic_dns", address: "hub.example-tailnet.ts.net" }),
      endpoint({ method: "hostname", addressType: "hostname", address: "hub.example.com" })
    ] });
    expect(result.success).toBe(true);
  });

  it("requires an address for enabled remote endpoints", () => {
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint({ method: "tailscale", addressType: null, address: null })
    ] }).success).toBe(false);
  });

  it("accepts a disabled remote endpoint without an address", () => {
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint({ method: "tailscale", addressType: null, address: null, enabled: false })
    ] }).success).toBe(true);
  });

  it("rejects duplicate access methods", () => {
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint(), endpoint()
    ] }).success).toBe(false);
  });

  it("rejects invalid IP addresses and ports", () => {
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint({ method: "tailscale", addressType: "tailscale_ip", address: "not-an-ip" })
    ] }).success).toBe(false);
    expect(hubAccessEndpointsSchema.safeParse({ endpoints: [
      endpoint({ httpsPort: 70000 })
    ] }).success).toBe(false);
  });
});

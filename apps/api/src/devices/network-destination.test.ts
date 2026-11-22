import { describe, expect, it, vi } from "vitest";
import {
  isAllowedDeviceAddress,
  resolveSafeDeviceDestination
} from "./network-destination.js";

describe("device destination address policy", () => {
  it.each([
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.254",
    "192.168.1.1",
    "100.100.100.100",
    "100.64.0.1",
    "fd7a:115c:a1e0::1",
    "fc00::1",
    "2001:4860:4860::8888"
  ])("allows private or globally routable firewall address %s", address => {
    expect(isAllowedDeviceAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "127.0.0.1",
    "169.254.169.254",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2002::1",
    "2001:0000::1",
    "2001:0020::1",
    "3fff::1"
  ])("rejects special-use or non-global destination %s", address => {
    expect(isAllowedDeviceAddress(address)).toBe(false);
  });

  it("accepts bracketed IPv6 literals", () => {
    expect(isAllowedDeviceAddress("[fd7a:115c:a1e0::1]")).toBe(true);
  });
});

describe("safe device hostname resolution", () => {
  it("returns an allowed literal without invoking DNS", async () => {
    const resolver = vi.fn();
    await expect(resolveSafeDeviceDestination("192.168.1.1", resolver))
      .resolves.toEqual({ address: "192.168.1.1", family: 4 });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("resolves hostnames and returns the selected address", async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: "192.168.10.1", family: 4 },
      { address: "fd7a:115c:a1e0::1", family: 6 }
    ]);
    await expect(resolveSafeDeviceDestination("firewall.example.net", resolver))
      .resolves.toEqual({ address: "192.168.10.1", family: 4 });
    expect(resolver).toHaveBeenCalledWith("firewall.example.net");
  });

  it("rejects a hostname if any DNS answer is unsafe", async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: "192.168.10.1", family: 4 },
      { address: "169.254.169.254", family: 4 }
    ]);
    await expect(resolveSafeDeviceDestination("firewall.example.net", resolver))
      .rejects.toThrow(/unsafe or unsupported/);
  });

  it("rejects an empty DNS answer", async () => {
    await expect(resolveSafeDeviceDestination("firewall.example.net", async () => []))
      .rejects.toThrow(/unsafe or unsupported/);
  });

  it("does not permit localhost hostnames", async () => {
    await expect(resolveSafeDeviceDestination("router.localhost", async () => []))
      .rejects.toThrow(/not an allowed destination/);
  });

  it("does not permit a DNS result with a mismatched address family", async () => {
    await expect(resolveSafeDeviceDestination("firewall.example.net", async () => [
      { address: "192.168.10.1", family: 6 }
    ])).rejects.toThrow(/unsafe or unsupported/);
  });

  it("does not disclose resolver errors", async () => {
    await expect(resolveSafeDeviceDestination("firewall.example.net", async () => {
      throw new Error("private resolver detail");
    })).rejects.toThrow("The configured firewall hostname could not be resolved.");
  });
});

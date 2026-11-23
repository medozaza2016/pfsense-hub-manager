import { describe, expect, it } from "vitest";
import {
  ObservationShapeError,
  deriveCapabilities,
  evaluateCompatibility,
  inferEdition,
  parseGatewayObservations,
  parseInterfaceObservations,
  parseServiceObservations,
  parseStateSummary,
  parseSystemObservation,
  parseUptimeSeconds,
  parseVersionObservation,
  toCompatibilityObservation
} from "./observations.js";

describe("uptime parsing", () => {
  it("converts a fully formed pfSense uptime string", () => {
    expect(parseUptimeSeconds("3 Days 04:05:06")).toBe(273906);
    expect(parseUptimeSeconds("1 Day 00:00:01")).toBe(86401);
    expect(parseUptimeSeconds("12:00:00")).toBe(43200);
  });

  it("returns null instead of guessing from a partial or impossible value", () => {
    expect(parseUptimeSeconds("about a day")).toBeNull();
    expect(parseUptimeSeconds("3 Days")).toBeNull();
    expect(parseUptimeSeconds("0 Days 25:00:00")).toBeNull();
    expect(parseUptimeSeconds(null)).toBeNull();
  });
});

describe("system observations", () => {
  it("keeps only allowlisted fields and never exposes identifying hardware data", () => {
    const observation = parseSystemObservation({
      platform: "pfSense CE",
      serial: "SECRET",
      netgate_id: "NETGATE-ID",
      uptime: "2 Days 01:02:03",
      cpu_count: 4,
      cpu_usage: 12.3456,
      mem_usage: 44,
      disk_usage: 21,
      swap_usage: 0,
      cpu_load_avg: [0.12, 0.2, 0.31],
      bios_vendor: "Vendor"
    });

    expect(observation).toEqual({
      platform: "pfSense CE",
      uptimeText: "2 Days 01:02:03",
      uptimeSeconds: 176523,
      cpuCount: 4,
      cpuUsagePercent: 12.3,
      memoryUsagePercent: 44,
      diskUsagePercent: 21,
      swapUsagePercent: 0,
      loadAverage: [0.12, 0.2, 0.31]
    });
    expect(Object.keys(observation)).not.toContain("serial");
    expect(JSON.stringify(observation)).not.toContain("SECRET");
    expect(JSON.stringify(observation)).not.toContain("NETGATE-ID");
  });

  it("nulls an out-of-range value instead of clamping it", () => {
    const observation = parseSystemObservation({ cpu_usage: -5, mem_usage: "high", cpu_count: 2.5, uptime: "never" });
    expect(observation.cpuUsagePercent).toBeNull();
    expect(observation.memoryUsagePercent).toBeNull();
    expect(observation.cpuCount).toBeNull();
    expect(observation.uptimeText).toBe("never");
    expect(observation.uptimeSeconds).toBeNull();
  });

  it("strips control characters from text fields", () => {
    const observation = parseSystemObservation({ platform: "pfSense\u0000\nPlus" });
    expect(observation.platform).toBe("pfSense  Plus");
  });

  it("rejects a non-object payload with a typed shape error", () => {
    expect(() => parseSystemObservation([])).toThrow(ObservationShapeError);
    expect(() => parseSystemObservation(null)).toThrow(ObservationShapeError);
  });
});

describe("list observations", () => {
  it("drops interface MAC, hardware name, and counters", () => {
    const [entry] = parseInterfaceObservations([{
      name: "wan", descr: "WAN", hwif: "igb0", macaddr: "00:11:22:33:44:55",
      mtu: "1500", enable: true, status: "up", ipaddr: "192.0.2.2", subnet: "24",
      ipaddrv6: "", inbytes: 1, outbytes: 2, inpkts: 3
    }]);
    expect(entry).toEqual({
      name: "wan", description: "WAN", enabled: true, status: "up",
      ipv4: "192.0.2.2", subnet: "24", ipv6: null, mtu: 1500, media: null
    });
  });

  it("drops gateway monitor and source addresses", () => {
    const [entry] = parseGatewayObservations([{
      name: "WAN_DHCP", srcip: "192.0.2.2", monitorip: "192.0.2.1",
      delay: 0.8123, stddev: 0.2, loss: 0, status: "online", substatus: "none"
    }]);
    expect(entry).toEqual({ name: "WAN_DHCP", delayMs: 0.8, stddevMs: 0.2, lossPercent: 0, status: "online", substatus: "none" });
  });

  it("maps the service status boolean to running", () => {
    const [entry] = parseServiceObservations([{ name: "unbound", description: "DNS Resolver", enabled: true, status: false }]);
    expect(entry).toEqual({ name: "unbound", description: "DNS Resolver", enabled: true, running: false });
  });

  it("rejects an array element that is not an object", () => {
    expect(() => parseGatewayObservations([null])).toThrow(ObservationShapeError);
    expect(() => parseServiceObservations({})).toThrow(ObservationShapeError);
  });
});

describe("state summary", () => {
  it("retains counts and limits only", () => {
    expect(parseStateSummary({
      arpTable: [{ ip: "192.168.1.1", mac: "aa:bb" }],
      firewallStates: [{ src: "1.1.1.1" }, { src: "1.1.1.2" }],
      stateTableSize: { currentstates: 2337, maximumstates: 340000 }
    })).toEqual({ arpEntries: 1, firewallStates: 2, stateTableCurrent: 2337, stateTableLimit: 340000 });
  });

  it("reports nulls when a summary operation failed", () => {
    expect(parseStateSummary({})).toEqual({ arpEntries: null, firewallStates: null, stateTableCurrent: null, stateTableLimit: null });
  });
});

describe("compatibility", () => {
  it("infers an edition only from explicit evidence", () => {
    expect(inferEdition("pfSense Plus", null)).toBe("plus");
    expect(inferEdition("pfSense CE", null)).toBe("ce");
    expect(inferEdition("pfSense", "2.7.2-RELEASE")).toBeNull();
    expect(inferEdition(null, null)).toBeNull();
  });

  it("verifies, mismatches, or stays unknown without inventing a verdict", () => {
    const system = parseSystemObservation({ platform: "pfSense Plus" });
    const version = parseVersionObservation({ version: "26.07.2-RELEASE" });

    expect(evaluateCompatibility("plus", system, version)).toEqual({ verdict: "verified", reportedEdition: "plus" });
    expect(evaluateCompatibility("ce", system, version)).toEqual({ verdict: "mismatch", reportedEdition: "plus" });
    expect(evaluateCompatibility("ce", system, null).verdict).toBe("unknown");

    const observation = toCompatibilityObservation("unknown", system, version, "2026-11-23T10:00:00.000Z");
    expect(observation).toMatchObject({ verdict: "verified", apiPackageVersion: null, checkedAt: "2026-11-23T10:00:00.000Z" });
    expect(toCompatibilityObservation("ce", system, null, "2026-11-23T10:00:00.000Z").checkedAt).toBeNull();
  });
});

describe("capability derivation", () => {
  it("reports every capability as unverified before the first poll", () => {
    const capabilities = deriveCapabilities(new Map());
    expect(capabilities).toHaveLength(8);
    expect(capabilities.every(item => item.verification === "unverified" && item.supported === null)).toBe(true);
  });

  it("treats only refusal-class failures as unsupported", () => {
    const capabilities = deriveCapabilities(new Map([
      ["system", { outcome: "success", completedAt: "2026-11-23T10:00:00.000Z", errorClass: null }],
      ["gateways", { outcome: "failure", completedAt: "2026-11-23T10:00:00.000Z", errorClass: "authorization" }],
      ["interfaces", { outcome: "failure", completedAt: "2026-11-23T10:00:00.000Z", errorClass: "invalid_response" }]
    ]));
    const byKey = new Map(capabilities.map(item => [item.key, item]));

    expect(byKey.get("status.system.read")).toMatchObject({ supported: true, verification: "verified" });
    expect(byKey.get("status.gateways.read")).toMatchObject({ supported: false, verification: "failed" });
    expect(byKey.get("status.interfaces.read")).toMatchObject({ supported: null, verification: "failed" });
    expect(byKey.get("status.services.read")).toMatchObject({ supported: null, verification: "unverified" });
  });
});

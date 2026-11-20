import { describe, expect, it } from "vitest";
import { pfSenseOperations } from "./client.js";

describe("pfSense upstream operation allowlist", () => {
  it("contains exactly the eight approved read-only GET operations", () => {
    expect(pfSenseOperations).toEqual([
      "system", "gateways", "interfaces", "services", "version",
      "arpTable", "firewallStates", "firewallStateSize"
    ]);
  });
});

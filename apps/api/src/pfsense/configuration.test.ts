import { describe, expect, it } from "vitest";
import { ALIAS_LIMITS, ConfigurationShapeError, parseAliasObservations } from "./configuration.js";

describe("alias configuration sanitizer", () => {
  it("keeps only the fields the Aliases page displays", () => {
    const parsed = parseAliasObservations([{
      name: "LAN_NETWORK",
      type: "network",
      descr: "Local LAN",
      address: ["192.168.10.0/24"],
      detail: ["primary LAN"],
      id: 3,
      tracker: 1699999999
    }]);

    expect(parsed.truncated).toBe(false);
    expect(parsed.aliases).toEqual([{
      name: "LAN_NETWORK",
      type: "network",
      description: "Local LAN",
      entries: ["192.168.10.0/24"],
      entryCount: 1,
      entriesTruncated: false
    }]);
    expect(parsed.aliases[0]).not.toHaveProperty("id");
    expect(parsed.aliases[0]).not.toHaveProperty("detail");
  });

  it("leaves an unrecognized alias type unset instead of guessing", () => {
    const parsed = parseAliasObservations([{ name: "ODD", type: "url", address: [] }]);
    expect(parsed.aliases[0]?.type).toBeNull();
  });

  it("ignores non-string address entries and control characters", () => {
    const parsed = parseAliasObservations([{
      name: "MIXED",
      type: "host",
      descr: "  \n ",
      address: ["10.0.0.1", 7, null, "\u0000bad\u001fentry", "  "]
    }]);

    expect(parsed.aliases[0]?.entries).toEqual(["10.0.0.1", "bad entry"]);
    expect(parsed.aliases[0]?.entryCount).toBe(2);
    expect(parsed.aliases[0]?.description).toBeNull();
  });

  it("caps entries per alias and reports that entries were withheld", () => {
    const address = Array.from({ length: ALIAS_LIMITS.maxEntriesPerAlias + 5 }, (_, index) => `10.0.${index}.1`);
    const parsed = parseAliasObservations([{ name: "BIG", type: "host", address }]);

    expect(parsed.aliases[0]?.entries).toHaveLength(ALIAS_LIMITS.maxEntriesPerAlias);
    expect(parsed.aliases[0]?.entryCount).toBe(ALIAS_LIMITS.maxEntriesPerAlias + 5);
    expect(parsed.aliases[0]?.entriesTruncated).toBe(true);
  });

  it("caps the alias list and reports that it was truncated", () => {
    const rows = Array.from({ length: ALIAS_LIMITS.maxAliases + 1 }, (_, index) => ({ name: `A${index}`, type: "host", address: [] }));
    const parsed = parseAliasObservations(rows);

    expect(parsed.aliases).toHaveLength(ALIAS_LIMITS.maxAliases);
    expect(parsed.truncated).toBe(true);
  });

  it("rejects a response that is not a list of objects", () => {
    expect(() => parseAliasObservations({ data: [] })).toThrow(ConfigurationShapeError);
    expect(() => parseAliasObservations(["alias"])).toThrow(ConfigurationShapeError);
    expect(() => parseAliasObservations(null)).toThrow(ConfigurationShapeError);
  });
});

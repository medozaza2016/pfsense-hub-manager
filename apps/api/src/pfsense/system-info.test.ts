import { describe, expect, it } from "vitest";
import { PageReadShapeError } from "./page-read.js";
import { parseRestApiVersion } from "./system-info.js";

describe("REST API package version sanitizer", () => {
  it("reports the installed version without any other upstream field", () => {
    const parsed = parseRestApiVersion({
      current_version: "2.6.0",
      latest_version: "2.6.1",
      latest_version_release_date: "2026-02-01",
      update_available: true
    });

    expect(parsed.items).toEqual([{
      currentVersion: "2.6.0",
      latestVersion: "2.6.1",
      latestReleaseDate: "2026-02-01",
      updateAvailable: true
    }]);
    expect(parsed.truncated).toBe(false);
  });

  it("reports missing or mistyped values as unknown rather than guessing", () => {
    const parsed = parseRestApiVersion({ current_version: 260, update_available: "yes" });
    expect(parsed.items[0]).toMatchObject({ currentVersion: null, updateAvailable: null });
  });

  it("rejects a list where the endpoint documents an object", () => {
    expect(() => parseRestApiVersion([])).toThrow(PageReadShapeError);
  });
});

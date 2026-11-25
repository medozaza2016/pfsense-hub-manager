import { capList, booleanValue, objectShape, text, type ParsedRead } from "./page-read.js";

/**
 * Sanitized system metadata for the Compatibility page (DEC-048).
 *
 * This is not configuration: it reports which REST API package version is
 * installed, which the operator needs in order to record per-endpoint verification.
 * The manager previously had to report this value as unknown because no approved
 * endpoint exposed it.
 */

export interface RestApiVersionObservation {
  currentVersion: string | null;
  latestVersion: string | null;
  latestReleaseDate: string | null;
  updateAvailable: boolean | null;
}

export function parseRestApiVersion(data: unknown): ParsedRead<RestApiVersionObservation> {
  const entry = objectShape(data, "the REST API package version");
  return capList([{
    currentVersion: text(entry.current_version, 64),
    latestVersion: text(entry.latest_version, 64),
    latestReleaseDate: text(entry.latest_version_release_date, 64),
    updateAvailable: booleanValue(entry.update_available)
  }]);
}

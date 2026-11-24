import { z } from "zod";

/**
 * Sanitized read models for the page-scoped configuration contract (DEC-047).
 *
 * Firewall responses are untrusted input. As with `observations.ts`, every field
 * below is validated and then copied into an explicitly constructed object;
 * upstream payloads are never spread, so a field the manager did not ask for
 * cannot reach the browser or a log. Configuration reads are not part of the
 * health-poll capability evidence and are never written to `poll_runs`.
 */

/** Alias `type` in the upstream schema. An unknown value stays null, not guessed. */
export type AliasType = "host" | "network" | "port";

export interface AliasObservation {
  name: string | null;
  type: AliasType | null;
  description: string | null;
  /** At most `ALIAS_LIMITS.maxEntriesPerAlias` entries, in firewall order. */
  entries: string[];
  /** How many entries the firewall actually reported, before any cap. */
  entryCount: number;
  /** True when entries were withheld from `entries` because of the cap. */
  entriesTruncated: boolean;
}

export interface AliasCollectionObservation {
  deviceId: string;
  collectedAt: string;
  aliases: AliasObservation[];
  /** True when the firewall reported more aliases than the manager retains. */
  truncated: boolean;
}

/**
 * Bounds keep one oversized or hostile response from growing the in-process
 * cache without limit and from being rendered as an unbounded table.
 */
export const ALIAS_LIMITS = {
  maxAliases: 2_000,
  maxEntriesPerAlias: 200,
  maxEntryLength: 256,
  maxNameLength: 31,
  maxDescriptionLength: 200
} as const;

export class ConfigurationShapeError extends Error {
  constructor(readonly operation: string, readonly detail: string) {
    super(`Firewall returned an invalid data shape for the ${operation} configuration.`);
    this.name = "ConfigurationShapeError";
  }
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, " ").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
}

function aliasType(value: unknown): AliasType | null {
  return value === "host" || value === "network" || value === "port" ? value : null;
}

const recordList = z.array(z.record(z.string(), z.unknown()));

/**
 * Validates the alias list envelope and returns only the fields the Aliases page
 * displays. `detail` (per-entry descriptions) and any undocumented upstream field
 * such as an internal `id` are deliberately not modeled.
 */
export function parseAliasObservations(data: unknown): { aliases: AliasObservation[]; truncated: boolean } {
  const parsed = recordList.safeParse(data);
  if (!parsed.success) {
    throw new ConfigurationShapeError("firewall aliases", "expected a JSON array of objects");
  }

  const truncated = parsed.data.length > ALIAS_LIMITS.maxAliases;
  const aliases = parsed.data.slice(0, ALIAS_LIMITS.maxAliases).map(entry => {
    const addresses = Array.isArray(entry.address) ? entry.address : [];
    const entries = addresses
      .map(address => text(address, ALIAS_LIMITS.maxEntryLength))
      .filter((address): address is string => address !== null);
    return {
      name: text(entry.name, ALIAS_LIMITS.maxNameLength),
      type: aliasType(entry.type),
      description: text(entry.descr, ALIAS_LIMITS.maxDescriptionLength),
      entries: entries.slice(0, ALIAS_LIMITS.maxEntriesPerAlias),
      entryCount: entries.length,
      entriesTruncated: entries.length > ALIAS_LIMITS.maxEntriesPerAlias
    };
  });

  return { aliases, truncated };
}

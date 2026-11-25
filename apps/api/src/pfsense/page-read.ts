import { z } from "zod";

/**
 * Shared primitives for page-scoped reads (DEC-047, DEC-048).
 *
 * Firewall responses are untrusted input. Every parser in `configuration.ts` and
 * `vpn-status.ts` validates the envelope here and then copies individual fields
 * into a new object; an upstream payload is never spread, so a field the manager
 * did not ask for cannot reach the browser, a log, or an error message.
 *
 * These reads are on-demand page reads. They are not part of the health poll, are
 * never written to `poll_runs`, and never change capability evidence.
 */

/**
 * Bounds keep one oversized or hostile response from growing the in-process
 * cache without limit and from being rendered as an unbounded table.
 */
export const PAGE_READ_LIMITS = {
  /** Maximum records retained from one list endpoint. */
  maxItems: 2_000,
  /** Maximum entries retained from one nested list on a single record. */
  maxNestedEntries: 200,
  /** Maximum length of one nested list entry (an address, CIDR, domain, ...). */
  maxNestedEntryLength: 256,
  /** Maximum length of a free-text or description field. */
  maxTextLength: 200,
  /** Maximum length of an identifier or address field. */
  maxIdentifierLength: 64
} as const;

export class PageReadShapeError extends Error {
  constructor(readonly operation: string, readonly detail: string) {
    super(`Firewall returned an invalid data shape for ${operation}.`);
    this.name = "PageReadShapeError";
  }
}

/** A capped list plus whether anything was withheld because of the cap. */
export interface ParsedRead<T> {
  items: T[];
  truncated: boolean;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const recordSchema = z.record(z.string(), z.unknown());
const recordListSchema = z.array(recordSchema);

/** Free text: control characters removed, trimmed, capped, empty becomes null. */
export function text(value: unknown, maxLength: number = PAGE_READ_LIMITS.maxTextLength): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARACTERS, " ").trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
}

/** Identifier, address, network, or port: shorter cap than free text. */
export function identifier(value: unknown): string | null {
  return text(value, PAGE_READ_LIMITS.maxIdentifierLength);
}

/** A safe integer inside an explicit range; anything else is unknown, not clamped. */
export function integer(value: unknown, min: number, max: number): number | null {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?\d{1,18}$/.test(value.trim()) ? Number(value.trim()) : null;
  if (numeric === null || !Number.isSafeInteger(numeric) || numeric < min || numeric > max) return null;
  return numeric;
}

/** Only a real JSON boolean is accepted; `1`, `"yes"`, and `null` stay unknown. */
export function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** An enum member the manager understands, or null for a value it does not. */
export function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T[number] : null;
}

/**
 * A list of scalar strings. A single string is treated as a one-element list,
 * because some releases return a scalar where the schema documents an array.
 * Non-string members are dropped rather than stringified.
 */
export function stringList(
  value: unknown,
  maxItems: number = PAGE_READ_LIMITS.maxNestedEntries,
  maxLength: number = PAGE_READ_LIMITS.maxNestedEntryLength
): string[] {
  const source = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const items: string[] = [];
  for (const entry of source) {
    const parsed = text(entry, maxLength);
    if (parsed !== null) items.push(parsed);
    if (items.length >= maxItems) break;
  }
  return items;
}

/** Length of a nested array the manager does not model, for a count only. */
export function nestedCount(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

export function objectShape(value: unknown, operation: string): Record<string, unknown> {
  const parsed = recordSchema.safeParse(value);
  if (!parsed.success) throw new PageReadShapeError(operation, "expected a JSON object");
  return parsed.data;
}

export function recordList(value: unknown, operation: string): Array<Record<string, unknown>> {
  const parsed = recordListSchema.safeParse(value);
  if (!parsed.success) throw new PageReadShapeError(operation, "expected a JSON array of objects");
  return parsed.data;
}

export function capList<T>(items: T[], maxItems: number = PAGE_READ_LIMITS.maxItems): ParsedRead<T> {
  return { items: items.slice(0, maxItems), truncated: items.length > maxItems };
}

const MIN_EPOCH_SECONDS = 946_684_800; // 2000-01-01T00:00:00Z
const MAX_EPOCH_SECONDS = 4_102_444_800; // 2100-01-01T00:00:00Z

/** Unix seconds from the firewall rendered as an ISO instant, or null. */
export function isoFromEpochSeconds(value: unknown): string | null {
  const seconds = integer(value, MIN_EPOCH_SECONDS, MAX_EPOCH_SECONDS);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

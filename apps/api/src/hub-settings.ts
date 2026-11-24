import { z } from "zod";

const hostnameSchema = z.string().min(1).max(253).regex(
  /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
);

export const hubAccessEndpointSchema = z.object({
  method: z.enum(["local", "tailscale", "hostname"]),
  addressType: z.enum(["magic_dns", "tailscale_ip", "hostname", "ip"]).nullable(),
  address: z.string().trim().max(253).nullable(),
  httpsPort: z.number().int().min(1).max(65535),
  enabled: z.boolean()
}).strict().superRefine((endpoint, context) => {
  const { method, addressType, address, enabled } = endpoint;
  const invalid = (message: string) => context.addIssue({ code: "custom", message, path: ["address"] });

  if (addressType === null && address !== null) invalid("An address type is required when an address is provided.");
  if (enabled && addressType !== null && !address) invalid("An address is required when an address type is selected.");

  if (method === "local" && addressType !== null && !["hostname", "ip"].includes(addressType)) {
    invalid("LAN access accepts a hostname or IP address.");
  }
  if (method === "tailscale" && addressType !== null && !["magic_dns", "tailscale_ip"].includes(addressType)) {
    invalid("Tailscale accepts a MagicDNS hostname or Tailscale IPv4 address.");
  }
  if (method === "hostname" && addressType !== null && !["hostname", "ip"].includes(addressType)) {
    invalid("Custom access accepts a hostname or IP address.");
  }
  if (enabled && method === "tailscale" && addressType === "tailscale_ip") {
    invalid("HTTPS access requires the Hub host's Tailscale MagicDNS hostname, not its Tailscale IP address.");
  }
  if (enabled && (!addressType || !address)) {
    invalid("A hostname or IP address is required for the active access method.");
  }
  if (address && ["ip", "tailscale_ip"].includes(addressType ?? "")) {
    const valid = addressType === "tailscale_ip"
      ? z.ipv4().safeParse(address).success
      : z.union([z.ipv4(), z.ipv6()]).safeParse(address).success;
    if (!valid) invalid("Enter a valid IP address.");
    if (address === "0.0.0.0" || address === "::") invalid("Wildcard addresses are not allowed. Enter a specific interface address.");
  }
  if (address && ["hostname", "magic_dns"].includes(addressType ?? "") && !hostnameSchema.safeParse(address).success) {
    invalid("Enter a valid fully qualified hostname.");
  }
});

export const hubAccessEndpointsSchema = z.object({
  endpoints: z.array(hubAccessEndpointSchema).length(3)
}).strict().superRefine(({ endpoints }, context) => {
  const methods = endpoints.map(endpoint => endpoint.method);
  if (new Set(methods).size !== methods.length) {
    context.addIssue({ code: "custom", message: "LAN, Tailscale, and Custom must each appear exactly once.", path: ["endpoints"] });
  }
  if (!["local", "tailscale", "hostname"].every(method => methods.includes(method as HubAccessEndpoint["method"]))) {
    context.addIssue({ code: "custom", message: "All three access methods must be included.", path: ["endpoints"] });
  }
  if (endpoints.filter(endpoint => endpoint.enabled).length !== 1) {
    context.addIssue({ code: "custom", message: "Select exactly one active access method.", path: ["endpoints"] });
  }
});


export type HubAccessEndpoint = z.infer<typeof hubAccessEndpointSchema>;

/**
 * Runtime background-polling settings (DEC-044).
 *
 * These bounds are the same ones `PollScheduler` asserts in its constructor and
 * migration 017 enforces with CHECK constraints. The route rejects first so no
 * scheduler is ever constructed with values the API would refuse.
 */
export const POLLING_SETTING_BOUNDS = {
  intervalMs: { min: 15_000, max: 3_600_000 },
  concurrency: { min: 1, max: 8 },
  jitterMs: { min: 0, max: 60_000 },
  retentionDays: { min: 1, max: 365 }
} as const;

export const pollingSettingsSchema = z.object({
  intervalMs: z.number().int().min(POLLING_SETTING_BOUNDS.intervalMs.min).max(POLLING_SETTING_BOUNDS.intervalMs.max),
  concurrency: z.number().int().min(POLLING_SETTING_BOUNDS.concurrency.min).max(POLLING_SETTING_BOUNDS.concurrency.max),
  jitterMs: z.number().int().min(POLLING_SETTING_BOUNDS.jitterMs.min).max(POLLING_SETTING_BOUNDS.jitterMs.max),
  retentionDays: z.number().int().min(POLLING_SETTING_BOUNDS.retentionDays.min).max(POLLING_SETTING_BOUNDS.retentionDays.max)
}).strict().superRefine((settings, context) => {
  if (settings.jitterMs >= settings.intervalMs) {
    context.addIssue({ code: "custom", message: "Jitter must be shorter than the polling interval.", path: ["jitterMs"] });
  }
});

export type PollingSettings = z.infer<typeof pollingSettingsSchema>;

/**
 * Values written by migration 017 and restored if the singleton row is missing or
 * unreadable. They are a starting point an administrator edits in Hub Settings,
 * not an environment-overridable default (DEC-044).
 */
export const POLLING_SETTING_DEFAULTS: PollingSettings = {
  intervalMs: 60_000,
  concurrency: 2,
  jitterMs: 15_000,
  retentionDays: 30
};

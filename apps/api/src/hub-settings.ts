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
  if (enabled && method !== "local" && (!addressType || !address)) {
    invalid("An address is required for the active Tailscale or Custom method.");
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

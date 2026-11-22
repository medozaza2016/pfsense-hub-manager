import { z } from "zod";

const hostnameSchema = z.string().min(1).max(253).regex(
  /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/
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
  if (addressType !== null && !address) invalid("An address is required when an address type is selected.");

  if (method === "local" && addressType !== null && !["hostname", "ip"].includes(addressType)) {
    invalid("Local access accepts a hostname or IP address.");
  }
  if (method === "tailscale" && addressType !== null && !["magic_dns", "tailscale_ip"].includes(addressType)) {
    invalid("Tailscale accepts a MagicDNS hostname or Tailscale IPv4 address.");
  }
  if (method === "hostname" && addressType !== null && !["hostname", "ip"].includes(addressType)) {
    invalid("Hostname/IP access accepts a hostname or IP address.");
  }
  if (enabled && method !== "local" && (!addressType || !address)) {
    invalid("An address is required for an enabled Tailscale or Hostname/IP endpoint.");
  }
  if (address && ["ip", "tailscale_ip"].includes(addressType ?? "")) {
    const valid = addressType === "tailscale_ip"
      ? z.ipv4().safeParse(address).success
      : z.union([z.ipv4(), z.ipv6()]).safeParse(address).success;
    if (!valid) invalid("Enter a valid IP address.");
  }
  if (address && ["hostname", "magic_dns"].includes(addressType ?? "") && !hostnameSchema.safeParse(address).success) {
    invalid("Enter a valid fully qualified hostname.");
  }
});

export const hubAccessEndpointsSchema = z.object({
  endpoints: z.array(hubAccessEndpointSchema).min(1).max(3)
}).strict().superRefine(({ endpoints }, context) => {
  const methods = endpoints.map(endpoint => endpoint.method);
  if (new Set(methods).size !== methods.length) {
    context.addIssue({ code: "custom", message: "Each access method can appear only once.", path: ["endpoints"] });
  }
});

export type HubAccessEndpoint = z.infer<typeof hubAccessEndpointSchema>;

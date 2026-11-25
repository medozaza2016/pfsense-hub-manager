import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { DeviceRepository } from "../devices/device-repository.js";
import {
  pfSenseConfigurationRoute,
  pfSenseReadPrivilege,
  pfSenseStatusDetailRoute,
  type PfSenseClient,
  type PfSenseConfigurationOperation,
  type PfSenseStatusDetailOperation
} from "./client.js";
import {
  parseAliases,
  parseCertificateAuthorities,
  parseCertificates,
  parseDhcpAddressPools,
  parseDhcpServers,
  parseDhcpStaticMappings,
  parseDnsDomainOverrides,
  parseDnsHostOverrides,
  parseDnsSettings,
  parseInterfaceConfig,
  parseNatOneToOne,
  parseNatOutbound,
  parseNatPortForwards,
  parseRules,
  parseStaticRoutes
} from "./configuration.js";
import type { DevicePfSenseClientFactory } from "./device-client-factory.js";
import { classifyError, type ErrorClass } from "./errors.js";
import { ObservationCache, type CacheLookup } from "./observation-cache.js";
import { PageReadShapeError, type ParsedRead } from "./page-read.js";
import { parseRestApiVersion } from "./system-info.js";
import {
  parseIpsecSas,
  parseOpenVpnClients,
  parseOpenVpnServers,
  parseWireGuardPeers,
  parseWireGuardTunnels
} from "./vpn-status.js";

/**
 * Read-only, page-scoped routes (DEC-047, DEC-048).
 *
 * There is no caller-supplied URL, path, method, or body: the device comes from
 * the manager database, the route is registered here, and the upstream path comes
 * from one of the client's fixed allowlists. Unknown areas have no route at all,
 * so they 404 through the manager handler instead of being proxied anywhere.
 *
 * Two namespaces are registered:
 *
 * - `configuration/*` — administrator-only (enforced by the server hook), because
 *   it reveals how the firewall is configured.
 * - `telemetry/*` — any authenticated caller, matching the rest of the read-only
 *   telemetry surface; it reports VPN state only.
 *
 * These reads are outside the health poll: they do not write `poll_runs` and
 * therefore cannot change device-derived capability evidence.
 */

export type PageReadNamespace = "configuration" | "telemetry";

export interface PageReadCollection {
  deviceId: string;
  area: string;
  collectedAt: string;
  count: number;
  truncated: boolean;
  items: unknown[];
}

export type PageReadResult =
  | { outcome: "success"; collection: PageReadCollection }
  | { outcome: "failure"; errorClass: ErrorClass };

export type PageReadCacheKey = `${PageReadNamespace}:${string}`;

export interface PageReadRouteDependencies {
  factory: DevicePfSenseClientFactory;
  devices: DeviceRepository;
  /** One short-lived cache per namespace and area; never shared with the poll. */
  cache: (key: PageReadCacheKey) => ObservationCache<PageReadResult>;
}

/** One area's fixed upstream facts. No value here is caller-controllable. */
export interface PageReadArea {
  operation: PfSenseConfigurationOperation | PfSenseStatusDetailOperation;
  route: string;
  privilege: string;
  /** Operator-facing name used in manager error messages. */
  label: string;
  parse: (data: unknown) => ParsedRead<unknown>;
}

function configurationArea(
  operation: PfSenseConfigurationOperation,
  label: string,
  parse: (data: unknown) => ParsedRead<unknown>
): PageReadArea {
  const route = pfSenseConfigurationRoute(operation);
  return { operation, route, privilege: pfSenseReadPrivilege(route), label, parse };
}

function statusArea(
  operation: PfSenseStatusDetailOperation,
  label: string,
  parse: (data: unknown) => ParsedRead<unknown>
): PageReadArea {
  const route = pfSenseStatusDetailRoute(operation);
  return { operation, route, privilege: pfSenseReadPrivilege(route), label, parse };
}

const deviceIdSchema = z.string().uuid();

class DeviceUnavailableError extends Error {}

/** The page address, the fixed operation, and the sanitizer for every config area. */
export const CONFIGURATION_AREAS = {
  aliases: configurationArea("aliases", "firewall aliases", parseAliases),
  interfaces: configurationArea("interfaces", "interface configuration", parseInterfaceConfig),
  rules: configurationArea("rules", "firewall rules", parseRules),
  "nat-port-forwards": configurationArea("natPortForwards", "port forward configuration", parseNatPortForwards),
  "nat-outbound": configurationArea("natOutbound", "outbound NAT configuration", parseNatOutbound),
  "nat-one-to-one": configurationArea("natOneToOne", "1:1 NAT configuration", parseNatOneToOne),
  "static-routes": configurationArea("staticRoutes", "static route configuration", parseStaticRoutes),
  "dhcp-servers": configurationArea("dhcpServers", "DHCP server configuration", parseDhcpServers),
  "dhcp-address-pools": configurationArea("dhcpAddressPools", "DHCP address pool configuration", parseDhcpAddressPools),
  "dhcp-static-mappings": configurationArea("dhcpStaticMappings", "DHCP static mapping configuration", parseDhcpStaticMappings),
  "dns-settings": configurationArea("dnsSettings", "DNS resolver settings", parseDnsSettings),
  "dns-host-overrides": configurationArea("dnsHostOverrides", "DNS host override configuration", parseDnsHostOverrides),
  "dns-domain-overrides": configurationArea("dnsDomainOverrides", "DNS domain override configuration", parseDnsDomainOverrides),
  certificates: configurationArea("certificates", "certificate inventory", parseCertificates),
  "certificate-authorities": configurationArea("certificateAuthorities", "certificate authority inventory", parseCertificateAuthorities)
} as const satisfies Record<string, PageReadArea>;

/** The status areas shown by the VPN and Compatibility pages. Status, not configuration. */
export const TELEMETRY_AREAS = {
  "ipsec-sas": statusArea("ipsecSas", "IPsec security association status", parseIpsecSas),
  "openvpn-servers": statusArea("openvpnServers", "OpenVPN server status", parseOpenVpnServers),
  "openvpn-clients": statusArea("openvpnClients", "OpenVPN client status", parseOpenVpnClients),
  "wireguard-tunnels": statusArea("wireguardTunnels", "WireGuard tunnel status", parseWireGuardTunnels),
  "wireguard-peers": statusArea("wireguardPeers", "WireGuard peer status", parseWireGuardPeers),
  "restapi-version": statusArea("restapiVersion", "REST API package version", parseRestApiVersion)
} as const satisfies Record<string, PageReadArea>;

function invalidDeviceId(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: "INVALID_DEVICE_ID", message: "Invalid device identifier." } });
}

function deviceNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
}

function deviceDisabled(reply: FastifyReply, namespace: PageReadNamespace) {
  return reply.code(409).send({
    error: {
      code: "DEVICE_DISABLED",
      message: namespace === "configuration"
        ? "Enable this firewall before reading its configuration."
        : "Enable this firewall before reading its status detail."
    }
  });
}

function deviceUnavailable(reply: FastifyReply, namespace: PageReadNamespace) {
  return reply.code(409).send({
    error: {
      code: "DEVICE_UNAVAILABLE",
      message: namespace === "configuration"
        ? "The firewall is no longer available for configuration reads."
        : "The firewall is no longer available for status detail reads."
    }
  });
}

/**
 * Maps an upstream error class to a manager-owned status and code. The messages
 * are written for an operator: they name the privilege or route to check and
 * never include firewall payloads, credentials, or response bodies.
 */
function failureReply(
  reply: FastifyReply,
  errorClass: ErrorClass,
  area: PageReadArea,
  meta: { cacheHit: boolean; durationMs: number }
) {
  const shared = { data: null, meta };
  if (errorClass === "authorization") {
    return reply.code(502).send({
      ...shared,
      error: {
        code: "FIREWALL_PERMISSION_DENIED",
        message: `The firewall denied the ${area.label} read. Grant the least-privilege ${area.privilege} privilege to the manager's firewall account.`
      }
    });
  }
  if (errorClass === "unsupported") {
    return reply.code(502).send({
      ...shared,
      error: {
        code: "FIREWALL_ENDPOINT_UNSUPPORTED",
        message: `This firewall or its REST API package does not expose ${area.route}. The ${area.label} view remains unverified for this device.`
      }
    });
  }
  if (errorClass === "timeout") {
    return reply.code(504).send({
      ...shared,
      error: { code: "FIREWALL_TIMEOUT", message: `The firewall did not answer the ${area.label} read in time.` }
    });
  }
  if (errorClass === "invalid_response") {
    return reply.code(502).send({
      ...shared,
      error: {
        code: "FIREWALL_INVALID_RESPONSE",
        message: `The firewall answered the ${area.label} read with a data shape the manager does not accept, so nothing was displayed.`
      }
    });
  }
  const detail = errorClass === "authentication" ? "Firewall authentication failed."
    : errorClass === "tls" ? "Firewall TLS verification failed."
      : errorClass === "rate_limit" ? "The firewall API rate limit was reached."
        : "The firewall could not be read.";
  return reply.code(502).send({
    ...shared,
    error: { code: "FIREWALL_UNAVAILABLE", message: `${detail} No ${area.label} data was displayed.` }
  });
}

async function readArea(
  dependencies: PageReadRouteDependencies,
  namespace: PageReadNamespace,
  areaName: string,
  area: PageReadArea,
  deviceId: string
): Promise<PageReadResult> {
  const client: PfSenseClient | null = await dependencies.factory.create(deviceId);
  if (!client) throw new DeviceUnavailableError();
  try {
    const envelope = namespace === "configuration"
      ? await client.getConfiguration(area.operation as PfSenseConfigurationOperation)
      : await client.getStatusDetail(area.operation as PfSenseStatusDetailOperation);
    const parsed = area.parse(envelope.data);
    return {
      outcome: "success",
      collection: {
        deviceId,
        area: areaName,
        collectedAt: new Date().toISOString(),
        count: parsed.items.length,
        truncated: parsed.truncated,
        items: parsed.items
      }
    };
  } catch (error) {
    // A malformed body is a response problem, not an outage: it is cached with
    // the failure TTL so one bad response cannot be retried on every render.
    const errorClass = error instanceof PageReadShapeError ? "invalid_response" : classifyError(error);
    return { outcome: "failure", errorClass };
  } finally {
    await client.close().catch(() => undefined);
  }
}

function registerArea(
  app: FastifyInstance,
  dependencies: PageReadRouteDependencies,
  namespace: PageReadNamespace,
  areaName: string,
  area: PageReadArea
): void {
  const cache = dependencies.cache(`${namespace}:${areaName}`);
  app.get(`/api/v1/devices/:deviceId/${namespace}/${areaName}`, async (request, reply) => {
    const parsedId = deviceIdSchema.safeParse((request.params as { deviceId?: string }).deviceId);
    if (!parsedId.success) return invalidDeviceId(reply);
    const deviceId = parsedId.data;

    const profile = await dependencies.devices.getProfile(deviceId);
    if (!profile || profile.isDemo) return deviceNotFound(reply);
    if (!profile.enabled) return deviceDisabled(reply, namespace);

    const startedAt = Date.now();
    let lookup: CacheLookup<PageReadResult>;
    try {
      lookup = await cache.get(
        deviceId,
        () => readArea(dependencies, namespace, areaName, area, deviceId),
        value => value.outcome === "failure"
      );
    } catch (error) {
      if (error instanceof DeviceUnavailableError) return deviceUnavailable(reply, namespace);
      throw error;
    }

    const meta = { cacheHit: lookup.cacheHit, durationMs: Date.now() - startedAt };
    if (lookup.value.outcome === "failure") return failureReply(reply, lookup.value.errorClass, area, meta);
    return reply.code(200).send({ data: lookup.value.collection, meta });
  });
}

export async function registerPageReadRoutes(
  app: FastifyInstance,
  dependencies: PageReadRouteDependencies
): Promise<void> {
  for (const [areaName, area] of Object.entries(CONFIGURATION_AREAS)) {
    registerArea(app, dependencies, "configuration", areaName, area);
  }
  for (const [areaName, area] of Object.entries(TELEMETRY_AREAS)) {
    registerArea(app, dependencies, "telemetry", areaName, area);
  }
}



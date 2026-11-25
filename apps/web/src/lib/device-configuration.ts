import { useCallback, useEffect, useState } from "react";
import { ApiRequestError, apiRequest } from "./api";

/**
 * Browser-side client for the page-scoped read contract (DEC-047, DEC-048).
 *
 * Two fixed manager namespaces are used:
 *
 * - `configuration/*` — administrator-only firewall configuration views.
 * - `telemetry/*` — VPN status detail, available to any signed-in operator.
 *
 * The browser never supplies a firewall path, and the manager never forwards a
 * caller-supplied URL. Every area below is one fixed manager route.
 */

export type AliasType = "host" | "network" | "port";

export interface AliasView {
  name: string | null;
  type: AliasType | null;
  description: string | null;
  entries: string[];
  entryCount: number;
  entriesTruncated: boolean;
}

export interface InterfaceConfigView {
  name: string | null;
  description: string | null;
  enabled: boolean | null;
  ipv4Type: "static" | "dhcp" | "none" | null;
  ipv4Address: string | null;
  ipv4Subnet: number | null;
  ipv6Type: "staticv6" | "dhcp6" | "slaac" | "6rd" | "track6" | "6to4" | "none" | null;
  ipv6Address: string | null;
  mtu: number | null;
  media: string | null;
}

export interface RuleView {
  action: "pass" | "block" | "reject" | null;
  interfaces: string[];
  ipProtocol: string | null;
  protocol: string | null;
  source: string | null;
  sourcePort: string | null;
  destination: string | null;
  destinationPort: string | null;
  description: string | null;
  disabled: boolean | null;
  log: boolean | null;
  floating: boolean | null;
  direction: string | null;
  gateway: string | null;
}

export interface NatPortForwardView {
  interface: string | null;
  ipProtocol: string | null;
  protocol: string | null;
  source: string | null;
  sourcePort: string | null;
  destination: string | null;
  destinationPort: string | null;
  target: string | null;
  localPort: string | null;
  description: string | null;
  disabled: boolean | null;
  natReflection: string | null;
}

export interface NatOutboundView {
  interface: string | null;
  protocol: string | null;
  disabled: boolean | null;
  noNat: boolean | null;
  source: string | null;
  sourcePort: string | null;
  destination: string | null;
  destinationPort: string | null;
  target: string | null;
  targetSubnet: number | null;
  natPort: string | null;
  poolOptions: string | null;
  description: string | null;
}

export interface NatOneToOneView {
  interface: string | null;
  disabled: boolean | null;
  ipProtocol: string | null;
  natReflection: string | null;
  external: string | null;
  source: string | null;
  destination: string | null;
  description: string | null;
}

export interface StaticRouteView {
  network: string | null;
  gateway: string | null;
  description: string | null;
  disabled: boolean | null;
}

export interface DhcpServerView {
  interface: string | null;
  enabled: boolean | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  domain: string | null;
  gateway: string | null;
  dnsServers: string[];
  defaultLeaseTime: number | null;
  maxLeaseTime: number | null;
  denyUnknown: string | null;
  staticArp: boolean | null;
}

export interface DhcpAddressPoolView {
  parentId: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  gateway: string | null;
  domain: string | null;
}

export interface DhcpStaticMappingView {
  parentId: string | null;
  mac: string | null;
  ipAddress: string | null;
  hostname: string | null;
  description: string | null;
  staticArp: boolean | null;
}

export interface DnsSettingsView {
  enabled: boolean | null;
  port: string | null;
  enableSsl: boolean | null;
  tlsPort: string | null;
  activeInterfaces: string[];
  outgoingInterfaces: string[];
  dnssec: boolean | null;
  forwarding: boolean | null;
  regDhcp: boolean | null;
  regDhcpStatic: boolean | null;
  regOpenVpnClients: boolean | null;
  strictOut: boolean | null;
}

export interface DnsHostOverrideView {
  host: string | null;
  domain: string | null;
  addresses: string[];
  description: string | null;
  aliasCount: number;
}

export interface DnsDomainOverrideView {
  domain: string | null;
  address: string | null;
  description: string | null;
  forwardTlsUpstream: boolean | null;
  tlsHostname: string | null;
}

export interface CertificateView {
  description: string | null;
  type: "server" | "user" | null;
  validFrom: string | null;
  validUntil: string | null;
  validDaysLeft: number | null;
}

export interface CertificateAuthorityView {
  description: string | null;
  trust: boolean | null;
}

export interface IpsecSaView {
  state: string | null;
  version: number | null;
  localHost: string | null;
  localId: string | null;
  remoteHost: string | null;
  remoteId: string | null;
  encryption: string | null;
  integrity: string | null;
  dhGroup: string | null;
  natRemote: boolean | null;
  establishedAt: string | null;
}

export interface OpenVpnServerView {
  name: string | null;
  mode: string | null;
  port: string | null;
  vpnId: number | null;
  connectionCount: number;
}

export interface OpenVpnClientView {
  name: string | null;
  status: string | null;
  state: string | null;
  stateDetail: string | null;
  connectTime: string | null;
  virtualAddress: string | null;
  virtualAddress6: string | null;
  remoteHost: string | null;
  remotePort: string | null;
}

export interface WireGuardTunnelView {
  name: string | null;
  status: "up" | "down" | null;
  listenPort: string | null;
  mtu: number | null;
  transferRx: number | null;
  transferTx: number | null;
  inPackets: number | null;
  outPackets: number | null;
  description: string | null;
  peerCount: number | null;
}

export interface WireGuardPeerView {
  tunnel: string | null;
  endpoint: string | null;
  allowedIps: string[];
  latestHandshakeAt: string | null;
  transferRx: number | null;
  transferTx: number | null;
  persistentKeepalive: string | null;
  description: string | null;
}

export interface RestApiVersionView {
  currentVersion: string | null;
  latestVersion: string | null;
  latestReleaseDate: string | null;
  updateAvailable: boolean | null;
}

/** One page read, as the manager returns it after sanitization. */
export interface PageReadCollection<T> {
  deviceId: string;
  area: string;
  collectedAt: string;
  count: number;
  truncated: boolean;
  items: T[];
}

export type ConfigurationArea =
  | "aliases" | "interfaces" | "rules"
  | "nat-port-forwards" | "nat-outbound" | "nat-one-to-one"
  | "static-routes"
  | "dhcp-servers" | "dhcp-address-pools" | "dhcp-static-mappings"
  | "dns-settings" | "dns-host-overrides" | "dns-domain-overrides"
  | "certificates" | "certificate-authorities";

export type TelemetryArea =
  | "ipsec-sas" | "openvpn-servers" | "openvpn-clients"
  | "wireguard-tunnels" | "wireguard-peers"
  | "restapi-version";

export interface AreaTypeMap {
  aliases: AliasView;
  interfaces: InterfaceConfigView;
  rules: RuleView;
  "nat-port-forwards": NatPortForwardView;
  "nat-outbound": NatOutboundView;
  "nat-one-to-one": NatOneToOneView;
  "static-routes": StaticRouteView;
  "dhcp-servers": DhcpServerView;
  "dhcp-address-pools": DhcpAddressPoolView;
  "dhcp-static-mappings": DhcpStaticMappingView;
  "dns-settings": DnsSettingsView;
  "dns-host-overrides": DnsHostOverrideView;
  "dns-domain-overrides": DnsDomainOverrideView;
  certificates: CertificateView;
  "certificate-authorities": CertificateAuthorityView;
  "ipsec-sas": IpsecSaView;
  "openvpn-servers": OpenVpnServerView;
  "openvpn-clients": OpenVpnClientView;
  "wireguard-tunnels": WireGuardTunnelView;
  "wireguard-peers": WireGuardPeerView;
  "restapi-version": RestApiVersionView;
}

export type PageReadArea = ConfigurationArea | TelemetryArea;

/** Server-side cache is 60s; this only prevents duplicate mounts within a view. */
export const PAGE_READ_TTL_MS = 30_000;

type PageReadNamespace = "configuration" | "telemetry";

interface CacheEntry {
  fetchedAt: number;
  promise: Promise<PageReadCollection<unknown>>;
}

const readCache = new Map<string, CacheEntry>();

function cacheKey(namespace: PageReadNamespace, area: string, deviceId: string): string {
  return `${namespace}:${area}:${deviceId}`;
}

/** Drops every cached area for one device, for example after its profile changes. */
export function invalidateDevicePageReads(deviceId: string): void {
  const suffix = `:${deviceId}`;
  for (const key of Array.from(readCache.keys())) {
    if (key.endsWith(suffix)) readCache.delete(key);
  }
}

export function clearPageReadCache(): void {
  readCache.clear();
}

function loadRead<T>(
  namespace: PageReadNamespace,
  area: string,
  deviceId: string,
  force: boolean
): Promise<PageReadCollection<T>> {
  const key = cacheKey(namespace, area, deviceId);
  const now = Date.now();
  const existing = readCache.get(key);
  if (existing && !force && now - existing.fetchedAt < PAGE_READ_TTL_MS) {
    return existing.promise as Promise<PageReadCollection<T>>;
  }

  const promise = apiRequest<PageReadCollection<T>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/${namespace}/${encodeURIComponent(area)}`
  );
  readCache.set(key, { fetchedAt: now, promise: promise as Promise<PageReadCollection<unknown>> });
  promise.catch(() => {
    if (readCache.get(key)?.promise === promise as unknown as Promise<PageReadCollection<unknown>>) readCache.delete(key);
  });
  return promise;
}

export interface PageReadState<T> {
  data: PageReadCollection<T> | null;
  loading: boolean;
  error: string;
  /** Stable server error code, so a page can explain which check failed. */
  errorCode: string | null;
  refresh: () => void;
}

function usePageRead<T>(
  namespace: PageReadNamespace,
  area: string,
  deviceId: string | null,
  enabled: boolean
): PageReadState<T> {
  const [data, setData] = useState<PageReadCollection<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!deviceId || !enabled) {
      setData(null);
      setLoading(false);
      setError("");
      setErrorCode(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    setErrorCode(null);
    loadRead<T>(namespace, area, deviceId, nonce > 0)
      .then(value => { if (active) { setData(value); setLoading(false); } })
      .catch((cause: unknown) => {
        if (!active) return;
        setData(null);
        setLoading(false);
        setError(cause instanceof Error ? cause.message : `Unable to read firewall ${area}.`);
        setErrorCode(cause instanceof ApiRequestError ? cause.code : null);
      });
    return () => { active = false; };
  }, [namespace, area, deviceId, enabled, nonce]);

  const refresh = useCallback(() => {
    if (deviceId) invalidateDevicePageReads(deviceId);
    setNonce(value => value + 1);
  }, [deviceId]);

  return { data, loading, error, errorCode, refresh };
}

/** Set `enabled` to false for demo records and when no site is selected. */
export function useConfigurationRead<K extends ConfigurationArea>(
  area: K,
  deviceId: string | null,
  enabled = true
): PageReadState<AreaTypeMap[K]> {
  return usePageRead<AreaTypeMap[K]>("configuration", area, deviceId, enabled);
}

/** VPN status detail. Available to any signed-in operator, unlike configuration. */
export function useTelemetryRead<K extends TelemetryArea>(
  area: K,
  deviceId: string | null,
  enabled = true
): PageReadState<AreaTypeMap[K]> {
  return usePageRead<AreaTypeMap[K]>("telemetry", area, deviceId, enabled);
}



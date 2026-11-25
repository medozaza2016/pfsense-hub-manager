import {
  capList,
  booleanValue,
  enumValue,
  identifier,
  integer,
  objectShape,
  recordList,
  stringList,
  text,
  type ParsedRead
} from "./page-read.js";

/**
 * Sanitized read models for the page-scoped configuration areas (DEC-047, DEC-048).
 *
 * Each parser rebuilds the record field by field from the fields the matching
 * manager page needs. Fields that identify the record internally (`id`, `tracker`,
 * `associated_rule_id`, `refid`), certificate private material, and free-form
 * configuration text are deliberately not modeled.
 */

/** Alias `type` in the upstream schema. An unknown value stays null, not guessed. */
export type AliasType = "host" | "network" | "port";

export interface AliasObservation {
  name: string | null;
  type: AliasType | null;
  description: string | null;
  /** At most `PAGE_READ_LIMITS.maxNestedEntries` entries, in firewall order. */
  entries: string[];
  /** How many entries the firewall actually reported, before any cap. */
  entryCount: number;
  /** True when entries were withheld from `entries` because of the cap. */
  entriesTruncated: boolean;
}

export interface InterfaceConfigObservation {
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

export type RuleAction = "pass" | "block" | "reject";
export type InternetProtocol = "inet" | "inet6" | "inet46";

export interface RuleObservation {
  action: RuleAction | null;
  interfaces: string[];
  ipProtocol: InternetProtocol | null;
  protocol: string | null;
  source: string | null;
  sourcePort: string | null;
  destination: string | null;
  destinationPort: string | null;
  description: string | null;
  disabled: boolean | null;
  log: boolean | null;
  floating: boolean | null;
  direction: "any" | "in" | "out" | null;
  gateway: string | null;
}

export type NatReflection = "enable" | "disable" | "purenat";

export interface NatPortForwardObservation {
  interface: string | null;
  ipProtocol: InternetProtocol | null;
  protocol: string | null;
  source: string | null;
  sourcePort: string | null;
  destination: string | null;
  destinationPort: string | null;
  target: string | null;
  localPort: string | null;
  description: string | null;
  disabled: boolean | null;
  natReflection: NatReflection | null;
}

export interface NatOutboundObservation {
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

export interface NatOneToOneObservation {
  interface: string | null;
  disabled: boolean | null;
  ipProtocol: "inet" | "inet6" | null;
  natReflection: "enable" | "disable" | null;
  external: string | null;
  source: string | null;
  destination: string | null;
  description: string | null;
}

export interface StaticRouteObservation {
  network: string | null;
  gateway: string | null;
  description: string | null;
  disabled: boolean | null;
}

export interface DhcpServerObservation {
  interface: string | null;
  enabled: boolean | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  domain: string | null;
  gateway: string | null;
  dnsServers: string[];
  defaultLeaseTime: number | null;
  maxLeaseTime: number | null;
  denyUnknown: "enabled" | "class" | null;
  staticArp: boolean | null;
}

export interface DhcpAddressPoolObservation {
  parentId: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  gateway: string | null;
  domain: string | null;
}

export interface DhcpStaticMappingObservation {
  parentId: string | null;
  mac: string | null;
  ipAddress: string | null;
  hostname: string | null;
  description: string | null;
  staticArp: boolean | null;
}

export interface DnsSettingsObservation {
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

export interface DnsHostOverrideObservation {
  host: string | null;
  domain: string | null;
  addresses: string[];
  description: string | null;
  /** How many additional alias hostnames the override declares. */
  aliasCount: number;
}

export interface DnsDomainOverrideObservation {
  domain: string | null;
  address: string | null;
  description: string | null;
  forwardTlsUpstream: boolean | null;
  tlsHostname: string | null;
}

export interface CertificateObservation {
  description: string | null;
  type: "server" | "user" | null;
  validFrom: string | null;
  validUntil: string | null;
  validDaysLeft: number | null;
}

export interface CertificateAuthorityObservation {
  description: string | null;
  trust: boolean | null;
}

const ALIAS_TYPES = ["host", "network", "port"] as const;
const IPV4_TYPES = ["static", "dhcp", "none"] as const;
const IPV6_TYPES = ["staticv6", "dhcp6", "slaac", "6rd", "track6", "6to4", "none"] as const;
const RULE_ACTIONS = ["pass", "block", "reject"] as const;
const IP_PROTOCOLS = ["inet", "inet6", "inet46"] as const;
const RULE_PROTOCOLS = ["tcp", "udp", "tcp/udp", "icmp", "esp", "ah", "gre", "ipv6", "igmp", "pim", "ospf", "carp", "pfsync"] as const;
const DIRECTIONS = ["any", "in", "out"] as const;
const NAT_PROTOCOLS = ["any", "tcp", "udp", "tcp/udp", "icmp", "esp", "ah", "gre", "ipv6", "igmp", "pim", "ospf"] as const;
const NAT_REFLECTIONS = ["enable", "disable", "purenat"] as const;
const ONE_TO_ONE_IP_PROTOCOLS = ["inet", "inet6"] as const;
const ONE_TO_ONE_REFLECTIONS = ["enable", "disable"] as const;
const POOL_OPTIONS = ["round-robin", "round-robin sticky-address", "random", "random sticky-address", "source-hash", "bitmask"] as const;
const DENY_UNKNOWN = ["enabled", "class"] as const;
const CERTIFICATE_TYPES = ["server", "user"] as const;

const MAX_ALIAS_ENTRIES = 200;
const MAX_ALIAS_NAME = 31;
const MAX_DHCP_LEASE_SECONDS = 2_147_483_647;

/**
 * Validates the alias list envelope and returns only the fields the Aliases page
 * displays. `detail` (per-entry descriptions) and internal `id` are not modeled.
 */
export function parseAliases(data: unknown): ParsedRead<AliasObservation> {
  const records = recordList(data, "the firewall aliases");
  const aliases = records.map(entry => {
    // Count the entries the firewall actually reported before applying the
    // display cap, so the page can say how many were withheld.
    const reported = Array.isArray(entry.address) ? entry.address.length : typeof entry.address === "string" ? 1 : 0;
    const entries = stringList(entry.address, reported);
    return {
      name: text(entry.name, MAX_ALIAS_NAME),
      type: enumValue(entry.type, ALIAS_TYPES),
      description: text(entry.descr),
      entries: entries.slice(0, MAX_ALIAS_ENTRIES),
      entryCount: entries.length,
      entriesTruncated: entries.length > MAX_ALIAS_ENTRIES
    };
  });
  return capList(aliases);
}

export function parseInterfaceConfig(data: unknown): ParsedRead<InterfaceConfigObservation> {
  const records = recordList(data, "the interface configuration");
  return capList(records.map(entry => ({
    name: identifier(entry.if),
    description: text(entry.descr),
    enabled: booleanValue(entry.enable),
    ipv4Type: enumValue(entry.typev4, IPV4_TYPES),
    ipv4Address: identifier(entry.ipaddr),
    ipv4Subnet: integer(entry.subnet, 0, 32),
    ipv6Type: enumValue(entry.typev6, IPV6_TYPES),
    ipv6Address: identifier(entry.ipaddrv6),
    mtu: integer(entry.mtu, 576, 65_535),
    media: identifier(entry.media)
  })));
}

export function parseRules(data: unknown): ParsedRead<RuleObservation> {
  const records = recordList(data, "the firewall rules");
  return capList(records.map(entry => ({
    action: enumValue(entry.type, RULE_ACTIONS),
    interfaces: stringList(entry.interface, 32, 32),
    ipProtocol: enumValue(entry.ipprotocol, IP_PROTOCOLS),
    protocol: enumValue(entry.protocol, RULE_PROTOCOLS),
    source: identifier(entry.source),
    sourcePort: identifier(entry.source_port),
    destination: identifier(entry.destination),
    destinationPort: identifier(entry.destination_port),
    description: text(entry.descr),
    disabled: booleanValue(entry.disabled),
    log: booleanValue(entry.log),
    floating: booleanValue(entry.floating),
    direction: enumValue(entry.direction, DIRECTIONS),
    gateway: identifier(entry.gateway)
  })));
}

export function parseNatPortForwards(data: unknown): ParsedRead<NatPortForwardObservation> {
  const records = recordList(data, "the port forward configuration");
  return capList(records.map(entry => ({
    interface: identifier(entry.interface),
    ipProtocol: enumValue(entry.ipprotocol, IP_PROTOCOLS),
    protocol: enumValue(entry.protocol, NAT_PROTOCOLS),
    source: identifier(entry.source),
    sourcePort: identifier(entry.source_port),
    destination: identifier(entry.destination),
    destinationPort: identifier(entry.destination_port),
    target: identifier(entry.target),
    localPort: identifier(entry.local_port),
    description: text(entry.descr),
    disabled: booleanValue(entry.disabled),
    natReflection: enumValue(entry.natreflection, NAT_REFLECTIONS)
  })));
}

export function parseNatOutbound(data: unknown): ParsedRead<NatOutboundObservation> {
  const records = recordList(data, "the outbound NAT configuration");
  return capList(records.map(entry => ({
    interface: identifier(entry.interface),
    protocol: enumValue(entry.protocol, NAT_PROTOCOLS),
    disabled: booleanValue(entry.disabled),
    noNat: booleanValue(entry.nonat),
    source: identifier(entry.source),
    sourcePort: identifier(entry.source_port),
    destination: identifier(entry.destination),
    destinationPort: identifier(entry.destination_port),
    target: identifier(entry.target),
    targetSubnet: integer(entry.target_subnet, 0, 32),
    natPort: identifier(entry.nat_port),
    poolOptions: enumValue(entry.poolopts, POOL_OPTIONS),
    description: text(entry.descr)
  })));
}

export function parseNatOneToOne(data: unknown): ParsedRead<NatOneToOneObservation> {
  const records = recordList(data, "the 1:1 NAT configuration");
  return capList(records.map(entry => ({
    interface: identifier(entry.interface),
    disabled: booleanValue(entry.disabled),
    ipProtocol: enumValue(entry.ipprotocol, ONE_TO_ONE_IP_PROTOCOLS),
    natReflection: enumValue(entry.natreflection, ONE_TO_ONE_REFLECTIONS),
    external: identifier(entry.external),
    source: identifier(entry.source),
    destination: identifier(entry.destination),
    description: text(entry.descr)
  })));
}

export function parseStaticRoutes(data: unknown): ParsedRead<StaticRouteObservation> {
  const records = recordList(data, "the static route configuration");
  return capList(records.map(entry => ({
    network: identifier(entry.network),
    gateway: identifier(entry.gateway),
    description: text(entry.descr),
    disabled: booleanValue(entry.disabled)
  })));
}

export function parseDhcpServers(data: unknown): ParsedRead<DhcpServerObservation> {
  const records = recordList(data, "the DHCP server configuration");
  return capList(records.map(entry => ({
    interface: identifier(entry.interface),
    enabled: booleanValue(entry.enable),
    rangeFrom: identifier(entry.range_from),
    rangeTo: identifier(entry.range_to),
    domain: identifier(entry.domain),
    gateway: identifier(entry.gateway),
    dnsServers: stringList(entry.dnsserver, 16, 46),
    defaultLeaseTime: integer(entry.defaultleasetime, 0, MAX_DHCP_LEASE_SECONDS),
    maxLeaseTime: integer(entry.maxleasetime, 0, MAX_DHCP_LEASE_SECONDS),
    denyUnknown: enumValue(entry.denyunknown, DENY_UNKNOWN),
    staticArp: booleanValue(entry.staticarp)
  })));
}

export function parseDhcpAddressPools(data: unknown): ParsedRead<DhcpAddressPoolObservation> {
  const records = recordList(data, "the DHCP address pool configuration");
  return capList(records.map(entry => ({
    parentId: identifier(entry.parent_id),
    rangeFrom: identifier(entry.range_from),
    rangeTo: identifier(entry.range_to),
    gateway: identifier(entry.gateway),
    domain: identifier(entry.domain)
  })));
}

export function parseDhcpStaticMappings(data: unknown): ParsedRead<DhcpStaticMappingObservation> {
  const records = recordList(data, "the DHCP static mapping configuration");
  return capList(records.map(entry => ({
    parentId: identifier(entry.parent_id),
    mac: identifier(entry.mac),
    ipAddress: identifier(entry.ipaddr),
    hostname: identifier(entry.hostname),
    description: text(entry.descr),
    staticArp: booleanValue(entry.arp_table_static_entry)
  })));
}

export function parseDnsSettings(data: unknown): ParsedRead<DnsSettingsObservation> {
  const entry = objectShape(data, "the DNS resolver settings");
  return capList([{
    enabled: booleanValue(entry.enable),
    port: identifier(entry.port),
    enableSsl: booleanValue(entry.enablessl),
    tlsPort: identifier(entry.tlsport),
    activeInterfaces: stringList(entry.active_interface, 32, 32),
    outgoingInterfaces: stringList(entry.outgoing_interface, 32, 32),
    dnssec: booleanValue(entry.dnssec),
    forwarding: booleanValue(entry.forwarding),
    regDhcp: booleanValue(entry.regdhcp),
    regDhcpStatic: booleanValue(entry.regdhcpstatic),
    regOpenVpnClients: booleanValue(entry.regovpnclients),
    strictOut: booleanValue(entry.strictout)
  }]);
}

export function parseDnsHostOverrides(data: unknown): ParsedRead<DnsHostOverrideObservation> {
  const records = recordList(data, "the DNS host override configuration");
  return capList(records.map(entry => ({
    host: identifier(entry.host),
    domain: identifier(entry.domain),
    addresses: stringList(entry.ip, 32, 46),
    description: text(entry.descr),
    aliasCount: Array.isArray(entry.aliases) ? entry.aliases.length : 0
  })));
}

export function parseDnsDomainOverrides(data: unknown): ParsedRead<DnsDomainOverrideObservation> {
  const records = recordList(data, "the DNS domain override configuration");
  return capList(records.map(entry => ({
    domain: identifier(entry.domain),
    address: identifier(entry.ip),
    description: text(entry.descr),
    forwardTlsUpstream: booleanValue(entry.forward_tls_upstream),
    tlsHostname: identifier(entry.tls_hostname)
  })));
}

/**
 * Certificate inventory. The upstream record carries the certificate and private
 * key PEM (`crt`, `prv`); neither is modeled here, so private key material cannot
 * reach the browser or a log even though the endpoint returns it.
 */
export function parseCertificates(data: unknown): ParsedRead<CertificateObservation> {
  const records = recordList(data, "the certificate inventory");
  return capList(records.map(entry => ({
    description: text(entry.descr),
    type: enumValue(entry.type, CERTIFICATE_TYPES),
    validFrom: text(entry.valid_from, 40),
    validUntil: text(entry.valid_until, 40),
    validDaysLeft: integer(entry.valid_days_left, -365_000, 365_000)
  })));
}

/** Certificate authorities. `crt` and `prv` are likewise not modeled. */
export function parseCertificateAuthorities(data: unknown): ParsedRead<CertificateAuthorityObservation> {
  const records = recordList(data, "the certificate authority inventory");
  return capList(records.map(entry => ({
    description: text(entry.descr),
    trust: booleanValue(entry.trust)
  })));
}

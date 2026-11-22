import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface ResolvedDeviceAddress {
  address: string;
  family: 4 | 6;
}

type Resolver = (hostname: string) => Promise<ResolvedDeviceAddress[]>;

interface Ipv4Range {
  base: number;
  prefix: number;
}

function ipv4Number(address: string): number | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return octets.reduce((value, octet) => value * 256 + octet, 0) >>> 0;
}

function ipv4Range(base: string, prefix: number): Ipv4Range {
  const value = ipv4Number(base);
  if (value === null) throw new Error("Invalid internal IPv4 range.");
  return { base: value, prefix };
}

const forbiddenIpv4Ranges = [
  ipv4Range("0.0.0.0", 8),
  ipv4Range("100.64.0.0", 10),
  ipv4Range("127.0.0.0", 8),
  ipv4Range("169.254.0.0", 16),
  ipv4Range("192.0.0.0", 24),
  ipv4Range("192.0.2.0", 24),
  ipv4Range("192.88.99.0", 24),
  ipv4Range("198.18.0.0", 15),
  ipv4Range("198.51.100.0", 24),
  ipv4Range("203.0.113.0", 24),
  ipv4Range("224.0.0.0", 4),
  ipv4Range("240.0.0.0", 4)
];

function isInIpv4Range(address: number, range: Ipv4Range): boolean {
  const mask = range.prefix === 0 ? 0 : (0xffffffff << (32 - range.prefix)) >>> 0;
  return (address & mask) === (range.base & mask);
}

function ipv6Number(address: string): bigint | null {
  if (isIP(address) !== 6 || address.includes("%")) return null;
  let value = address.toLowerCase();
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const embedded = ipv4Number(value.slice(separator + 1));
    if (embedded === null) return null;
    const high = ((embedded >>> 16) & 0xffff).toString(16);
    const low = (embedded & 0xffff).toString(16);
    value = value.slice(0, separator + 1) + high + ":" + low;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function inIpv6Prefix(value: bigint, base: bigint, prefix: number): boolean {
  const shift = 128n - BigInt(prefix);
  return (value >> shift) === (base >> shift);
}

const ipv6Prefixes = {
  uniqueLocal: 0xfc000000000000000000000000000000n,
  globalUnicast: 0x20000000000000000000000000000000n,
  unspecified: 0n,
  loopback: 1n,
  linkLocal: 0xfe800000000000000000000000000000n,
  multicast: 0xff000000000000000000000000000000n,
  ipv4Mapped: 0x00000000000000000000ffff00000000n,
  teredo: 0x20010000000000000000000000000000n,
  benchmarking: 0x20010002000000000000000000000000n,
  orchid: 0x20010010000000000000000000000000n,
  documentation: 0x20010db8000000000000000000000000n,
  sixToFour: 0x20020000000000000000000000000000n,
  documentationV2: 0x3fff0000000000000000000000000000n
} as const;

export function isAllowedDeviceAddress(input: string): boolean {
  const address = input.startsWith("[") && input.endsWith("]") ? input.slice(1, -1) : input;
  const family = isIP(address);
  if (family === 4) {
    const numeric = ipv4Number(address);
    return numeric !== null && !forbiddenIpv4Ranges.some(range => isInIpv4Range(numeric, range));
  }
  if (family === 6) {
    const numeric = ipv6Number(address);
    if (numeric === null) return false;
    if (inIpv6Prefix(numeric, ipv6Prefixes.uniqueLocal, 7)) return true;
    if (!inIpv6Prefix(numeric, ipv6Prefixes.globalUnicast, 3)) return false;
    return !(
      numeric === ipv6Prefixes.unspecified ||
      numeric === ipv6Prefixes.loopback ||
      inIpv6Prefix(numeric, ipv6Prefixes.linkLocal, 10) ||
      inIpv6Prefix(numeric, ipv6Prefixes.multicast, 8) ||
      inIpv6Prefix(numeric, ipv6Prefixes.ipv4Mapped, 96) ||
      inIpv6Prefix(numeric, ipv6Prefixes.teredo, 32) ||
      inIpv6Prefix(numeric, ipv6Prefixes.benchmarking, 48) ||
      inIpv6Prefix(numeric, ipv6Prefixes.orchid, 28) ||
      inIpv6Prefix(numeric, ipv6Prefixes.documentation, 32) ||
      inIpv6Prefix(numeric, ipv6Prefixes.sixToFour, 16) ||
      inIpv6Prefix(numeric, ipv6Prefixes.documentationV2, 20)
    );
  }
  return false;
}

const systemResolver: Resolver = async hostname => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map(result => ({ address: result.address, family: result.family as 4 | 6 }));
};

/**
 * Resolves a configured device hostname once and validates every returned
 * address. Callers must pin subsequent socket creation to the returned address
 * rather than performing a second DNS lookup.
 */
export async function resolveSafeDeviceDestination(
  hostnameInput: string,
  resolver: Resolver = systemResolver
): Promise<ResolvedDeviceAddress> {
  const hostname = hostnameInput.startsWith("[") && hostnameInput.endsWith("]")
    ? hostnameInput.slice(1, -1)
    : hostnameInput;
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    if (!isAllowedDeviceAddress(hostname)) throw new Error("The configured firewall address is not an allowed destination.");
    return { address: hostname, family: literalFamily };
  }
  if (!hostname || hostname.includes("%") || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("The configured firewall hostname is not an allowed destination.");
  }

  let addresses: ResolvedDeviceAddress[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new Error("The configured firewall hostname could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(item =>
    (item.family !== 4 && item.family !== 6) || !isAllowedDeviceAddress(item.address) || isIP(item.address) !== item.family
  )) {
    throw new Error("The configured firewall hostname resolves to an unsafe or unsupported destination.");
  }
  const selected = addresses[0];
  if (!selected) throw new Error("The configured firewall hostname has no usable address.");
  return selected;
}

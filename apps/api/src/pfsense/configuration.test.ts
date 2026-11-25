import { describe, expect, it } from "vitest";
import {
  parseAliases,
  parseCertificates,
  parseDnsSettings,
  parseDhcpStaticMappings,
  parseInterfaceConfig,
  parseNatPortForwards,
  parseRules
} from "./configuration.js";
import { PAGE_READ_LIMITS, PageReadShapeError } from "./page-read.js";

describe("alias configuration sanitizer", () => {
  it("keeps only the fields the Aliases page displays", () => {
    const parsed = parseAliases([{
      name: "LAN_NETWORK",
      type: "network",
      descr: "Local LAN",
      address: ["192.168.10.0/24"],
      detail: ["primary LAN"],
      id: 3,
      tracker: 1699999999
    }]);

    expect(parsed.truncated).toBe(false);
    expect(parsed.items).toEqual([{
      name: "LAN_NETWORK",
      type: "network",
      description: "Local LAN",
      entries: ["192.168.10.0/24"],
      entryCount: 1,
      entriesTruncated: false
    }]);
    expect(parsed.items[0]).not.toHaveProperty("id");
    expect(parsed.items[0]).not.toHaveProperty("detail");
  });

  it("leaves an unrecognized alias type unset instead of guessing", () => {
    expect(parseAliases([{ name: "ODD", type: "url", address: [] }]).items[0]?.type).toBeNull();
  });

  it("ignores non-string address entries and control characters", () => {
    const parsed = parseAliases([{
      name: "MIXED",
      type: "host",
      descr: "  \n ",
      address: ["10.0.0.1", 7, null, "\u0000bad\u001fentry", "  "]
    }]);

    expect(parsed.items[0]?.entries).toEqual(["10.0.0.1", "bad entry"]);
    expect(parsed.items[0]?.entryCount).toBe(2);
    expect(parsed.items[0]?.description).toBeNull();
  });

  it("caps entries per alias and reports that entries were withheld", () => {
    const address = Array.from({ length: 205 }, (_, index) => `10.0.${index}.1`);
    const parsed = parseAliases([{ name: "BIG", type: "host", address }]);

    expect(parsed.items[0]?.entries).toHaveLength(200);
    expect(parsed.items[0]?.entryCount).toBe(205);
    expect(parsed.items[0]?.entriesTruncated).toBe(true);
  });

  it("caps the alias list and reports that it was truncated", () => {
    const rows = Array.from({ length: PAGE_READ_LIMITS.maxItems + 1 }, (_, index) => ({ name: `A${index}`, type: "host", address: [] }));
    const parsed = parseAliases(rows);

    expect(parsed.items).toHaveLength(PAGE_READ_LIMITS.maxItems);
    expect(parsed.truncated).toBe(true);
  });

  it("rejects a response that is not a list of objects", () => {
    expect(() => parseAliases({ data: [] })).toThrow(PageReadShapeError);
    expect(() => parseAliases(["alias"])).toThrow(PageReadShapeError);
    expect(() => parseAliases(null)).toThrow(PageReadShapeError);
  });
});

describe("firewall rule sanitizer", () => {
  it("rebuilds the rule without internal identifiers", () => {
    const parsed = parseRules([{
      type: "pass",
      interface: ["wan"],
      ipprotocol: "inet",
      protocol: "tcp",
      source: "any",
      source_port: "1024:65535",
      destination: "WAN_NET",
      destination_port: "443",
      descr: "Allow HTTPS to web server",
      disabled: false,
      log: true,
      floating: false,
      direction: "in",
      gateway: "WAN_DHCP",
      tracker: 1699999999,
      associated_rule_id: "pass",
      id: 12,
      created_by: "admin@192.0.2.10"
    }]);

    expect(parsed.items[0]).toEqual({
      action: "pass",
      interfaces: ["wan"],
      ipProtocol: "inet",
      protocol: "tcp",
      source: "any",
      sourcePort: "1024:65535",
      destination: "WAN_NET",
      destinationPort: "443",
      description: "Allow HTTPS to web server",
      disabled: false,
      log: true,
      floating: false,
      direction: "in",
      gateway: "WAN_DHCP"
    });
    expect(parsed.items[0]).not.toHaveProperty("id");
    expect(parsed.items[0]).not.toHaveProperty("associated_rule_id");
    expect(parsed.items[0]).not.toHaveProperty("created_by");
  });

  it("does not guess an action, protocol, or direction it does not know", () => {
    const parsed = parseRules([{ type: "frobnicate", protocol: "sctp", direction: "sideways", interface: "wan" }]);
    expect(parsed.items[0]).toMatchObject({
      action: null,
      protocol: null,
      direction: null,
      interfaces: ["wan"]
    });
  });
});

describe("NAT port forward sanitizer", () => {
  it("keeps the mapping fields the NAT page renders", () => {
    const parsed = parseNatPortForwards([{
      interface: "wan",
      ipprotocol: "inet",
      protocol: "tcp",
      source: "any",
      source_port: null,
      destination: "WAN_ADDRESS",
      destination_port: "80",
      target: "192.168.10.20",
      local_port: "8080",
      disabled: false,
      nordr: true,
      descr: "Web server",
      natreflection: "purenat",
      associated_rule_id: "pass"
    }]);

    expect(parsed.items[0]).toEqual({
      interface: "wan",
      ipProtocol: "inet",
      protocol: "tcp",
      source: "any",
      sourcePort: null,
      destination: "WAN_ADDRESS",
      destinationPort: "80",
      target: "192.168.10.20",
      localPort: "8080",
      description: "Web server",
      disabled: false,
      natReflection: "purenat"
    });
  });
});

describe("interface configuration sanitizer", () => {
  it("keeps addressing and bounded values, dropping DHCP advanced options", () => {
    const parsed = parseInterfaceConfig([{
      if: "wan",
      descr: "WAN",
      enable: true,
      typev4: "dhcp",
      ipaddr: "192.0.2.20",
      subnet: 24,
      typev6: "none",
      ipaddrv6: "",
      mtu: 1500,
      media: "autoselect",
      adv_dhcp_send_options: "vendor-class-identifier",
      spoofmac: "aa:bb:cc:dd:ee:ff"
    }]);

    expect(parsed.items[0]).toEqual({
      name: "wan",
      description: "WAN",
      enabled: true,
      ipv4Type: "dhcp",
      ipv4Address: "192.0.2.20",
      ipv4Subnet: 24,
      ipv6Type: "none",
      ipv6Address: null,
      mtu: 1500,
      media: "autoselect"
    });
    expect(parsed.items[0]).not.toHaveProperty("spoofmac");
  });

  it("reports an out-of-range subnet or MTU as unknown rather than clamping it", () => {
    const parsed = parseInterfaceConfig([{ if: "lan", subnet: 64, mtu: 12 }]);
    expect(parsed.items[0]).toMatchObject({ ipv4Subnet: null, mtu: null });
  });
});

describe("DHCP static mapping sanitizer", () => {
  it("keeps the mapping and the interface it belongs to", () => {
    const parsed = parseDhcpStaticMappings([{
      parent_id: "lan",
      id: 0,
      mac: "aa:bb:cc:00:11:22",
      ipaddr: "192.168.10.30",
      cid: "01:aa:bb:cc:00:11:22",
      hostname: "nas",
      descr: "Storage",
      arp_table_static_entry: true
    }]);

    expect(parsed.items[0]).toEqual({
      parentId: "lan",
      mac: "aa:bb:cc:00:11:22",
      ipAddress: "192.168.10.30",
      hostname: "nas",
      description: "Storage",
      staticArp: true
    });
    expect(parsed.items[0]).not.toHaveProperty("cid");
  });
});

describe("DNS resolver settings sanitizer", () => {
  it("requires an object and drops free-form configuration text", () => {
    const parsed = parseDnsSettings({
      enable: true,
      port: "53",
      enablessl: false,
      tlsport: "",
      active_interface: ["lan"],
      outgoing_interface: [],
      dnssec: true,
      forwarding: false,
      regdhcp: true,
      regdhcpstatic: false,
      regovpnclients: true,
      strictout: true,
      custom_options: "server: include: /var/unbound/private.conf",
      python_script: "/root/script.py"
    });

    expect(parsed.items).toEqual([{
      enabled: true,
      port: "53",
      enableSsl: false,
      tlsPort: null,
      activeInterfaces: ["lan"],
      outgoingInterfaces: [],
      dnssec: true,
      forwarding: false,
      regDhcp: true,
      regDhcpStatic: false,
      regOpenVpnClients: true,
      strictOut: true
    }]);
  });

  it("rejects a list where the endpoint documents an object", () => {
    expect(() => parseDnsSettings([])).toThrow(PageReadShapeError);
  });
});

describe("certificate sanitizer", () => {
  it("never exposes certificate or private key material", () => {
    const parsed = parseCertificates([{
      descr: "Web GUI certificate",
      type: "server",
      crt: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      prv: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      valid_from: "2026-01-01",
      valid_until: "2027-01-01",
      valid_days_left: 365,
      refid: "69a1b2c3d4e5f",
      caref: "5f4e3d2c1b0a9"
    }]);

    expect(parsed.items).toEqual([{
      description: "Web GUI certificate",
      type: "server",
      validFrom: "2026-01-01",
      validUntil: "2027-01-01",
      validDaysLeft: 365
    }]);
    expect(JSON.stringify(parsed)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(parsed)).not.toContain("BEGIN CERTIFICATE");
    expect(parsed.items[0]).not.toHaveProperty("refid");
  });

  it("reports an unrecognized certificate type as unknown", () => {
    expect(parseCertificates([{ descr: "Odd", type: "ca" }]).items[0]?.type).toBeNull();
  });
});


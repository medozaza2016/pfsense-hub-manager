import { describe, expect, it } from "vitest";
import { PageReadShapeError } from "./page-read.js";
import {
  parseIpsecSas,
  parseOpenVpnClients,
  parseOpenVpnServers,
  parseWireGuardPeers,
  parseWireGuardTunnels
} from "./vpn-status.js";

describe("IPsec status sanitizer", () => {
  it("renders the tunnel state without SPI or key material", () => {
    const parsed = parseIpsecSas([{
      con_id: "1",
      uniqueid: 0,
      version: 2,
      state: "established",
      local_host: "192.0.2.10",
      local_port: "500",
      local_id: "fw.example.net",
      remote_host: "198.51.100.20",
      remote_port: "500",
      remote_id: "peer.example.net",
      initiator_spi: "0a0b0c0d0e0f1011",
      responder_spi: "1112131415161718",
      nat_remote: true,
      encr_alg: "aes",
      encr_keysize: 256,
      integ_alg: "sha256",
      dh_group: "modp2048",
      established: 1_767_225_600,
      child_sas: [{ name: "child" }]
    }]);

    expect(parsed.items[0]).toEqual({
      state: "established",
      version: 2,
      localHost: "192.0.2.10",
      localId: "fw.example.net",
      remoteHost: "198.51.100.20",
      remoteId: "peer.example.net",
      encryption: "aes 256",
      integrity: "sha256",
      dhGroup: "modp2048",
      natRemote: true,
      establishedAt: "2026-01-01T00:00:00.000Z"
    });
    expect(parsed.items[0]).not.toHaveProperty("initiator_spi");
    expect(parsed.items[0]).not.toHaveProperty("responder_spi");
    expect(parsed.items[0]).not.toHaveProperty("child_sas");
  });

  it("reports an unrecognized version or NAT flag as unknown", () => {
    const parsed = parseIpsecSas([{ version: 3, nat_remote: "yes", established: 1 }]);
    expect(parsed.items[0]).toMatchObject({ version: null, natRemote: null, establishedAt: null });
  });
});

describe("OpenVPN status sanitizer", () => {
  it("counts server connections and never exposes the management socket", () => {
    const parsed = parseOpenVpnServers([{
      name: "roadwarrior",
      mode: "server_tls_user",
      port: "1194",
      vpnid: 1,
      mgmt: "/var/etc/openvpn/server1.sock",
      conns: [{ common_name: "user1", remote_host: "203.0.113.5" }],
      routes: [{}]
    }]);

    expect(parsed.items[0]).toEqual({
      name: "roadwarrior",
      mode: "server_tls_user",
      port: "1194",
      vpnId: 1,
      connectionCount: 1
    });
    expect(JSON.stringify(parsed)).not.toContain("sock");
  });

  it("keeps the client state and addresses without the management socket", () => {
    const parsed = parseOpenVpnClients([{
      name: "uplink",
      port: "1195",
      vpnid: 2,
      mgmt: "/var/etc/openvpn/client2.sock",
      status: "connected",
      state: "CONNECTED",
      state_detail: "SUCCESS",
      connect_time: "2026-01-01 00:00:00",
      virtual_addr: "10.8.0.6",
      virtual_addr6: "",
      remote_host: "203.0.113.10",
      remote_port: "1194"
    }]);

    expect(parsed.items[0]).toEqual({
      name: "uplink",
      status: "connected",
      state: "CONNECTED",
      stateDetail: "SUCCESS",
      connectTime: "2026-01-01 00:00:00",
      virtualAddress: "10.8.0.6",
      virtualAddress6: null,
      remoteHost: "203.0.113.10",
      remotePort: "1194"
    });
  });
});

describe("WireGuard status sanitizer", () => {
  it("keeps tunnel counters and the peer count only", () => {
    const parsed = parseWireGuardTunnels([{
      name: "wg0",
      status: "up",
      public_key: "tunnel-public-key",
      listen_port: "51820",
      mtu: 1420,
      transfer_rx: 1024,
      transfer_tx: 2048,
      inpkts: 3,
      outpkts: 4,
      descr: "Site link",
      peers: [{}, {}, {}]
    }]);

    expect(parsed.items[0]).toEqual({
      name: "wg0",
      status: "up",
      listenPort: "51820",
      mtu: 1420,
      transferRx: 1024,
      transferTx: 2048,
      inPackets: 3,
      outPackets: 4,
      description: "Site link",
      peerCount: 3
    });
    expect(parsed.items[0]).not.toHaveProperty("public_key");
  });

  it("never exposes peer keys or a preshared key", () => {
    const parsed = parseWireGuardPeers([{
      tunnel_device: "tun_wg0",
      public_key: "peer-public-key",
      preshared_key: "peer-preshared-key",
      endpoint: "198.51.100.30:51820",
      allowed_ips: ["10.10.0.2/32", "10.10.1.0/24"],
      latest_handshake: 1_767_225_600,
      transfer_rx: 10,
      transfer_tx: 20,
      persistent_keepalive: "25",
      descr: "Branch peer"
    }]);

    expect(parsed.items[0]).toEqual({
      tunnel: "tun_wg0",
      endpoint: "198.51.100.30:51820",
      allowedIps: ["10.10.0.2/32", "10.10.1.0/24"],
      latestHandshakeAt: "2026-01-01T00:00:00.000Z",
      transferRx: 10,
      transferTx: 20,
      persistentKeepalive: "25",
      description: "Branch peer"
    });
    expect(JSON.stringify(parsed)).not.toContain("preshared");
    expect(JSON.stringify(parsed)).not.toContain("peer-public-key");
  });

  it("rejects a response that is not a list of objects", () => {
    expect(() => parseWireGuardTunnels({ data: [] })).toThrow(PageReadShapeError);
  });
});

import {
  capList,
  enumValue,
  identifier,
  integer,
  isoFromEpochSeconds,
  nestedCount,
  recordList,
  stringList,
  text,
  type ParsedRead
} from "./page-read.js";

/**
 * Sanitized page-scoped VPN status reads (DEC-048).
 *
 * These are status endpoints, not configuration: they are read on demand for the
 * VPN page, are never part of the health poll, and never feed capability evidence.
 * Keys, preshared keys, management-socket paths, and Security Parameter Indexes are
 * deliberately not modeled: none of them is needed to display tunnel state, and a
 * status page is the wrong place to widen access to keying material.
 */

export interface IpsecSaObservation {
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

export interface OpenVpnServerObservation {
  name: string | null;
  mode: string | null;
  port: string | null;
  vpnId: number | null;
  /** How many client connections the firewall reported, never the connection records. */
  connectionCount: number;
}

export interface OpenVpnClientObservation {
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

export interface WireGuardTunnelObservation {
  name: string | null;
  status: "up" | "down" | null;
  listenPort: string | null;
  mtu: number | null;
  transferRx: number | null;
  transferTx: number | null;
  inPackets: number | null;
  outPackets: number | null;
  description: string | null;
  /** How many peers the tunnel reported, never the peer records. */
  peerCount: number | null;
}

export interface WireGuardPeerObservation {
  tunnel: string | null;
  endpoint: string | null;
  allowedIps: string[];
  latestHandshakeAt: string | null;
  transferRx: number | null;
  transferTx: number | null;
  persistentKeepalive: string | null;
  description: string | null;
}

const MAX_COUNTER = 9_007_199_254_740_991;

export function parseIpsecSas(data: unknown): ParsedRead<IpsecSaObservation> {
  const records = recordList(data, "the IPsec security association status");
  return capList(records.map(entry => {
    const encryptionAlgorithm = identifier(entry.encr_alg);
    const keySize = integer(entry.encr_keysize, 0, 4_096);
    return {
      state: identifier(entry.state),
      version: integer(entry.version, 1, 2),
      localHost: identifier(entry.local_host),
      localId: identifier(entry.local_id),
      remoteHost: identifier(entry.remote_host),
      remoteId: identifier(entry.remote_id),
      encryption: encryptionAlgorithm === null
        ? null
        : keySize === null ? encryptionAlgorithm : `${encryptionAlgorithm} ${keySize}`,
      integrity: identifier(entry.integ_alg),
      dhGroup: identifier(entry.dh_group),
      natRemote: typeof entry.nat_remote === "boolean" ? entry.nat_remote : null,
      establishedAt: isoFromEpochSeconds(entry.established)
    };
  }));
}

export function parseOpenVpnServers(data: unknown): ParsedRead<OpenVpnServerObservation> {
  const records = recordList(data, "the OpenVPN server status");
  return capList(records.map(entry => ({
    name: identifier(entry.name),
    mode: identifier(entry.mode),
    port: identifier(entry.port),
    vpnId: integer(entry.vpnid, 0, 65_535),
    connectionCount: nestedCount(entry.conns) ?? 0
  })));
}

export function parseOpenVpnClients(data: unknown): ParsedRead<OpenVpnClientObservation> {
  const records = recordList(data, "the OpenVPN client status");
  return capList(records.map(entry => ({
    name: identifier(entry.name),
    status: identifier(entry.status),
    state: identifier(entry.state),
    stateDetail: text(entry.state_detail),
    connectTime: text(entry.connect_time, 40),
    virtualAddress: identifier(entry.virtual_addr),
    virtualAddress6: identifier(entry.virtual_addr6),
    remoteHost: identifier(entry.remote_host),
    remotePort: identifier(entry.remote_port)
  })));
}

export function parseWireGuardTunnels(data: unknown): ParsedRead<WireGuardTunnelObservation> {
  const records = recordList(data, "the WireGuard tunnel status");
  return capList(records.map(entry => ({
    name: identifier(entry.name),
    status: enumValue(entry.status, ["up", "down"] as const),
    listenPort: identifier(entry.listen_port),
    mtu: integer(entry.mtu, 576, 65_535),
    transferRx: integer(entry.transfer_rx, 0, MAX_COUNTER),
    transferTx: integer(entry.transfer_tx, 0, MAX_COUNTER),
    inPackets: integer(entry.inpkts, 0, MAX_COUNTER),
    outPackets: integer(entry.outpkts, 0, MAX_COUNTER),
    description: text(entry.descr),
    peerCount: nestedCount(entry.peers)
  })));
}

export function parseWireGuardPeers(data: unknown): ParsedRead<WireGuardPeerObservation> {
  const records = recordList(data, "the WireGuard peer status");
  return capList(records.map(entry => ({
    tunnel: identifier(entry.tunnel_device),
    endpoint: identifier(entry.endpoint),
    allowedIps: stringList(entry.allowed_ips, 64, 43),
    latestHandshakeAt: isoFromEpochSeconds(entry.latest_handshake),
    transferRx: integer(entry.transfer_rx, 0, MAX_COUNTER),
    transferTx: integer(entry.transfer_tx, 0, MAX_COUNTER),
    persistentKeepalive: identifier(entry.persistent_keepalive),
    description: text(entry.descr)
  })));
}

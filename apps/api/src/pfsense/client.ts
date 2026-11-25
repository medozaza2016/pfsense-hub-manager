import {readFile} from "node:fs/promises";
import {checkServerIdentity} from "node:tls";
import type { LookupAddress, LookupOptions } from "node:dns";
import {Agent,fetch} from "undici";
import {z} from "zod";
import type {AppConfig} from "../config.js";
import {resolveSafeDeviceDestination} from "../devices/network-destination.js";
import {findUpstreamErrorCode,hasTlsFailure,PfSenseApiError} from "./errors.js";
const envelope=z.object({code:z.number().optional(),status:z.string().optional(),response_id:z.string().optional(),message:z.string().optional(),data:z.unknown()}).passthrough();
const routes={
 system:"/api/v2/status/system",gateways:"/api/v2/status/gateways",interfaces:"/api/v2/status/interfaces",
 services:"/api/v2/status/services",version:"/api/v2/system/version",arpTable:"/api/v2/diagnostics/arp_table",
 firewallStates:"/api/v2/firewall/states",firewallStateSize:"/api/v2/firewall/states/size"
} as const;
export type PfSenseOperation=keyof typeof routes;

/**
 * Page-scoped configuration reads (DEC-047, DEC-048).
 *
 * This is a second fixed allowlist, deliberately separate from the polled status
 * operations: a configuration page must never join the health-collection cycle,
 * and the manager still never accepts a caller-supplied path, method, or URL.
 * Adding an entry here is a product and security decision, not configuration.
 */
const configurationRoutes={
 aliases:"/api/v2/firewall/aliases",
 interfaces:"/api/v2/interfaces",
 rules:"/api/v2/firewall/rules",
 natPortForwards:"/api/v2/firewall/nat/port_forwards",
 natOutbound:"/api/v2/firewall/nat/outbound/mappings",
 natOneToOne:"/api/v2/firewall/nat/one_to_one/mappings",
 staticRoutes:"/api/v2/routing/static_routes",
 dhcpServers:"/api/v2/services/dhcp_servers",
 dhcpAddressPools:"/api/v2/services/dhcp_server/address_pools",
 dhcpStaticMappings:"/api/v2/services/dhcp_server/static_mappings",
 dnsSettings:"/api/v2/services/dns_resolver/settings",
 dnsHostOverrides:"/api/v2/services/dns_resolver/host_overrides",
 dnsDomainOverrides:"/api/v2/services/dns_resolver/domain_overrides",
 certificates:"/api/v2/system/certificates",
 certificateAuthorities:"/api/v2/system/certificate_authorities"
} as const;
export type PfSenseConfigurationOperation=keyof typeof configurationRoutes;

/**
 * Page-scoped status reads (DEC-048): VPN tunnel state plus the installed REST API
 * package version. These are not configuration, so they are a third fixed allowlist
 * with telemetry authorization; they are still read on demand and never polled.
 */
const statusDetailRoutes={
 ipsecSas:"/api/v2/status/ipsec/sas",
 openvpnServers:"/api/v2/status/openvpn/servers",
 openvpnClients:"/api/v2/status/openvpn/clients",
 wireguardTunnels:"/api/v2/status/wireguard/tunnels",
 wireguardPeers:"/api/v2/status/wireguard/peers",
 restapiVersion:"/api/v2/system/restapi/version"
} as const;
export type PfSenseStatusDetailOperation=keyof typeof statusDetailRoutes;

export type PfSenseTlsTrust =
 | { mode: "system"; servername?: string | null }
 | { mode: "custom-ca"; certificateAuthority: Buffer; servername?: string | null }
 | { mode: "legacy-ca-file"; servername?: string | null };

export function selectTlsCa(trust: PfSenseTlsTrust | undefined, legacyCa?: Buffer): Buffer | undefined {
 if (trust?.mode === "system") return undefined;
 if (trust?.mode === "custom-ca") {
  if (!Buffer.isBuffer(trust.certificateAuthority) || trust.certificateAuthority.length === 0 || trust.certificateAuthority.length > 64 * 1024) {
   throw new Error("The device TLS trust bundle is invalid.");
  }
  return trust.certificateAuthority;
 }
 if (trust?.mode === "legacy-ca-file") return legacyCa;
 if (trust === undefined) return legacyCa;
 return undefined;
}

type PinnedLookup = (
 hostname: string,
 options: LookupOptions,
 callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) => void;

export function createPinnedLookup(expectedHostname: string, address: { address: string; family: 4 | 6 }): PinnedLookup {
 const expected=expectedHostname.toLowerCase();
 return (hostname, options, callback) => {
  if(hostname.toLowerCase()!==expected){
   const error=Object.assign(new Error("Unexpected hostname lookup."),{code:"ENOTFOUND"});
   callback(error,"",0);
   return;
  }
  const record={address:address.address,family:address.family};
  if(options.all) callback(null,[record]);
  else callback(null,record.address,record.family);
 };
}

export class PfSenseClient{
 private readonly base:URL;
 private readonly dispatcher:Promise<Agent>;
 constructor(private readonly config:AppConfig,private readonly key:string,tlsTrust?:PfSenseTlsTrust){
  const baseUrl=config.PFSENSE_API_BASE_URL;
  if(!baseUrl) throw new Error("A firewall HTTPS origin is required to create a pfSense client.");
  const base=new URL(baseUrl);
  this.base=base;
  this.dispatcher=(async()=>{
   const destination=await resolveSafeDeviceDestination(base.hostname);
   // The legacy bootstrap path explicitly opts into its historical global CA file.
   // Managed devices pass system/custom-ca trust and never inherit this global CA.
   const useLegacyCaFile=tlsTrust?.mode==="legacy-ca-file"||tlsTrust===undefined;
   const legacyCaPath=useLegacyCaFile?process.env.PFSENSE_CA_FILE:undefined;
   const legacyCa=legacyCaPath?await readFile(legacyCaPath):undefined;
   const ca=selectTlsCa(tlsTrust,legacyCa);
   return new Agent({connect:{
    ...(ca?{ca}:{}),
    ...(tlsTrust?.servername ? {
     servername: tlsTrust.servername,
     // The URL host can be an IP while the certificate identifies the firewall by DNS.
     // Keep SNI and certificate identity verification pinned to the same explicit name.
     checkServerIdentity: (_hostname, certificate) => checkServerIdentity(tlsTrust.servername!, certificate)
    } : {}),
    rejectUnauthorized:true,
    lookup:createPinnedLookup(base.hostname.startsWith("[") ? base.hostname.slice(1,-1) : base.hostname,destination)
   }});
  })();
 }
 /**
  * The single upstream request path. Both allowlists use it, so timeout, TLS,
  * redirect, response-size, envelope, and error-class handling cannot diverge.
  */
 private async send(path:string){
  const dispatcher=await this.dispatcher;
  let response;
  try{response=await fetch(new URL(path,this.base),{method:"GET",headers:{"X-API-Key":this.key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(this.config.upstreamRequestTimeoutMs),dispatcher});}
  catch(error){if(hasTlsFailure(error))throw new PfSenseApiError("Firewall TLS verification failed.","tls",undefined,findUpstreamErrorCode(error));if(error instanceof Error&&(error.name==="AbortError"||error.name==="TimeoutError"))throw new PfSenseApiError("Firewall request timed out.","timeout");throw new PfSenseApiError("Firewall connection failed.","unknown",undefined,findUpstreamErrorCode(error));}
  if(response.status===401)throw new PfSenseApiError("Firewall authentication failed.","authentication",401);
  if(response.status===403)throw new PfSenseApiError("Firewall denied the requested operation.","authorization",403);
  if(response.status===404)throw new PfSenseApiError("Firewall endpoint is unavailable.","unsupported",404);
  if(response.status===429)throw new PfSenseApiError("Firewall API rate limit was reached.","rate_limit",429);
  if(!response.ok)throw new PfSenseApiError("Firewall API returned an error.","remote_server",response.status);
  const text=await response.text();
  if(text.length>2_000_000)throw new PfSenseApiError("Firewall response exceeded the 2 MB limit.","invalid_response");
  let json:unknown;try{json=JSON.parse(text);}catch{throw new PfSenseApiError("Firewall returned invalid JSON.","invalid_response");}
  const parsed=envelope.safeParse(json);if(!parsed.success)throw new PfSenseApiError("Firewall response did not match the expected API envelope.","invalid_response");
  if(parsed.data.code!==undefined&&parsed.data.code>=400)throw new PfSenseApiError("Firewall API reported an unsuccessful operation.",parsed.data.code===401?"authentication":parsed.data.code===403?"authorization":"remote_server",parsed.data.code);
  return parsed.data;
 }
 /**
  * Approved status operation (the eight-operation allowlist). The endpoint's
  * minimum response contract is validated before the data is returned.
  */
 async get(operation:PfSenseOperation){
  const result=await this.send(routes[operation]);
  validatePfSenseOperationData(operation,result.data);
  return result;
 }
 /**
  * Approved page-scoped configuration operation. The endpoint-specific schema is
  * applied by the caller (`configuration.ts`), which also builds the sanitized
  * read model, so upstream fields are never passed through.
  */
 async getConfiguration(operation:PfSenseConfigurationOperation){
  return this.send(configurationRoutes[operation]);
 }
 /**
  * Approved page-scoped VPN status operation. Sanitized by `vpn-status.ts`.
  * Kept separate from `getConfiguration` because it is status, not configuration,
  * and carries telemetry authorization rather than administrator-only access.
  */
 async getStatusDetail(operation:PfSenseStatusDetailOperation){
  return this.send(statusDetailRoutes[operation]);
 }
 async close(){await (await this.dispatcher).close();}
}
export const pfSenseOperations=Object.keys(routes) as PfSenseOperation[];
export const pfSenseConfigurationOperations=Object.keys(configurationRoutes) as PfSenseConfigurationOperation[];
export const pfSenseStatusDetailOperations=Object.keys(statusDetailRoutes) as PfSenseStatusDetailOperation[];

/** The fixed upstream path for an approved configuration operation. */
export function pfSenseConfigurationRoute(operation:PfSenseConfigurationOperation):string{
 return configurationRoutes[operation];
}
/** The fixed upstream path for an approved VPN status operation. */
export function pfSenseStatusDetailRoute(operation:PfSenseStatusDetailOperation):string{
 return statusDetailRoutes[operation];
}
/**
 * The REST API privilege that gates a fixed upstream path, derived with the same
 * rule the package uses in its permission inventory: `/api/v2/firewall/rules`
 * becomes `api-v2-firewall-rules-get`. This only builds an operator-facing message;
 * it never grants anything. A wrong guess produces a 403, not access.
 */
export function pfSenseReadPrivilege(path:string):string{
 return path.replace(/^\//,"").replace(/[/_]/g,"-")+"-get";
}

/**
 * Validate the minimum response contract for each approved read-only endpoint.
 * Keep endpoint-specific schemas deliberately narrow: a field may be optional
 * for firmware/package variation, but a wrong top-level shape is never success.
 */
const recordSchema=z.record(z.string(),z.unknown());
const recordsSchema=z.array(recordSchema);
const nonEmptyObjectSchema=z.object({}).passthrough().refine(value=>Object.keys(value).length>0,"Expected a non-empty object.");
const versionSchema=z.union([
 z.string().min(1),
 nonEmptyObjectSchema
]);
const stateSizeSchema=z.union([
 z.number().finite().nonnegative(),
 nonEmptyObjectSchema
]);
const dataSchemas:Record<PfSenseOperation,z.ZodType>={
 system:nonEmptyObjectSchema,
 gateways:recordsSchema,
 interfaces:recordsSchema,
 services:recordsSchema,
 version:versionSchema,
 arpTable:recordsSchema,
 firewallStates:recordsSchema,
 firewallStateSize:stateSizeSchema
};

export function validatePfSenseOperationData(operation:PfSenseOperation,data:unknown):void {
 const parsed=dataSchemas[operation].safeParse(data);
 if(!parsed.success) throw new PfSenseApiError(
  `Firewall returned an invalid data shape for the ${operation} operation.`,
  "invalid_response"
 );
}

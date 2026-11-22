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
 async get(operation:PfSenseOperation){
  const dispatcher=await this.dispatcher;
  let response;
  try{response=await fetch(new URL(routes[operation],this.base),{method:"GET",headers:{"X-API-Key":this.key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(this.config.PFSENSE_API_TIMEOUT_MS),dispatcher});}
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
  validatePfSenseOperationData(operation,parsed.data.data);
  return parsed.data;
 }
 async close(){await (await this.dispatcher).close();}
}
export const pfSenseOperations=Object.keys(routes) as PfSenseOperation[];

/**
 * Validate the minimum response contract for each approved read-only endpoint.
 * Keep endpoint-specific schemas deliberately narrow: a field may be optional
 * for firmware/package variation, but a wrong top-level shape is never success.
 */
const recordSchema=z.record(z.string(),z.unknown());
const recordsSchema=z.array(recordSchema);
// Version payloads vary across pfSense package releases. Require a non-empty
// version object/string while preserving the upstream fields for later mapping.
const versionSchema=z.union([
 z.string().min(1),
 z.object({}).passthrough().refine(value=>Object.values(value).some(item=>typeof item==="string"&&item.trim().length>0),"Expected a non-empty version object.")
]);
const firewallStateSizeSchema=z.union([
 z.number().finite().nonnegative(),
 z.object({}).passthrough().refine(value=>Object.values(value).some(item=>typeof item==="number"&&Number.isFinite(item)&&item>=0),"Expected a non-negative state size.")
]);
const dataSchemas:Record<PfSenseOperation,z.ZodType>={
 system:recordSchema,
 gateways:recordsSchema,
 interfaces:recordsSchema,
 services:recordsSchema,
 version:versionSchema,
 arpTable:recordsSchema,
 firewallStates:recordsSchema,
 firewallStateSize:firewallStateSizeSchema
};

export function validatePfSenseOperationData(operation:PfSenseOperation,data:unknown):void {
 const parsed=dataSchemas[operation].safeParse(data);
 if(!parsed.success) throw new PfSenseApiError(
  `Firewall returned an invalid data shape for the ${operation} operation.`,
  "invalid_response"
 );
}

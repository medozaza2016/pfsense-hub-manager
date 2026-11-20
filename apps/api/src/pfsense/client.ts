import {readFile} from "node:fs/promises";
import {Agent,fetch} from "undici";
import {z} from "zod";
import type {AppConfig} from "../config.js";
import {PfSenseApiError} from "./errors.js";
const envelope=z.object({code:z.number().optional(),status:z.string().optional(),response_id:z.string().optional(),message:z.string().optional(),data:z.unknown()}).passthrough();
const routes={
 system:"/api/v2/status/system",gateways:"/api/v2/status/gateways",interfaces:"/api/v2/status/interfaces",
 services:"/api/v2/status/services",version:"/api/v2/system/version",arpTable:"/api/v2/diagnostics/arp_table",
 firewallStates:"/api/v2/firewall/states",firewallStateSize:"/api/v2/firewall/states/size"
} as const;
export type PfSenseOperation=keyof typeof routes;
export class PfSenseClient{
 private readonly base:URL; private readonly dispatcher:Promise<Agent>;
 constructor(private readonly config:AppConfig,private readonly key:string){
  this.base=new URL(config.PFSENSE_API_BASE_URL);
  this.dispatcher=(async()=>{const caPath=process.env.PFSENSE_CA_FILE;return caPath?new Agent({connect:{ca:await readFile(caPath),rejectUnauthorized:true}}):new Agent({connect:{rejectUnauthorized:true}});})();
 }
 async get(operation:PfSenseOperation){
  const dispatcher=await this.dispatcher;
  let response;
  try{response=await fetch(new URL(routes[operation],this.base),{method:"GET",headers:{"X-API-Key":this.key,Accept:"application/json"},signal:AbortSignal.timeout(this.config.PFSENSE_API_TIMEOUT_MS),dispatcher});}
  catch(error){const message=error instanceof Error?error.message:"";if(/certificate|tls|ssl/i.test(message))throw new PfSenseApiError("Firewall TLS verification failed.","tls");if(error instanceof Error&&(error.name==="AbortError"||error.name==="TimeoutError"))throw new PfSenseApiError("Firewall request timed out.","timeout");throw new PfSenseApiError("Firewall connection failed.","unknown");}
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
 async close(){await (await this.dispatcher).close();}
}
export const pfSenseOperations=Object.keys(routes) as PfSenseOperation[];

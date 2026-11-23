import { readFile } from "node:fs/promises";
import { z } from "zod";
const schema = z.object({
 NODE_ENV:z.enum(["development","test","production"]).default("development"),
 HOST:z.string().default("127.0.0.1"), PORT:z.coerce.number().int().min(1).max(65535).default(3000),
 DATABASE_URL:z.string().min(1), PFSENSE_DEVICE_ID:z.preprocess(value=>typeof value==="string"&&value.trim()===""?undefined:value,z.string().uuid().optional()),
 PFSENSE_DEVICE_NAME:z.preprocess(value=>typeof value==="string"&&value.trim()===""?undefined:value,z.string().trim().min(1).max(120).optional()),
 PFSENSE_DEVICE_LOCATION:z.string().max(120).default(""),
 PFSENSE_EDITION:z.enum(["plus","ce","unknown"]).default("unknown"),
 PFSENSE_API_BASE_URL:z.preprocess(value=>typeof value==="string"&&value.trim()===""?undefined:typeof value==="string"?value.trim():value,z.string().url().optional()),
 PFSENSE_API_KEY_FILE:z.string().min(1),
 APP_ENCRYPTION_KEY_FILE:z.string().min(1),
 PFSENSE_API_TIMEOUT_MS:z.coerce.number().int().min(1000).max(60000).default(10000),
 PFSENSE_OBSERVATION_CACHE_MS:z.coerce.number().int().min(1000).max(60000).default(10000),
 PFSENSE_OBSERVATION_ERROR_CACHE_MS:z.coerce.number().int().min(0).max(60000).default(2000),
 HUB_DEPLOYMENT_AGENT_SOCKET:z.union([z.string().trim().min(1),z.literal("")]).optional(),
 HUB_DEPLOYMENT_AGENT_TOKEN:z.union([z.string().min(32).max(256),z.literal("")]).optional(),
 HUB_DEPLOYMENT_AGENT_API_PORT:z.coerce.number().int().min(1).max(65535).default(3001),
 HUB_ACCESS_DEPLOYMENT_ENABLED:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
 HUB_HOST_MONITORING_ENABLED:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
 HUB_HOST_OPERATIONS_ENABLED:z.enum(["true","false"]).default("false").transform(value=>value==="true"),
 HUB_HOST_OPERATION_TIMEOUT_MS:z.coerce.number().int().min(5000).max(600000).default(180000)
}).superRefine((value,context)=>{
 // Host operations are a strict superset of monitoring: refuse the incoherent pairing.
 if(value.HUB_HOST_OPERATIONS_ENABLED && !value.HUB_HOST_MONITORING_ENABLED)
  context.addIssue({code:"custom",path:["HUB_HOST_OPERATIONS_ENABLED"],message:"Requires HUB_HOST_MONITORING_ENABLED=true."});
 const bootstrapRequested=Boolean(value.PFSENSE_DEVICE_ID||value.PFSENSE_DEVICE_NAME||value.PFSENSE_API_BASE_URL);
 if(!bootstrapRequested) return;
 if(!value.PFSENSE_DEVICE_ID) context.addIssue({code:"custom",path:["PFSENSE_DEVICE_ID"],message:"Required when legacy firewall bootstrap is configured."});
 if(!value.PFSENSE_DEVICE_NAME) context.addIssue({code:"custom",path:["PFSENSE_DEVICE_NAME"],message:"Required when legacy firewall bootstrap is configured."});
 if(!value.PFSENSE_API_BASE_URL) context.addIssue({code:"custom",path:["PFSENSE_API_BASE_URL"],message:"Required when legacy firewall bootstrap is configured."});
});
export type AppConfig=z.infer<typeof schema>;
export function loadConfig(env:NodeJS.ProcessEnv=process.env):AppConfig {
 const parsed=schema.safeParse(env);
 if(!parsed.success) throw new Error("Invalid application configuration: "+parsed.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; "));
 if(parsed.data.PFSENSE_API_BASE_URL){
  const url=new URL(parsed.data.PFSENSE_API_BASE_URL);
  if(url.protocol!=="https:" || url.username || url.password || url.search || url.hash || (url.pathname!=="" && url.pathname!=="/")) throw new Error("PFSENSE_API_BASE_URL must be an HTTPS origin without credentials, path, query, or fragment.");
 }
 return parsed.data;
}
export async function loadApiKey(path:string):Promise<string>{
 const key=(await readFile(path,"utf8")).trim();
 if(!key || /[\r\n]/.test(key)) throw new Error("The pfSense API key secret file is empty or malformed.");
 return key;
}
export async function loadEncryptionKey(path:string):Promise<Buffer>{
 let value:string;
 try { value=(await readFile(path,"utf8")).trim(); }
 catch { throw new Error("The application encryption key file is unavailable. Refusing to start without it."); }
 if(!/^[0-9a-fA-F]{64}$/.test(value)) throw new Error("The application encryption key file must contain exactly 64 hexadecimal characters (32 bytes).");
 return Buffer.from(value,"hex");
}

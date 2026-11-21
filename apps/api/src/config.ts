import { readFile } from "node:fs/promises";
import { z } from "zod";
const schema = z.object({
 NODE_ENV:z.enum(["development","test","production"]).default("development"),
 HOST:z.string().default("127.0.0.1"), PORT:z.coerce.number().int().min(1).max(65535).default(3000),
 DATABASE_URL:z.string().min(1), PFSENSE_DEVICE_ID:z.string().uuid(),
 PFSENSE_DEVICE_NAME:z.string().min(1).max(120), PFSENSE_DEVICE_LOCATION:z.string().max(120).default(""),
 PFSENSE_EDITION:z.enum(["plus","ce","unknown"]).default("unknown"),
 PFSENSE_API_BASE_URL:z.string().url(), PFSENSE_API_KEY_FILE:z.string().min(1), PFSENSE_CREDENTIALS_KEY_FILE:z.string().default("/run/secrets/device_credentials_key"),
 PFSENSE_API_TIMEOUT_MS:z.coerce.number().int().min(1000).max(60000).default(10000)
});
export type AppConfig=z.infer<typeof schema>;
export function loadConfig(env:NodeJS.ProcessEnv=process.env):AppConfig {
 const parsed=schema.safeParse(env);
 if(!parsed.success) throw new Error("Invalid application configuration: "+parsed.error.issues.map(i=>i.path.join(".")+": "+i.message).join("; "));
 const url=new URL(parsed.data.PFSENSE_API_BASE_URL);
 if(url.protocol!=="https:" || url.username || url.password || url.search || url.hash) throw new Error("PFSENSE_API_BASE_URL must be an HTTPS origin without credentials, query, or fragment.");
 return parsed.data;
}
export async function loadApiKey(path:string):Promise<string>{
 const key=(await readFile(path,"utf8")).trim();
 if(!key || /[\r\n]/.test(key)) throw new Error("The pfSense API key secret file is empty or malformed.");
 return key;
}

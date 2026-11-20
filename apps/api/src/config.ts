import { readFile } from "node:fs/promises";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  PFSENSE_DEVICE_ID: z.string().uuid(),
  PFSENSE_DEVICE_NAME: z.string().min(1).max(120),
  PFSENSE_DEVICE_LOCATION: z.string().max(120).default(""),
  PFSENSE_EDITION: z.enum(["plus", "ce", "unknown"]).default("unknown"),
  PFSENSE_API_BASE_URL: z.string().url(),
  PFSENSE_API_KEY_FILE: z.string().min(1),
  PFSENSE_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  PFSENSE_POLL_INTERVAL_MS: z.coerce.number().int().min(30000).max(3600000).default(300000)
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid application configuration: ${details}`);
  }
  const url = new URL(parsed.data.PFSENSE_API_BASE_URL);
  if (url.protocol !== "https:") throw new Error("PFSENSE_API_BASE_URL must use HTTPS.");
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("PFSENSE_API_BASE_URL must not contain credentials, query parameters, or fragments.");
  }
  return parsed.data;
}

export async function loadApiKey(path: string): Promise<string> {
  const value = (await readFile(path, "utf8")).trim();
  if (!value || value.includes("\n")) throw new Error("The pfSense API key secret file is empty or malformed.");
  return value;
}

import { loadConfig, loadApiKey } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { loadCredentialEncryptionKey } from "./auth/credential-crypto.js";
import { PfSenseClient } from "./pfsense/client.js";
import { PfSenseProvider } from "./pfsense/provider.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const apiKey = await loadApiKey(config.PFSENSE_API_KEY_FILE);
const credentialKey = await loadCredentialEncryptionKey(config.PFSENSE_CREDENTIALS_KEY_FILE);
const pool = createPool(config);

await migrate(pool);

const client = new PfSenseClient(config, apiKey);
const provider = new PfSenseProvider(client, config, pool, credentialKey);
await provider.ensureDevice();

const app = buildApp({ config, pool, provider });

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info("pfSense Hub Manager API started");
} catch (error) {
  app.log.error(error);
  await client.close();
  await pool.end();
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await client.close();
  await pool.end();
};

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { loadCredentialEncryptionKey } from "./auth/credential-crypto.js";
import { PfSenseProvider } from "./pfsense/provider.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const credentialKey = await loadCredentialEncryptionKey(config.PFSENSE_CREDENTIALS_KEY_FILE);
const pool = createPool(config);

await migrate(pool);

const provider = new PfSenseProvider(config, pool, credentialKey);

const app = buildApp({ config, pool, provider });

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info("pfSense Hub Manager API started");
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", () => void shutdown().then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().then(() => process.exit(0)));

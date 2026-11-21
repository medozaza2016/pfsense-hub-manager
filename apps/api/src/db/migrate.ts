import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import pg from "pg";

const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../migrations/", import.meta.url));

export async function migrate(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [741928361]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now(),
        checksum text
      )
    `);
    await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");

    const files = (await readdir(MIGRATIONS_DIRECTORY))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file))
      .sort((a, b) => a.localeCompare(b, "en"));

    for (const file of files) {
      const version = file.slice(0, -4);
      const sql = await readFile(new URL(file, `file://${MIGRATIONS_DIRECTORY.replace(/\\/g, "/")}/`), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string | null }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [version]
      );

      if (existing.rowCount) {
        const recorded = existing.rows[0]?.checksum;
        if (recorded && recorded !== checksum) {
          throw new Error(`Migration ${version} checksum mismatch. Applied migrations must not be edited.`);
        }
        if (!recorded) {
          if (version !== "001_initial") {
            throw new Error(`Migration ${version} has no checksum and cannot be safely adopted.`);
          }
          await client.query("UPDATE schema_migrations SET checksum = $1 WHERE version = $2", [checksum, version]);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version, checksum) VALUES($1, $2) ON CONFLICT(version) DO UPDATE SET checksum = EXCLUDED.checksum",
          [version, checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock($1)", [741928361]); }
    finally { client.release(); }
  }
}

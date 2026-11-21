import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

export async function migrate(pool: pg.Pool): Promise<void> {
  const files = ["001_initial.sql", "002_manager_users.sql"];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of files) {
      const path = fileURLToPath(new URL("../../migrations/" + file, import.meta.url));
      await client.query(await readFile(path, "utf8"));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

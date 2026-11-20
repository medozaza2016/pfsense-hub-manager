import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const migrationPath = fileURLToPath(new URL("../../migrations/001_initial.sql", import.meta.url));
try {
  const sql = await readFile(path.resolve(migrationPath), "utf8");
  await pool.query("BEGIN");
  await pool.query(sql);
  await pool.query("COMMIT");
  console.log("Database migration 001 applied.");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}

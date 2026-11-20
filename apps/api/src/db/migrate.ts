import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
export async function migrate(pool:pg.Pool):Promise<void>{
 const path=fileURLToPath(new URL("../../migrations/001_initial.sql",import.meta.url));
 const sql=await readFile(path,"utf8");
 const client=await pool.connect();
 try { await client.query("BEGIN"); await client.query(sql); await client.query("COMMIT"); }
 catch(error){await client.query("ROLLBACK");throw error;}
 finally{client.release();}
}

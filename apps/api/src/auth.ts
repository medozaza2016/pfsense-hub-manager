import { createHash, pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type pg from "pg";

const pbkdf2 = promisify(pbkdf2Callback);
const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_BYTES = 64;
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface AdminUser {
  id: string;
  username: string;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, PASSWORD_ITERATIONS, PASSWORD_BYTES, "sha512");
  return { hash: Buffer.from(derived).toString("hex"), salt: salt.toString("hex"), iterations: PASSWORD_ITERATIONS };
}

export async function verifyPassword(password: string, hash: string, salt: string, iterations: number): Promise<boolean> {
  if (!Number.isSafeInteger(iterations) || iterations < PASSWORD_ITERATIONS || iterations > 2_000_000) return false;
  if (!/^[0-9a-f]{128}$/i.test(hash) || !/^[0-9a-f]{32}$/i.test(salt)) return false;
  const derived = Buffer.from(await pbkdf2(password, Buffer.from(salt, "hex"), iterations, PASSWORD_BYTES, "sha512"));
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(pool: pg.Pool, adminUserId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await pool.query("DELETE FROM admin_sessions WHERE expires_at <= now()");
  await pool.query(
    "INSERT INTO admin_sessions(token_hash, admin_user_id, expires_at) VALUES($1, $2, $3)",
    [hashSessionToken(token), adminUserId, expiresAt]
  );
  return { token, expiresAt };
}

export async function findSession(pool: pg.Pool, token: string): Promise<AdminUser | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const result = await pool.query<AdminUser>(
    `SELECT u.id, u.username
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashSessionToken(token)]
  );
  if (!result.rowCount) return null;
  await pool.query("UPDATE admin_sessions SET last_seen_at = now() WHERE token_hash = $1", [hashSessionToken(token)]);
  return result.rows[0] ?? null;
}

export async function deleteSession(pool: pg.Pool, token: string): Promise<void> {
  await pool.query("DELETE FROM admin_sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

export type EncryptedSecret = { ciphertext: string; iv: string; tag: string };

export async function loadCredentialEncryptionKey(path: string): Promise<Buffer> {
  const value = (await readFile(path, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error("The device credential encryption key must contain exactly 64 hexadecimal characters.");
  }
  return Buffer.from(value, "hex");
}

export function encryptSecret(plaintext: string, key: Buffer): EncryptedSecret {
  if (key.length !== 32) throw new Error("Device credential encryption key must be 32 bytes.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptSecret(secret: EncryptedSecret, key: Buffer): string {
  if (key.length !== 32) throw new Error("Device credential encryption key must be 32 bytes.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

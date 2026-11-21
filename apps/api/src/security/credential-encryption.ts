import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const FORMAT_VERSION = 1 as const;
const AAD = Buffer.from("pfsense-hub-manager:credential:v1", "utf8");

export interface EncryptedCredential {
  version: typeof FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  nonce: string;
  authTag: string;
  ciphertext: string;
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Credential encryption requires a 32-byte application key.");
  }
}

export function encryptCredential(plaintext: string, key: Buffer): EncryptedCredential {
  assertKey(key);
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Credential plaintext must be a non-empty string.");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    nonce: nonce.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex")
  };
}

export function decryptCredential(envelope: EncryptedCredential, key: Buffer): string {
  assertKey(key);
  if (
    !envelope ||
    envelope.version !== FORMAT_VERSION ||
    envelope.algorithm !== ALGORITHM ||
    !/^[0-9a-f]{24}$/i.test(envelope.nonce) ||
    !/^[0-9a-f]{32}$/i.test(envelope.authTag) ||
    !/^(?:[0-9a-f]{2})+$/i.test(envelope.ciphertext)
  ) {
    throw new Error("Encrypted credential envelope is malformed or unsupported.");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.nonce, "hex"), { authTagLength: 16 });
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.authTag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "hex")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Credential decryption failed authentication.");
  }
}

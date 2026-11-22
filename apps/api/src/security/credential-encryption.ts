import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const LEGACY_FORMAT_VERSION = 1 as const;
const DEVICE_FORMAT_VERSION = 2 as const;
const DEVICE_TLS_TRUST_FORMAT_VERSION = 3 as const;
const LEGACY_AAD = Buffer.from("pfsense-hub-manager:credential:v1", "utf8");

export interface EncryptedCredential {
  version: typeof LEGACY_FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  nonce: string;
  authTag: string;
  ciphertext: string;
}

export interface EncryptedDeviceCredential {
  version: typeof DEVICE_FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  nonce: string;
  authTag: string;
  ciphertext: string;
}

export interface EncryptedDeviceTlsTrust {
  version: typeof DEVICE_TLS_TRUST_FORMAT_VERSION;
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

function assertPlaintext(plaintext: string): void {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Credential plaintext must be a non-empty string.");
  }
}

function assertDeviceId(deviceId: string): void {
  if (typeof deviceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) {
    throw new Error("A valid device UUID is required for device-bound credential encryption.");
  }
}

function assertEnvelope(envelope: { version: number; algorithm: string; nonce: string; authTag: string; ciphertext: string }, version: number): void {
  if (
    !envelope ||
    envelope.version !== version ||
    envelope.algorithm !== ALGORITHM ||
    !/^[0-9a-f]{24}$/i.test(envelope.nonce) ||
    !/^[0-9a-f]{32}$/i.test(envelope.authTag) ||
    !/^(?:[0-9a-f]{2})+$/i.test(envelope.ciphertext)
  ) {
    throw new Error("Encrypted credential envelope is malformed or unsupported.");
  }
}

function encryptWithAad(plaintext: string, key: Buffer, aad: Buffer, version: 1 | 2 | 3): EncryptedCredential | EncryptedDeviceCredential | EncryptedDeviceTlsTrust {
  assertKey(key);
  assertPlaintext(plaintext);
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version,
    algorithm: ALGORITHM,
    nonce: nonce.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("hex")
  };
}

function decryptWithAad(
  envelope: { version: number; algorithm: string; nonce: string; authTag: string; ciphertext: string },
  key: Buffer,
  aad: Buffer,
  version: 1 | 2 | 3
): string {
  assertKey(key);
  assertEnvelope(envelope, version);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.nonce, "hex"), { authTagLength: 16 });
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(envelope.authTag, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "hex")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("Credential decryption failed authentication.");
  }
}

/**
 * Legacy format retained only so credentials encrypted before device binding
 * remain readable during migration. New credentials must use the v2 helpers.
 */
export function encryptCredential(plaintext: string, key: Buffer): EncryptedCredential {
  return encryptWithAad(plaintext, key, LEGACY_AAD, LEGACY_FORMAT_VERSION) as EncryptedCredential;
}

export function decryptCredential(envelope: EncryptedCredential, key: Buffer): string {
  return decryptWithAad(envelope, key, LEGACY_AAD, LEGACY_FORMAT_VERSION);
}

function deviceAad(deviceId: string): Buffer {
  assertDeviceId(deviceId);
  return Buffer.from(`pfsense-hub-manager:credential:v2:${deviceId.toLowerCase()}:api-key`, "utf8");
}

export function encryptDeviceCredential(plaintext: string, key: Buffer, deviceId: string): EncryptedDeviceCredential {
  const aad = Buffer.from(`pfsense-hub-manager:credential:v2:${deviceId.toLowerCase()}:api-key`, "utf8");
  assertDeviceId(deviceId);
  return encryptWithAad(plaintext, key, aad, DEVICE_FORMAT_VERSION) as EncryptedDeviceCredential;
}

export function decryptDeviceCredential(envelope: EncryptedDeviceCredential, key: Buffer, deviceId: string): string {
  const aad = Buffer.from(`pfsense-hub-manager:credential:v2:${deviceId.toLowerCase()}:api-key`, "utf8");
  assertDeviceId(deviceId);
  return decryptWithAad(envelope, key, aad, DEVICE_FORMAT_VERSION);
}

function deviceTlsTrustAad(deviceId: string): Buffer {
  assertDeviceId(deviceId);
  return Buffer.from(`pfsense-hub-manager:credential:v3:${deviceId.toLowerCase()}:tls-ca`, "utf8");
}

export function encryptDeviceTlsTrust(plaintext: string, key: Buffer, deviceId: string): EncryptedDeviceTlsTrust {
  return encryptWithAad(plaintext, key, deviceTlsTrustAad(deviceId), DEVICE_TLS_TRUST_FORMAT_VERSION) as EncryptedDeviceTlsTrust;
}

export function decryptDeviceTlsTrust(envelope: EncryptedDeviceTlsTrust, key: Buffer, deviceId: string): string {
  return decryptWithAad(envelope, key, deviceTlsTrustAad(deviceId), DEVICE_TLS_TRUST_FORMAT_VERSION);
}

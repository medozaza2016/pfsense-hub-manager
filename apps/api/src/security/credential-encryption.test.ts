import { describe, expect, it } from "vitest";
import {
  decryptCredential,
  decryptDeviceCredential,
  encryptCredential,
  encryptDeviceCredential
} from "./credential-encryption.js";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const deviceA = "11111111-1111-4111-8111-111111111111";
const deviceB = "22222222-2222-4222-8222-222222222222";

describe("credential encryption", () => {
  it("round-trips legacy AES-256-GCM credentials for migration compatibility", () => {
    const encrypted = encryptCredential("example-api-token", key);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.version).toBe(1);
    expect(decryptCredential(encrypted, key)).toBe("example-api-token");
  });

  it("round-trips device-bound AES-256-GCM credentials", () => {
    const encrypted = encryptDeviceCredential("device-api-token", key, deviceA);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.version).toBe(2);
    expect(decryptDeviceCredential(encrypted, key, deviceA)).toBe("device-api-token");
  });

  it("does not allow a credential to be decrypted for another device", () => {
    const encrypted = encryptDeviceCredential("device-api-token", key, deviceA);
    expect(() => decryptDeviceCredential(encrypted, key, deviceB)).toThrow(/authentication/);
  });

  it("uses a fresh nonce for each encryption", () => {
    const first = encryptDeviceCredential("same-secret", key, deviceA);
    const second = encryptDeviceCredential("same-secret", key, deviceA);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const encrypted = encryptDeviceCredential("example-api-token", key, deviceA);
    const replacement = encrypted.ciphertext.slice(0, 2).toLowerCase() === "ff" ? "00" : "ff";
    const tampered = { ...encrypted, ciphertext: replacement + encrypted.ciphertext.slice(2) };
    expect(() => decryptDeviceCredential(tampered, key, deviceA)).toThrow(/authentication/);
    expect(() => decryptDeviceCredential(encrypted, Buffer.alloc(32, 7), deviceA)).toThrow(/authentication/);
  });

  it("rejects malformed envelopes, invalid device IDs, and invalid key sizes", () => {
    const encrypted = encryptDeviceCredential("example-api-token", key, deviceA);
    expect(() => decryptDeviceCredential({ ...encrypted, version: 1 } as never, key, deviceA)).toThrow(/malformed/);
    expect(() => encryptDeviceCredential("secret", key, "not-a-uuid")).toThrow(/UUID/);
    expect(() => encryptCredential("secret", Buffer.alloc(16))).toThrow(/32-byte/);
    expect(() => encryptDeviceCredential("", key, deviceA)).toThrow(/non-empty/);
  });
});

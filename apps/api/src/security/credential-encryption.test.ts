import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "./credential-encryption.js";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");

describe("credential encryption", () => {
  it("round-trips credentials with AES-256-GCM", () => {
    const encrypted = encryptCredential("example-api-token", key);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.version).toBe(1);
    expect(decryptCredential(encrypted, key)).toBe("example-api-token");
  });

  it("uses a fresh nonce for each encryption", () => {
    const first = encryptCredential("same-secret", key);
    const second = encryptCredential("same-secret", key);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const encrypted = encryptCredential("example-api-token", key);
    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.replace(/^../, "ff") };
    expect(() => decryptCredential(tampered, key)).toThrow(/authentication/);
    expect(() => decryptCredential(encrypted, Buffer.alloc(32, 7))).toThrow(/authentication/);
  });

  it("rejects malformed envelopes and invalid key sizes", () => {
    const encrypted = encryptCredential("example-api-token", key);
    expect(() => decryptCredential({ ...encrypted, version: 2 } as never, key)).toThrow(/malformed/);
    expect(() => encryptCredential("secret", Buffer.alloc(16))).toThrow(/32-byte/);
    expect(() => encryptCredential("", key)).toThrow(/non-empty/);
  });
});

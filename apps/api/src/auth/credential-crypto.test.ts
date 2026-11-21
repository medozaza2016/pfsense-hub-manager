import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./credential-crypto.js";

describe("firewall credential encryption", () => {
  const key = Buffer.alloc(32, 7);

  it("encrypts and decrypts an API key", () => {
    const encrypted = encryptSecret("read-only-api-key", key);
    expect(decryptSecret(encrypted, key)).toBe("read-only-api-key");
    expect(encrypted.ciphertext).not.toContain("read-only-api-key");
  });

  it("uses a unique IV for each encryption", () => {
    const first = encryptSecret("same-secret", key);
    const second = encryptSecret("same-secret", key);
    expect(first.iv).not.toBe(second.iv);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("read-only-api-key", key);
    const tampered = { ...encrypted, ciphertext: Buffer.from("tampered").toString("base64") };
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("rejects an invalid encryption key size", () => {
    expect(() => encryptSecret("secret", Buffer.alloc(16))).toThrow();
  });
});

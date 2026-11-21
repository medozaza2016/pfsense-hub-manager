import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionToken, hashSessionToken, readSessionToken, SESSION_COOKIE } from "./session.js";

describe("manager password hashing", () => {
  it("verifies the original password and rejects an incorrect password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(encoded.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", encoded)).resolves.toBe(false);
  });

  it("uses a fresh salt for each password hash", async () => {
    const first = await hashPassword("same password for test");
    const second = await hashPassword("same password for test");
    expect(first).not.toBe(second);
  });
});

describe("manager session token helpers", () => {
  it("generates opaque tokens and reads them from the session cookie", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
    expect(readSessionToken(`${SESSION_COOKIE}=${token}; Path=/; HttpOnly`)).toBe(token);
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("rejects malformed or absent cookies", () => {
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken("other=value")).toBeNull();
    expect(readSessionToken(`${SESSION_COOKIE}=not-a-valid-token`)).toBeNull();
  });
});

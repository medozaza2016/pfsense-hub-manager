import { describe, expect, it } from "vitest";
import { authorizationFailure, hashPassword, hashSessionToken, verifyPassword, type AdminUser } from "./auth.js";

describe("administrator authentication primitives", () => {
  it("hashes passwords with a unique salt and verifies the original password", async () => {
    const first = await hashPassword("a-long-test-password-123");
    const second = await hashPassword("a-long-test-password-123");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    expect(first.iterations).toBeGreaterThanOrEqual(310000);
    await expect(verifyPassword("a-long-test-password-123", first.hash, first.salt, first.iterations)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", first.hash, first.salt, first.iterations)).resolves.toBe(false);
  });

  it("stores only a deterministic one-way hash of session tokens", () => {
    const token = "test-session-token";
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("rejects malformed password hash metadata", async () => {
    await expect(verifyPassword("password", "bad", "bad", 1)).resolves.toBe(false);
  });
});


describe("manager role authorization", () => {
  const admin: AdminUser = { id: "admin-id", username: "owner", role: "admin" };
  const regularUser: AdminUser = { id: "user-id", username: "operator", role: "user" };

  it("allows an administrator", () => {
    expect(authorizationFailure(admin)).toBeNull();
  });

  it("returns 403 for an authenticated regular user", () => {
    expect(authorizationFailure(regularUser)).toBe(403);
  });

  it("returns 401 when no authenticated user is present", () => {
    expect(authorizationFailure(null)).toBe(401);
  });
});

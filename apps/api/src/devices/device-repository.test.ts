import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { encryptDeviceCredential } from "../security/credential-encryption.js";
import {
  createDeviceSchema,
  DeviceRepository,
  updateDeviceProfileSchema
} from "./device-repository.js";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const validInput = {
  name: "Main Office",
  location: "New Jersey",
  edition: "ce" as const,
  apiBaseUrl: "https://192.168.10.1",
  apiKey: "sensitive-firewall-api-key"
};

function makePoolClient(query: ReturnType<typeof vi.fn>) {
  return {
    query,
    release: vi.fn()
  } as unknown as PoolClient & { release: ReturnType<typeof vi.fn> };
}

describe("managed device profile validation", () => {
  it("normalizes HTTPS origins and trims profile fields", () => {
    const parsed = createDeviceSchema.parse({
      ...validInput,
      name: "  Main Office  ",
      location: "  New Jersey  ",
      apiBaseUrl: "https://192.168.10.1/"
    });
    expect(parsed.name).toBe("Main Office");
    expect(parsed.location).toBe("New Jersey");
    expect(parsed.apiBaseUrl).toBe("https://192.168.10.1");
  });

  it.each([
    "http://192.168.10.1",
    "https://user:pass@192.168.10.1",
    "https://192.168.10.1/api/v2",
    "https://192.168.10.1?token=x",
    "https://localhost",
    "https://router.localhost",
    "https://127.0.0.2",
    "https://[::1]",
    "https://192.168.10.1?",
    "https://192.168.10.1#"
  ])("rejects unsafe or non-origin URL %s", apiBaseUrl => {
    expect(createDeviceSchema.safeParse({ ...validInput, apiBaseUrl }).success).toBe(false);
  });

  it("keeps credentials out of profile update input", () => {
    expect(updateDeviceProfileSchema.safeParse({ ...validInput, apiKey: "should-not-be-accepted" }).success).toBe(false);
  });
});

describe("DeviceRepository", () => {
  it("persists a profile and encrypted credential in one transaction", async () => {
    const insertedRow = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main Office",
      location: "New Jersey",
      edition: "ce",
      api_base_url: "https://192.168.10.1",
      enabled: true,
      is_demo: false,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z")
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [insertedRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    const profile = await repository.create(validInput);

    expect(profile).toMatchObject({
      id: insertedRow.id,
      name: "Main Office",
      edition: "ce",
      apiBaseUrl: "https://192.168.10.1",
      enabled: true,
      isDemo: false
    });
    expect(query.mock.calls.map(call => String(call[0]).trim().split(/\\s+/)[0])).toEqual([
      "BEGIN", "INSERT", "INSERT", "COMMIT"
    ]);
    const credentialInsert = query.mock.calls[2];
    const parameters = credentialInsert?.[1] as unknown[];
    expect(parameters).not.toContain(validInput.apiKey);
    expect(parameters?.[1]).toBe(2);
    expect(parameters?.[2]).toBeInstanceOf(Buffer);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back profile creation if credential persistence fails", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111" }], rowCount: 1 })
      .mockRejectedValueOnce(new Error("database write failed"))
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.create(validInput)).rejects.toThrow("database write failed");
    expect(query.mock.calls[3]?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("decrypts a stored credential only with its bound device identity", async () => {
    const deviceId = "11111111-1111-4111-8111-111111111111";
    const encrypted = encryptDeviceCredential("stored-api-key", key, deviceId);
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{
        format_version: 2,
        key_version: 1,
        nonce: Buffer.from(encrypted.nonce, "hex"),
        auth_tag: Buffer.from(encrypted.authTag, "hex"),
        ciphertext: Buffer.from(encrypted.ciphertext, "hex")
      }],
      rowCount: 1
    });
    const pool = { query } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.decryptApiKeyForConnection(deviceId)).resolves.toBe("stored-api-key");
    expect(query.mock.calls[0]?.[1]).toEqual([deviceId]);
  });

  it("returns no credential when the device is missing or disabled", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.decryptApiKeyForConnection("11111111-1111-4111-8111-111111111111")).resolves.toBeNull();
  });
});

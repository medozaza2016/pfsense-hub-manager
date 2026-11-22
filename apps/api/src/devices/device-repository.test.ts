import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { encryptDeviceCredential, encryptDeviceTlsTrust } from "../security/credential-encryption.js";
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
  apiKey: "sensitive-firewall-api-key",
  tlsServername: null
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
    "https://169.254.169.254",
    "https://[fe80::1]",
    "https://[::1]",
    "https://192.168.10.1?",
    "https://192.168.10.1#"
  ])("rejects unsafe or non-origin URL %s", apiBaseUrl => {
    expect(createDeviceSchema.safeParse({ ...validInput, apiBaseUrl }).success).toBe(false);
  });

  it("accepts Tailscale shared IPv4 overlay addresses", () => {
    expect(createDeviceSchema.safeParse({ ...validInput, apiBaseUrl: "https://100.64.0.1" }).success).toBe(true);
  });

  it("rejects malformed TLS server names", () => {
    expect(createDeviceSchema.safeParse({ ...validInput, tlsServername: "bad host name" }).success).toBe(false);
    expect(createDeviceSchema.safeParse({ ...validInput, tlsServername: "firewall.example.test" }).success).toBe(true);
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
      tls_servername: null,
      enabled: true,
      is_demo: false,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z")
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [insertedRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    const profile = await repository.create(validInput, 0);

    expect(profile).toMatchObject({
      id: insertedRow.id,
      name: "Main Office",
      edition: "ce",
      apiBaseUrl: "https://192.168.10.1",
      enabled: true,
      isDemo: false
    });
    expect(query.mock.calls.map(call => String(call[0]).trim().split(/\s+/)[0])).toEqual([
      "BEGIN", "INSERT", "INSERT", "INSERT", "COMMIT"
    ]);
    expect(String(query.mock.calls[3]?.[0])).toContain("poll_runs");
    const credentialInsert = query.mock.calls[2];
    const parameters = credentialInsert?.[1] as unknown[];
    expect(parameters).not.toContain(validInput.apiKey);
    expect(parameters?.[1]).toBe(2);
    expect(parameters?.[2]).toBeInstanceOf(Buffer);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("persists TLS server identity and encrypted custom CA trust atomically", async () => {
    const certificate = readFileSync(new URL("../pfsense/fixtures/firewall-test-cert.pem", import.meta.url), "utf8");
    const insertedRow = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Main Office",
      location: "New Jersey",
      edition: "ce",
      api_base_url: "https://192.168.10.1",
      tls_servername: "firewall.example.test",
      enabled: true,
      is_demo: false,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z")
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [insertedRow], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    const result = await repository.create({
      ...validInput,
      tlsServername: "firewall.example.test",
      certificateAuthority: certificate
    }, 0);
    expect(result.tlsServername).toBe("firewall.example.test");
    expect(query.mock.calls.map(call => String(call[0]).trim().split(/\s+/)[0])).toEqual([
      "BEGIN", "INSERT", "INSERT", "INSERT", "INSERT", "COMMIT"
    ]);
    expect(String(query.mock.calls[3]?.[0])).toContain("device_tls_trust");
    expect(String(query.mock.calls[4]?.[0])).toContain("poll_runs");
    expect(query.mock.calls[3]?.[1]).not.toContain(certificate);
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

    await expect(repository.create(validInput, 0)).rejects.toThrow("database write failed");
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


describe("DeviceRepository per-device TLS trust", () => {
  const deviceId = "11111111-1111-4111-8111-111111111111";
  const certificate = readFileSync(new URL("../pfsense/fixtures/firewall-test-cert.pem", import.meta.url), "utf8");

  it("stores custom trust material encrypted and bound to the device", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ id: deviceId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.setDeviceCaBundle(deviceId, certificate)).resolves.toBe(true);
    expect(query.mock.calls.map(call => String(call[0]).trim().split(/\s+/)[0])).toEqual([
      "BEGIN", "SELECT", "INSERT", "COMMIT"
    ]);
    const params = query.mock.calls[2]?.[1] as unknown[];
    expect(params).not.toContain(certificate);
    expect(params?.[1]).toBe(3);
    expect(params?.[2]).toBeInstanceOf(Buffer);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("removes custom trust to restore system certificate trust", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [{ id: deviceId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.setDeviceCaBundle(deviceId, null)).resolves.toBe(true);
    expect(String(query.mock.calls[2]?.[0])).toContain("DELETE FROM device_tls_trust");
  });

  it("does not modify trust for missing or demo devices", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.setDeviceCaBundle(deviceId, certificate)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[2]?.[0])).toBe("COMMIT");
  });

  it("decrypts custom trust only for an enabled real device", async () => {
    const encrypted = encryptDeviceTlsTrust(certificate, key, deviceId);
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{
        format_version: 3,
        key_version: 1,
        nonce: Buffer.from(encrypted.nonce, "hex"),
        auth_tag: Buffer.from(encrypted.authTag, "hex"),
        ciphertext: Buffer.from(encrypted.ciphertext, "hex")
      }],
      rowCount: 1
    });
    const pool = { query } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    const result = await repository.decryptDeviceCaBundle(deviceId);
    expect(result).toContain("-----BEGIN CERTIFICATE-----");
    expect(String(query.mock.calls[0]?.[0])).toContain("d.is_demo=false AND d.enabled=true");
  });

  it("returns null when no custom trust is configured or the device is disabled", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.decryptDeviceCaBundle(deviceId)).resolves.toBeNull();
  });
});


describe("DeviceRepository legacy bootstrap", () => {
  const bootstrap = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Legacy Firewall",
    location: "Main Office",
    edition: "ce" as const,
    apiBaseUrl: "https://192.168.10.2",
    apiKey: "legacy-bootstrap-secret"
  };

  it("creates the legacy profile and encrypted credential without replacing existing credentials", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: bootstrap.id, is_demo: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.ensureBootstrapDevice(bootstrap)).resolves.toBeUndefined();
    expect(query.mock.calls.map(call => String(call[0]).trim().split(/\s+/)[0])).toEqual([
      "BEGIN", "INSERT", "SELECT", "INSERT", "COMMIT"
    ]);
    expect(String(query.mock.calls[1]?.[0])).toContain("ON CONFLICT(id) DO NOTHING");
    expect(String(query.mock.calls[3]?.[0])).toContain("ON CONFLICT(device_id) DO NOTHING");
    expect(query.mock.calls[3]?.[1]).not.toContain(bootstrap.apiKey);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("refuses a bootstrap ID that belongs to a demo device", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: bootstrap.id, is_demo: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.ensureBootstrapDevice(bootstrap)).rejects.toThrow("conflicts with a demo");
    expect(query.mock.calls[3]?.[0]).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("preserves the legacy unknown edition value", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: bootstrap.id, is_demo: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    const client = makePoolClient(query);
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const repository = new DeviceRepository(pool, key);

    await expect(repository.ensureBootstrapDevice({ ...bootstrap, edition: "unknown" })).resolves.toBeUndefined();
    expect(query.mock.calls[1]?.[1]).toEqual([
      bootstrap.id, bootstrap.name, bootstrap.location, "unknown", bootstrap.apiBaseUrl
    ]);
  });

});

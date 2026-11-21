import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { AppConfig } from "../config.js";
import { decryptSecret } from "../auth/credential-crypto.js";
import { PfSenseProvider, type FirewallInput } from "./provider.js";

const { getMock, closeMock, constructorMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  closeMock: vi.fn(),
  constructorMock: vi.fn()
}));

vi.mock("./client.js", () => ({
  PfSenseClient: class {
    get = getMock;
    close = closeMock;
    constructor(...args: unknown[]) { constructorMock(...args); }
  }
}));

const primaryDeviceId = "00000000-0000-4000-8000-000000000001";
const config: AppConfig = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3000,
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  PFSENSE_DEVICE_ID: primaryDeviceId,
  PFSENSE_DEVICE_NAME: "Primary firewall",
  PFSENSE_DEVICE_LOCATION: "Main site",
  PFSENSE_EDITION: "plus",
  PFSENSE_API_BASE_URL: "https://primary.example.test:10443",
  PFSENSE_API_KEY_FILE: "./secret",
  PFSENSE_CREDENTIALS_KEY_FILE: "./credentials-key",
  PFSENSE_API_TIMEOUT_MS: 10000
};

const encryptionKey = Buffer.alloc(32, 7);
const input: FirewallInput = {
  name: "Branch firewall",
  location: "Branch office",
  edition: "ce",
  apiBaseUrl: "https://branch.example.test:10443",
  apiKey: "branch-read-only-api-key"
};

describe("pfSense provider device registration and credential safety", () => {
  let query: ReturnType<typeof vi.fn>;
  let pool: Pool;
  let provider: PfSenseProvider;

  beforeEach(() => {
    getMock.mockReset();
    closeMock.mockReset().mockResolvedValue(undefined);
    constructorMock.mockReset();
    query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    pool = { query } as unknown as Pool;
    provider = new PfSenseProvider({} as never, config, pool, encryptionKey);
  });

  it("tests connectivity before saving a device and stores only encrypted API credentials", async () => {
    getMock
      .mockResolvedValueOnce({ data: { version: "2.8.1" } })
      .mockResolvedValueOnce({ data: { status: "ok" } });

    const result = await provider.registerDevice(input);

    expect(getMock).toHaveBeenNthCalledWith(1, "version");
    expect(getMock).toHaveBeenNthCalledWith(2, "system");
    expect(closeMock).toHaveBeenCalledOnce();
    expect(constructorMock).toHaveBeenCalledWith(config, input.apiKey, {
      baseUrl: input.apiBaseUrl,
      caCertificatePem: null,
      tlsServername: null
    });
    expect(query).toHaveBeenCalledOnce();

    const [statement, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(statement).toContain("INSERT INTO managed_devices");
    expect(statement).toContain("api_key_ciphertext");
    expect(values).not.toContain(input.apiKey);

    const encrypted = {
      ciphertext: String(values[5]),
      iv: String(values[6]),
      tag: String(values[7])
    };
    expect(encrypted.ciphertext).not.toBe(input.apiKey);
    expect(decryptSecret(encrypted, encryptionKey)).toBe(input.apiKey);

    expect(result.device).toMatchObject({
      name: input.name,
      location: input.location,
      edition: input.edition,
      enabled: true
    });
    expect(JSON.stringify(result)).not.toContain(input.apiKey);
    expect(JSON.stringify(result)).not.toContain(encrypted.ciphertext);
  });

  it("does not save a device when the firewall connection test fails", async () => {
    getMock.mockRejectedValueOnce(new Error("Firewall authentication failed"));

    await expect(provider.registerDevice(input)).rejects.toThrow("Firewall authentication failed");

    expect(query).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("rejects an empty or malformed API key before contacting the firewall", async () => {
    await expect(provider.registerDevice({ ...input, apiKey: "  " })).rejects.toThrow("Enter a valid pfSense API key.");

    expect(getMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it("does not save a device when TLS verification fails", async () => {
    getMock.mockRejectedValueOnce(new Error("Firewall TLS verification failed."));

    await expect(provider.registerDevice(input)).rejects.toThrow("Firewall TLS verification failed.");

    expect(query).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("rejects non-HTTPS firewall URLs before contacting the firewall", async () => {
    await expect(provider.registerDevice({ ...input, apiBaseUrl: "http://branch.example.test" })).rejects.toThrow(/HTTPS origin/);

    expect(getMock).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("tests replacement credentials before encrypting and saving them", async () => {
    query.mockResolvedValueOnce({
      rows: [{ api_base_url: input.apiBaseUrl, ca_certificate_pem: null, tls_servername: null }],
      rowCount: 1
    });
    getMock
      .mockResolvedValueOnce({ data: { version: "2.8.1" } })
      .mockResolvedValueOnce({ data: { status: "ok" } });
    const replacement = {
      apiKey: "replacement-read-only-api-key",
      caCertificatePem: "-----BEGIN CERTIFICATE-----\\ntest-ca\\n-----END CERTIFICATE-----",
      tlsServername: "branch.example.test"
    };

    const result = await provider.updateDeviceCredentials("branch-device-id", replacement);

    expect(getMock).toHaveBeenNthCalledWith(1, "version");
    expect(getMock).toHaveBeenNthCalledWith(2, "system");
    expect(closeMock).toHaveBeenCalledOnce();
    expect(constructorMock).toHaveBeenCalledWith(config, replacement.apiKey, {
      baseUrl: input.apiBaseUrl,
      caCertificatePem: replacement.caCertificatePem,
      tlsServername: replacement.tlsServername
    });
    expect(query).toHaveBeenCalledTimes(2);
    const [statement, values] = query.mock.calls[1] as unknown as [string, unknown[]];
    expect(statement).toContain("UPDATE managed_devices");
    expect(values).not.toContain(replacement.apiKey);
    expect(decryptSecret({ ciphertext: String(values[0]), iv: String(values[1]), tag: String(values[2]) }, encryptionKey)).toBe(replacement.apiKey);
    expect(values[3]).toBe(replacement.caCertificatePem);
    expect(values[4]).toBe(replacement.tlsServername);
    expect(result).toMatchObject({ deviceId: "branch-device-id", connection: { reachable: true } });
    expect(JSON.stringify(result)).not.toContain(replacement.apiKey);
  });

  it("does not replace stored credentials when the new connection or TLS verification fails", async () => {
    query.mockResolvedValueOnce({
      rows: [{ api_base_url: input.apiBaseUrl, ca_certificate_pem: null, tls_servername: null }],
      rowCount: 1
    });
    getMock.mockRejectedValueOnce(new Error("Firewall TLS verification failed."));

    await expect(provider.updateDeviceCredentials("branch-device-id", {
      apiKey: "replacement-read-only-api-key",
      caCertificatePem: "-----BEGIN CERTIFICATE-----\\ntest-ca\\n-----END CERTIFICATE-----"
    })).rejects.toThrow("Firewall TLS verification failed.");

    expect(query).toHaveBeenCalledOnce();
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it("does not rotate primary firewall credentials through the device workflow", async () => {
    await expect(provider.updateDeviceCredentials(primaryDeviceId, {
      apiKey: "replacement-read-only-api-key"
    })).rejects.toThrow("Primary firewall credentials are managed by the installation secrets");
    expect(query).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("returns not found without testing credentials for an unknown device", async () => {
    await expect(provider.updateDeviceCredentials("missing-device", {
      apiKey: "replacement-read-only-api-key"
    })).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
    expect(getMock).not.toHaveBeenCalled();
  });

  it("returns only inventory fields and never selects stored credentials", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: "branch-device-id",
        name: "Branch firewall",
        location: "Branch office",
        edition: "ce",
        enabled: true
      }],
      rowCount: 1
    });

    const devices = await provider.listDevices();
    const statement = query.mock.calls[0]?.[0] as string;

    expect(statement).toContain("SELECT id,name,location,edition,enabled");
    expect(statement).not.toContain("api_key");
    expect(JSON.stringify(devices)).not.toMatch(/ciphertext|apiKey|api_key|secret/i);
    expect(devices[0]).toMatchObject({
      id: "branch-device-id",
      name: "Branch firewall",
      canDelete: true
    });
  });

  it("protects the primary firewall from deletion without querying the database", async () => {
    await expect(provider.deleteDevice(primaryDeviceId)).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("allows deletion of a non-primary firewall when the database deletes it", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: "branch-device-id" }], rowCount: 1 });

    await expect(provider.deleteDevice("branch-device-id")).resolves.toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });
});

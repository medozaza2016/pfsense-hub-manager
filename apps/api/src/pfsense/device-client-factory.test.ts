import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../config.js";
import type { DeviceRepository, ManagedDeviceProfile } from "../devices/device-repository.js";
import type { PfSenseClient, PfSenseTlsTrust } from "./client.js";
import { DevicePfSenseClientFactory } from "./device-client-factory.js";

const deviceId = "11111111-1111-4111-8111-111111111111";
const apiKey = "device-specific-secret";
const certificate = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n";

const config = {
  PFSENSE_API_BASE_URL: "https://legacy-firewall.example"
} as AppConfig;

function profile(overrides: Partial<ManagedDeviceProfile> = {}): ManagedDeviceProfile {
  return {
    id: deviceId,
    name: "Branch Firewall",
    location: "Branch",
    edition: "ce",
    apiBaseUrl: "https://192.168.10.1",
    tlsServername: null,
    enabled: true,
    isDemo: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function makeRepository(overrides: Partial<{
  listProfiles: () => Promise<ManagedDeviceProfile[]>;
  decryptApiKeyForConnection: () => Promise<string | null>;
  decryptDeviceCaBundle: () => Promise<string | null>;
}> = {}) {
  return {
    listProfiles: vi.fn(overrides.listProfiles ?? (async () => [profile()])),
    decryptApiKeyForConnection: vi.fn(overrides.decryptApiKeyForConnection ?? (async () => apiKey)),
    decryptDeviceCaBundle: vi.fn(overrides.decryptDeviceCaBundle ?? (async () => null))
  } as unknown as DeviceRepository & {
    listProfiles: ReturnType<typeof vi.fn>;
    decryptApiKeyForConnection: ReturnType<typeof vi.fn>;
    decryptDeviceCaBundle: ReturnType<typeof vi.fn>;
  };
}

describe("DevicePfSenseClientFactory", () => {
  it("builds a client with the selected device origin, its credential, and its custom CA", async () => {
    const repository = makeRepository({
      decryptDeviceCaBundle: async () => certificate
    });
    const client = {} as PfSenseClient;
    const buildClient = vi.fn((_config: AppConfig, _key: string, _trust: PfSenseTlsTrust) => client);
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await expect(factory.create(deviceId)).resolves.toBe(client);
    expect(buildClient).toHaveBeenCalledOnce();
    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "custom-ca", certificateAuthority: Buffer.from(certificate, "utf8"), servername: null }
    );
    expect(repository.decryptApiKeyForConnection).toHaveBeenCalledWith(deviceId);
    expect(repository.decryptDeviceCaBundle).toHaveBeenCalledWith(deviceId);
  });

  it("preserves the legacy global CA for the configured bootstrap device when no device CA exists", async () => {
    const repository = makeRepository({ listProfiles: async () => [profile()] });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const bootstrapConfig = { ...config, PFSENSE_DEVICE_ID: deviceId } as AppConfig;
    const factory = new DevicePfSenseClientFactory(bootstrapConfig, repository, buildClient);

    await factory.create(deviceId);

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "legacy-ca-file", servername: null }
    );
  });

  it("does not apply a legacy CA when the bootstrap profile has explicit device trust", async () => {
    const repository = makeRepository({ decryptDeviceCaBundle: async () => certificate });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const bootstrapConfig = { ...config, PFSENSE_DEVICE_ID: deviceId } as AppConfig;
    const factory = new DevicePfSenseClientFactory(bootstrapConfig, repository, buildClient);

    await factory.create(deviceId);

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "custom-ca", certificateAuthority: Buffer.from(certificate, "utf8"), servername: null }
    );
  });



  it("does not use legacy CA when the bootstrap identity is incomplete", async () => {
    const incompleteBootstrapConfig = {
      ...config,
      PFSENSE_DEVICE_ID: deviceId,
      PFSENSE_DEVICE_NAME: undefined
    } as AppConfig;
    const repository = makeRepository({ listProfiles: async () => [profile()] });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const factory = new DevicePfSenseClientFactory(incompleteBootstrapConfig, repository, buildClient);

    await factory.create(deviceId);

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "system", servername: null }
    );
  });

  it("does not apply the legacy global CA to unrelated managed devices", async () => {
    const unrelatedId = "22222222-2222-4222-8222-222222222222";
    const repository = makeRepository({ listProfiles: async () => [profile({ id: unrelatedId })] });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const bootstrapConfig = { ...config, PFSENSE_DEVICE_ID: deviceId } as AppConfig;
    const factory = new DevicePfSenseClientFactory(bootstrapConfig, repository, buildClient);

    await factory.create(unrelatedId);

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "system", servername: null }
    );
  });

  it("applies the stored TLS server name when the device uses system trust", async () => {
    const repository = makeRepository({ listProfiles: async () => [profile({ tlsServername: "firewall.example.test" })] });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await factory.create(deviceId);

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "system", servername: "firewall.example.test" }
    );
  });

  it("retains the legacy CA file during temporary pre-registration when no per-device CA was supplied", async () => {
    const legacyPath = process.env.PFSENSE_CA_FILE;
    vi.stubEnv("PFSENSE_CA_FILE", "/run/certs/legacy-ca.pem");
    try {
      const repository = makeRepository();
      const client = {
        get: vi.fn(async () => ({ data: { release: "2.8.1" } })),
        close: vi.fn(async () => undefined)
      } as unknown as PfSenseClient;
      const buildClient = vi.fn(() => client);
      const bootstrapConfig = { ...config, PFSENSE_DEVICE_ID: deviceId } as AppConfig;
      const factory = new DevicePfSenseClientFactory(
        bootstrapConfig,
        repository,
        buildClient
      );

      await factory.testConnection({
        apiBaseUrl: "https://legacy-firewall.example",
        apiKey: "temporary-registration-key"
      });

      expect(buildClient).toHaveBeenCalledWith(
        expect.objectContaining({ PFSENSE_API_BASE_URL: "https://legacy-firewall.example" }),
        "temporary-registration-key",
        { mode: "legacy-ca-file", servername: null }
      );
    } finally {
      if (legacyPath === undefined) vi.unstubAllEnvs();
      else vi.stubEnv("PFSENSE_CA_FILE", legacyPath);
    }
  });

  it("tests a temporary registration profile with strict system TLS and closes the client", async () => {
    const repository = makeRepository();
    const client = {
      get: vi.fn(async () => ({ data: { version: "2.8.1" } })),
      close: vi.fn(async () => undefined)
    } as unknown as PfSenseClient;
    const buildClient = vi.fn(() => client);
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await expect(factory.testConnection({
      apiBaseUrl: "https://192.168.10.9",
      apiKey: "temporary-registration-key"
    })).resolves.toBeUndefined();

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.9" }),
      "temporary-registration-key",
      { mode: "system", servername: null }
    );
    expect(client.get).toHaveBeenCalledWith("version");
    expect(client.close).toHaveBeenCalledOnce();
    expect(repository.listProfiles).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", []],
    ["disabled", [profile({ enabled: false })]],
    ["demo", [profile({ isDemo: true })]]
  ])("does not build a client for a %s device", async (_description, profiles) => {
    const repository = makeRepository({ listProfiles: async () => profiles });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await expect(factory.create(deviceId)).resolves.toBeNull();
    expect(repository.decryptApiKeyForConnection).not.toHaveBeenCalled();
    expect(repository.decryptDeviceCaBundle).not.toHaveBeenCalled();
    expect(buildClient).not.toHaveBeenCalled();
  });

  it("does not build a client when the device credential is unavailable", async () => {
    const repository = makeRepository({
      decryptApiKeyForConnection: async () => null
    });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await expect(factory.create(deviceId)).resolves.toBeNull();
    expect(repository.decryptDeviceCaBundle).not.toHaveBeenCalled();
    expect(buildClient).not.toHaveBeenCalled();
  });

  it("fails closed when custom TLS trust cannot be decrypted", async () => {
    const repository = makeRepository({
      decryptDeviceCaBundle: async () => { throw new Error("TLS trust decryption failed"); }
    });
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await expect(factory.create(deviceId)).rejects.toThrow("TLS trust decryption failed");
    expect(buildClient).not.toHaveBeenCalled();
  });
});

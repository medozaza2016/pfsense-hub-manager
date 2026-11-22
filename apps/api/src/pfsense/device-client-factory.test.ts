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

  it("explicitly selects system trust when the device has no custom CA", async () => {
    const repository = makeRepository();
    const buildClient = vi.fn(() => ({} as PfSenseClient));
    const factory = new DevicePfSenseClientFactory(config, repository, buildClient);

    await factory.create(deviceId);

    expect(buildClient).toHaveBeenCalledWith(
      expect.objectContaining({ PFSENSE_API_BASE_URL: "https://192.168.10.1" }),
      apiKey,
      { mode: "system", servername: null }
    );
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

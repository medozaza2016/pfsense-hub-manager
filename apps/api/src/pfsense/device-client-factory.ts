import type { AppConfig } from "../config.js";
import { DeviceRepository, type ManagedDeviceProfile } from "../devices/device-repository.js";
import { PfSenseClient, type PfSenseTlsTrust } from "./client.js";
import { normalizeDeviceCaBundle } from "./tls-trust.js";

export type PfSenseClientBuilder = (
  config: AppConfig,
  apiKey: string,
  tlsTrust: PfSenseTlsTrust
) => PfSenseClient;

/**
 * Builds short-lived clients from each enabled, real device's own encrypted
 * connection material. Clients are deliberately not cached, so profile and
 * credential changes are picked up on the next connection attempt.
 */
export class DevicePfSenseClientFactory {
  constructor(
    private readonly config: AppConfig,
    private readonly devices: DeviceRepository,
    private readonly buildClient: PfSenseClientBuilder = (config, apiKey, tlsTrust) =>
      new PfSenseClient(config, apiKey, tlsTrust)
  ) {}

  async testConnection(input: {
    apiBaseUrl: string;
    apiKey: string;
    certificateAuthority?: string | undefined;
    tlsServername?: string | null;
  }): Promise<void> {
    const ca = input.certificateAuthority ? normalizeDeviceCaBundle(input.certificateAuthority) : null;
    const trust: PfSenseTlsTrust = ca === null
      ? { mode: "system", servername: input.tlsServername ?? null }
      : { mode: "custom-ca", certificateAuthority: Buffer.from(ca, "utf8"), servername: input.tlsServername ?? null };
    const testConfig: AppConfig = { ...this.config, PFSENSE_API_BASE_URL: input.apiBaseUrl };
    const client = this.buildClient(testConfig, input.apiKey, trust);
    try {
      await client.get("version");
    } finally {
      await client.close();
    }
  }

  async create(deviceId: string): Promise<PfSenseClient | null> {
    const profiles = await this.devices.listProfiles();
    const profile: ManagedDeviceProfile | undefined = profiles.find(device => device.id === deviceId);

    if (!profile || profile.isDemo || !profile.enabled) return null;

    const apiKey = await this.devices.decryptApiKeyForConnection(deviceId);
    if (!apiKey) return null;

    const caBundle = await this.devices.decryptDeviceCaBundle(deviceId);
    const legacyBootstrapDevice = this.config.PFSENSE_DEVICE_ID === profile.id && Boolean(this.config.PFSENSE_API_BASE_URL);
    const tlsTrust: PfSenseTlsTrust = caBundle === null
      ? legacyBootstrapDevice
        ? { mode: "legacy-ca-file", servername: profile.tlsServername }
        : { mode: "system", servername: profile.tlsServername }
      : { mode: "custom-ca", certificateAuthority: Buffer.from(caBundle, "utf8"), servername: profile.tlsServername };

    const deviceConfig: AppConfig = {
      ...this.config,
      PFSENSE_API_BASE_URL: profile.apiBaseUrl
    };

    return this.buildClient(deviceConfig, apiKey, tlsTrust);
  }
}

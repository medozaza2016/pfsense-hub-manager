import type { AppConfig } from "../config.js";
import { DeviceRepository, type ManagedDeviceProfile } from "../devices/device-repository.js";
import { PfSenseClient, type PfSenseTlsTrust } from "./client.js";

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

  async create(deviceId: string): Promise<PfSenseClient | null> {
    const profiles = await this.devices.listProfiles();
    const profile: ManagedDeviceProfile | undefined = profiles.find(device => device.id === deviceId);

    if (!profile || profile.isDemo || !profile.enabled) return null;

    const apiKey = await this.devices.decryptApiKeyForConnection(deviceId);
    if (!apiKey) return null;

    const caBundle = await this.devices.decryptDeviceCaBundle(deviceId);
    const tlsTrust: PfSenseTlsTrust = caBundle === null
      ? { mode: "system" }
      : { mode: "custom-ca", certificateAuthority: Buffer.from(caBundle, "utf8") };

    const deviceConfig: AppConfig = {
      ...this.config,
      PFSENSE_API_BASE_URL: profile.apiBaseUrl
    };

    return this.buildClient(deviceConfig, apiKey, tlsTrust);
  }
}

import { readFile } from "node:fs/promises";
import { Agent, fetch } from "undici";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { PfSenseApiError } from "./errors.js";

const envelopeSchema = z.object({
  code: z.number().optional(),
  status: z.string().optional(),
  response_id: z.string().optional(),
  message: z.string().optional(),
  data: z.unknown()
}).passthrough();

export type PfSenseEnvelope = z.infer<typeof envelopeSchema>;

const allowed = {
  system: { method: "GET", path: "/api/v2/status/system" },
  gateways: { method: "GET", path: "/api/v2/status/gateways" },
  interfaces: { method: "GET", path: "/api/v2/status/interfaces" },
  services: { method: "GET", path: "/api/v2/status/services" },
  version: { method: "GET", path: "/api/v2/system/version" },
  arpTable: { method: "GET", path: "/api/v2/diagnostics/arp_table" },
  firewallStates: { method: "GET", path: "/api/v2/firewall/states" },
  firewallStateSize: { method: "GET", path: "/api/v2/firewall/states/size" }
} as const;

export type PfSenseOperation = keyof typeof allowed;

export class PfSenseClient {
  private readonly baseUrl: URL;
  private readonly dispatcherPromise: Promise<Agent>;

  constructor(private readonly config: AppConfig, private readonly apiKey: string) {
    this.baseUrl = new URL(config.PFSENSE_API_BASE_URL);
    this.dispatcherPromise = this.createDispatcher();
  }

  private async createDispatcher(): Promise<Agent> {
    const caPath = process.env.PFSENSE_CA_FILE;
    if (!caPath) return new Agent({ connect: { rejectUnauthorized: true } });
    const ca = await readFile(caPath);
    return new Agent({ connect: { ca, rejectUnauthorized: true } });
  }

  async get(operation: PfSenseOperation): Promise<PfSenseEnvelope> {
    const spec = allowed[operation];
    const url = new URL(spec.path, this.baseUrl);
    const dispatcher = await this.dispatcherPromise;
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "X-API-Key": this.apiKey, "Accept": "application/json" },
        signal: AbortSignal.timeout(this.config.PFSENSE_API_TIMEOUT_MS),
        dispatcher
      });
    } catch (error) {
      if (error instanceof Error && /certificate|tls|ssl/i.test(error.message)) {
        throw new PfSenseApiError("Firewall TLS verification failed.", "tls");
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        throw new PfSenseApiError("Firewall request timed out.", "timeout");
      }
      throw new PfSenseApiError("Firewall connection failed.", "unknown");
    }
    if (response.status === 401) throw new PfSenseApiError("Firewall authentication failed.", "authentication", 401);
    if (response.status === 403) throw new PfSenseApiError("Firewall denied the requested operation.", "authorization", 403);
    if (response.status === 404) throw new PfSenseApiError("Firewall endpoint is unavailable.", "unsupported", 404);
    if (response.status === 429) throw new PfSenseApiError("Firewall API rate limit was reached.", "rate_limit", 429);
    if (!response.ok) throw new PfSenseApiError("Firewall API returned an error.", "remote_server", response.status);

    const text = await response.text();
    if (text.length > 2_000_000) throw new PfSenseApiError("Firewall response exceeded the configured size limit.", "invalid_response");
    let json: unknown;
    try { json = JSON.parse(text); }
    catch { throw new PfSenseApiError("Firewall returned invalid JSON.", "invalid_response"); }
    const parsed = envelopeSchema.safeParse(json);
    if (!parsed.success) throw new PfSenseApiError("Firewall response did not match the expected API envelope.", "invalid_response");
    if (parsed.data.code !== undefined && parsed.data.code >= 400) {
      throw new PfSenseApiError("Firewall API reported an unsuccessful operation.", parsed.data.code === 401 ? "authentication" : parsed.data.code === 403 ? "authorization" : "remote_server", parsed.data.code);
    }
    return parsed.data;
  }

  async close(): Promise<void> {
    const dispatcher = await this.dispatcherPromise;
    await dispatcher.close();
  }
}

export const pfSenseOperations = Object.keys(allowed) as PfSenseOperation[];

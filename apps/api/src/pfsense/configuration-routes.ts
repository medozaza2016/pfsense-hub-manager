import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { DeviceRepository } from "../devices/device-repository.js";
import type { PfSenseClient } from "./client.js";
import { ConfigurationShapeError, parseAliasObservations, type AliasCollectionObservation } from "./configuration.js";
import type { DevicePfSenseClientFactory } from "./device-client-factory.js";
import { classifyError, type ErrorClass } from "./errors.js";
import { ObservationCache, type CacheLookup } from "./observation-cache.js";

/**
 * Read-only, page-scoped configuration routes (DEC-047).
 *
 * There is no caller-supplied URL, path, method, or body: the device comes from
 * the manager database, the route is fixed here, and the upstream path comes from
 * the client's configuration allowlist. Authorization is enforced by the global
 * server hooks; these handlers only apply the device-state rules.
 *
 * These reads are deliberately outside the health poll: they do not write
 * `poll_runs` and therefore cannot change device-derived capability evidence.
 */

export type AliasReadResult =
  | { outcome: "success"; collection: AliasCollectionObservation }
  | { outcome: "failure"; errorClass: ErrorClass };

export interface ConfigurationRouteDependencies {
  factory: DevicePfSenseClientFactory;
  devices: DeviceRepository;
  cache: ObservationCache<AliasReadResult>;
}

/** One area's fixed upstream facts. No value here is caller-controllable. */
const ALIASES = {
  route: "/api/v2/firewall/aliases",
  privilege: "api-v2-firewall-aliases-get",
  area: "firewall aliases"
} as const;

const deviceIdSchema = z.string().uuid();

class DeviceUnavailableError extends Error {}

function invalidDeviceId(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: "INVALID_DEVICE_ID", message: "Invalid device identifier." } });
}

function deviceNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
}

/**
 * Maps an upstream error class to a manager-owned status and code. The messages
 * are written for an operator: they name the privilege or route to check and
 * never include firewall payloads, credentials, or response bodies.
 */
function failureReply(
  reply: FastifyReply,
  errorClass: ErrorClass,
  area: { route: string; privilege: string; area: string },
  meta: { cacheHit: boolean; durationMs: number }
) {
  const shared = { data: null, meta };
  if (errorClass === "authorization") {
    return reply.code(502).send({
      ...shared,
      error: {
        code: "FIREWALL_PERMISSION_DENIED",
        message: `The firewall denied the ${area.area} read. Grant the least-privilege ${area.privilege} privilege to the manager's firewall account.`
      }
    });
  }
  if (errorClass === "unsupported") {
    return reply.code(502).send({
      ...shared,
      error: {
        code: "FIREWALL_ENDPOINT_UNSUPPORTED",
        message: `This firewall or its REST API package does not expose ${area.route}. The ${area.area} page remains unverified for this device.`
      }
    });
  }
  if (errorClass === "timeout") {
    return reply.code(504).send({
      ...shared,
      error: { code: "FIREWALL_TIMEOUT", message: `The firewall did not answer the ${area.area} read in time.` }
    });
  }
  if (errorClass === "invalid_response") {
    return reply.code(502).send({
      ...shared,
      error: {
        code: "FIREWALL_INVALID_RESPONSE",
        message: `The firewall answered the ${area.area} read with a data shape the manager does not accept, so nothing was displayed.`
      }
    });
  }
  const detail = errorClass === "authentication" ? "Firewall authentication failed."
    : errorClass === "tls" ? "Firewall TLS verification failed."
      : errorClass === "rate_limit" ? "The firewall API rate limit was reached."
        : "The firewall could not be read.";
  return reply.code(502).send({
    ...shared,
    error: { code: "FIREWALL_UNAVAILABLE", message: `${detail} No ${area.area} data was displayed.` }
  });
}

export async function registerConfigurationRoutes(
  app: FastifyInstance,
  dependencies: ConfigurationRouteDependencies
): Promise<void> {
  const { factory, devices, cache } = dependencies;

  async function readAliases(deviceId: string): Promise<AliasReadResult> {
    const client: PfSenseClient | null = await factory.create(deviceId);
    if (!client) throw new DeviceUnavailableError();
    try {
      const envelope = await client.getConfiguration("aliases");
      const parsed = parseAliasObservations(envelope.data);
      return {
        outcome: "success",
        collection: {
          deviceId,
          collectedAt: new Date().toISOString(),
          aliases: parsed.aliases,
          truncated: parsed.truncated
        }
      };
    } catch (error) {
      // A malformed body is a response problem, not an outage: it is cached with
      // the failure TTL so one bad response cannot be retried on every render.
      const errorClass = error instanceof ConfigurationShapeError ? "invalid_response" : classifyError(error);
      return { outcome: "failure", errorClass };
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  app.get("/api/v1/devices/:deviceId/configuration/aliases", async (request, reply) => {
    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: string }).deviceId);
    if (!parsed.success) return invalidDeviceId(reply);
    const deviceId = parsed.data;

    const profile = await devices.getProfile(deviceId);
    if (!profile || profile.isDemo) return deviceNotFound(reply);
    if (!profile.enabled) {
      return reply.code(409).send({
        error: { code: "DEVICE_DISABLED", message: "Enable this firewall before reading its configuration." }
      });
    }

    const startedAt = Date.now();
    let lookup: CacheLookup<AliasReadResult>;
    try {
      lookup = await cache.get(deviceId, () => readAliases(deviceId), value => value.outcome === "failure");
    } catch (error) {
      if (error instanceof DeviceUnavailableError) {
        return reply.code(409).send({
          error: { code: "DEVICE_UNAVAILABLE", message: "The firewall is no longer available for configuration reads." }
        });
      }
      throw error;
    }

    const meta = { cacheHit: lookup.cacheHit, durationMs: Date.now() - startedAt };
    if (lookup.value.outcome === "failure") return failureReply(reply, lookup.value.errorClass, ALIASES, meta);
    return reply.code(200).send({ data: lookup.value.collection, meta });
  });
}


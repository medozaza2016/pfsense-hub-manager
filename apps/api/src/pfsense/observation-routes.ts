import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { DeviceRepository } from "../devices/device-repository.js";
import { deviceUp, pollObserver } from "../metrics.js";
import { ObservationCache } from "./observation-cache.js";
import type { SiteSnapshot } from "./observations.js";
import { POLLED_OPERATIONS, PfSenseProvider } from "./provider.js";
import { recordPollHealth } from "./poll-health.js";

export interface ObservationRouteDependencies {
  provider: PfSenseProvider;
  devices: DeviceRepository;
  pool: Pool;
  cache: ObservationCache<SiteSnapshot>;
}

const deviceIdSchema = z.string().uuid();

class DeviceUnavailableError extends Error {}

function invalidDeviceId(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: "INVALID_DEVICE_ID", message: "Invalid device identifier." } });
}

function deviceNotFound(reply: FastifyReply) {
  return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
}

/**
 * Read-only site observation routes.
 *
 * There is no caller-supplied URL, path, method, or body: the device is resolved
 * from the manager database and the provider maps the request onto its fixed
 * eight-operation allowlist. Authorization is enforced by the global server
 * hooks; these handlers only apply the device-state rules.
 */
export async function registerObservationRoutes(app: FastifyInstance, dependencies: ObservationRouteDependencies): Promise<void> {
  const { provider, devices, pool, cache } = dependencies;

  const snapshotHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: string }).deviceId);
    if (!parsed.success) return invalidDeviceId(reply);
    const deviceId = parsed.data;

    const profile = await devices.getProfile(deviceId);
    if (!profile || profile.isDemo) return deviceNotFound(reply);
    if (!profile.enabled) {
      return reply.code(409).send({ error: { code: "DEVICE_DISABLED", message: "Enable this firewall before requesting live status." } });
    }

    const startedAt = Date.now();
    let lookup;
    try {
      lookup = await cache.get(
        deviceId,
        async () => {
          const result = await provider.collect(deviceId, pollObserver(deviceId));
          if (!result) throw new DeviceUnavailableError();
          await recordPollHealth(pool, {
            deviceId,
            failedOperations: result.failedOperations,
            totalOperations: POLLED_OPERATIONS.length,
            requestId: request.id
          });
          return result.snapshot;
        },
        value => value.outcome !== "success"
      );
    } catch (error) {
      if (error instanceof DeviceUnavailableError) {
        return reply.code(409).send({ error: { code: "DEVICE_UNAVAILABLE", message: "The firewall is no longer available for polling." } });
      }
      throw error;
    }

    const snapshot = lookup.value;
    deviceUp.set({ device_id: deviceId }, snapshot.outcome === "success" ? 1 : 0);
    const unavailable = snapshot.outcome === "unavailable";
    return reply.code(unavailable ? 502 : 200).send({
      data: snapshot,
      meta: { cacheHit: lookup.cacheHit, durationMs: Date.now() - startedAt },
      ...(unavailable ? {
        error: {
          code: "DEVICE_UNAVAILABLE",
          message: "No read-only operation succeeded. Check the firewall, network path, credential, and TLS trust."
        }
      } : {})
    });
  };

  app.get("/api/v1/devices/:deviceId/snapshot", snapshotHandler);
  // The pre-existing read-only path is kept as an alias of the same sanitized
  // collection so no second collection path can diverge.
  app.get("/api/v1/devices/:deviceId/overview", snapshotHandler);

  app.get("/api/v1/devices/:deviceId/capabilities", async (request, reply) => {
    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: string }).deviceId);
    if (!parsed.success) return invalidDeviceId(reply);
    const profile = await devices.getProfile(parsed.data);
    if (!profile || profile.isDemo) return deviceNotFound(reply);
    return { data: await provider.capabilities(parsed.data) };
  });
}

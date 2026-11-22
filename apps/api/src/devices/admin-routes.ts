import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import { authorizationFailure, type AdminUser } from "../auth.js";
import { appendAudit } from "../audit.js";
import {
  createDeviceSchema,
  updateDeviceProfileSchema,
  DeviceRepository
} from "./device-repository.js";
import type { DevicePfSenseClientFactory } from "../pfsense/device-client-factory.js";
import { classifyError } from "../pfsense/errors.js";
import { normalizeDeviceCaBundle } from "../pfsense/tls-trust.js";

interface AuthenticatedRequest extends FastifyRequest {
  admin?: AdminUser;
}

interface DeviceAdminRouteDependencies {
  devices: DeviceRepository;
  clientFactory: DevicePfSenseClientFactory;
  pool: Pool;
}

const deviceIdSchema = z.string().uuid();
const enabledSchema = z.object({ enabled: z.boolean() }).strict();
const credentialSchema = z.object({ apiKey: z.string().min(1).max(4096) }).strict();
// Keep the request below Fastify's 64 KiB JSON body limit, including JSON overhead.
const tlsTrustSchema = z.object({
  certificateAuthority: z.string().max(60 * 1024).nullable()
}).strict();

async function requireAdministrator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const actor = (request as AuthenticatedRequest).admin ?? null;
  const failure = authorizationFailure(actor);
  if (failure === 401) {
    await reply.code(401).send({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in to access this resource." }
    });
    return;
  }
  if (failure === 403) {
    await reply.code(403).send({
      error: { code: "ADMINISTRATOR_REQUIRED", message: "Administrator permissions are required for this operation." }
    });
  }
}

function actorFor(request: FastifyRequest): AdminUser {
  const actor = (request as AuthenticatedRequest).admin;
  if (!actor || actor.role !== "admin") throw new Error("Administrator context is unavailable.");
  return actor;
}

function parseDeviceId(request: FastifyRequest, reply: FastifyReply): string | null {
  const params = z.object({ deviceId: deviceIdSchema }).safeParse(request.params);
  if (!params.success) {
    void reply.code(400).send({
      error: { code: "INVALID_DEVICE_ID", message: "A valid device identifier is required." }
    });
    return null;
  }
  return params.data.deviceId;
}

function invalidBody(reply: FastifyReply, code: string, message: string) {
  return reply.code(400).send({ error: { code, message } });
}

export async function registerDeviceAdminRoutes(
  app: FastifyInstance,
  dependencies: DeviceAdminRouteDependencies
): Promise<void> {
  const { devices, clientFactory, pool } = dependencies;

  app.post("/api/v1/devices", { preHandler: requireAdministrator }, async (request, reply) => {
    const parsed = createDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidBody(reply, "INVALID_DEVICE", "Provide a name, optional location, Plus or CE edition, HTTPS API origin, and API credential.");
    }

    const actor = actorFor(request);
    const profile = await devices.create(parsed.data);
    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "device.create",
      outcome: "success",
      targetType: "device",
      targetId: profile.id,
      summary: "Registered managed firewall",
      metadata: { name: profile.name, edition: profile.edition, enabled: profile.enabled },
      requestId: request.id
    });
    return reply.code(201).send({ data: profile });
  });

  app.patch("/api/v1/devices/:deviceId", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const parsed = updateDeviceProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidBody(reply, "INVALID_DEVICE_UPDATE", "Provide valid non-secret device profile fields. Credentials must be changed through credential rotation.");
    }

    const actor = actorFor(request);
    const profile = await devices.updateProfile(deviceId, parsed.data);
    if (!profile) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "device.update",
      outcome: "success",
      targetType: "device",
      targetId: deviceId,
      summary: "Updated managed firewall profile",
      metadata: { name: profile.name, edition: profile.edition },
      requestId: request.id
    });
    return { data: profile };
  });

  app.patch("/api/v1/devices/:deviceId/enabled", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const parsed = enabledSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(reply, "INVALID_DEVICE_STATE", "Provide an enabled boolean.");

    const actor = actorFor(request);
    const profile = await devices.setEnabled(deviceId, parsed.data.enabled);
    if (!profile) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: parsed.data.enabled ? "device.enable" : "device.disable",
      outcome: "success",
      targetType: "device",
      targetId: deviceId,
      summary: parsed.data.enabled ? "Enabled managed firewall" : "Disabled managed firewall",
      metadata: { enabled: profile.enabled },
      requestId: request.id
    });
    return { data: profile };
  });

  app.put("/api/v1/devices/:deviceId/credential", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const parsed = credentialSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(reply, "INVALID_DEVICE_CREDENTIAL", "Provide a non-empty API credential within the supported length.");

    const actor = actorFor(request);
    const rotated = await devices.rotateCredential(deviceId, parsed.data.apiKey);
    if (!rotated) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "device.credential.rotate",
      outcome: "success",
      targetType: "device",
      targetId: deviceId,
      summary: "Rotated managed firewall API credential",
      requestId: request.id
    });
    return { data: { deviceId, credentialUpdated: true } };
  });

  app.put("/api/v1/devices/:deviceId/tls-trust", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const parsed = tlsTrustSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidBody(reply, "INVALID_DEVICE_TLS_TRUST", "Provide a valid PEM certificate bundle or null to restore operating-system trust.");
    }

    let normalizedCertificateAuthority: string | null;
    try {
      normalizedCertificateAuthority = parsed.data.certificateAuthority === null
        ? null
        : normalizeDeviceCaBundle(parsed.data.certificateAuthority);
    } catch {
      return invalidBody(reply, "INVALID_DEVICE_TLS_TRUST", "The certificate bundle must contain valid, currently valid CA certificates in PEM format.");
    }

    const actor = actorFor(request);
    const updated = await devices.setDeviceCaBundle(deviceId, normalizedCertificateAuthority);
    if (!updated) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: normalizedCertificateAuthority === null ? "device.tls_trust.clear" : "device.tls_trust.update",
      outcome: "success",
      targetType: "device",
      targetId: deviceId,
      summary: normalizedCertificateAuthority === null
        ? "Removed custom firewall TLS trust"
        : "Updated custom firewall TLS trust",
      metadata: { customTrustConfigured: normalizedCertificateAuthority !== null },
      requestId: request.id
    });
    return { data: { deviceId, customTrustConfigured: normalizedCertificateAuthority !== null } };
  });

  app.post("/api/v1/devices/:deviceId/connection-test", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;

    const actor = actorFor(request);
    const testedAt = new Date().toISOString();
    let client: Awaited<ReturnType<DevicePfSenseClientFactory["create"]>> = null;
    let outcome: "reachable" | "unreachable" = "reachable";
    let errorClass: ReturnType<typeof classifyError> | null = null;

    try {
      client = await clientFactory.create(deviceId);
      if (!client) {
        return reply.code(409).send({
          error: { code: "DEVICE_UNAVAILABLE", message: "The device is missing, disabled, a demo device, or has no usable credential." }
        });
      }

      // A successful version GET proves authenticated API reachability only.
      // It does not establish support for every operation or edition.
      await client.get("version");
    } catch (error) {
      outcome = "unreachable";
      errorClass = classifyError(error);
    } finally {
      if (client) await client.close().catch(() => undefined);
    }

    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "device.connection_test",
      outcome: outcome === "reachable" ? "success" : "failure",
      targetType: "device",
      targetId: deviceId,
      summary: outcome === "reachable"
        ? "Firewall connection test succeeded"
        : "Firewall connection test failed",
      metadata: { operation: "version", outcome, errorClass },
      requestId: request.id
    });
    return { data: { deviceId, outcome, errorClass, testedAt, operation: "version" } };
  });
}

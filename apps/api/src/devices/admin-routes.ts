import { randomUUID, X509Certificate } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { isIP } from "node:net";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";
import { authorizationFailure, type AdminUser } from "../auth.js";
import { appendAudit } from "../audit.js";
import {
  apiOriginSchema,
  createDeviceSchema,
  updateDeviceProfileSchema,
  tlsServernameSchema,
  DeviceRepository
} from "./device-repository.js";
import type { DevicePfSenseClientFactory } from "../pfsense/device-client-factory.js";
import { classifyError, findUpstreamErrorCode, PfSenseApiError } from "../pfsense/errors.js";
import { normalizeDeviceCaBundle } from "../pfsense/tls-trust.js";
import { resolveSafeDeviceDestination } from "./network-destination.js";
import { createPinnedLookup } from "../pfsense/client.js";

interface AuthenticatedRequest extends FastifyRequest {
  admin?: AdminUser;
}

interface DeviceAdminRouteDependencies {
  devices: DeviceRepository;
  clientFactory: DevicePfSenseClientFactory;
  pool: Pool;
  /**
   * Notified after a change that makes a cached read-only observation stale
   * (archive, disable, profile, credential, or TLS trust change). It receives
   * only the manager device ID; no secret material is passed.
   */
  onDeviceChanged?: (deviceId: string) => void;
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


type DiscoveredFirewallCertificate = {
  subject: string;
  issuer: string;
  subjectAltName: string;
  dnsNames: string[];
  ipAddresses: string[];
  suggestedServername: string | null;
  fingerprint256: string;
  validFrom: string;
  validTo: string;
  tlsServernameUsed: string | null;
};

async function discoverFirewallCertificate(apiBaseUrl: string, requestedServername: string | null): Promise<DiscoveredFirewallCertificate> {
  const url = new URL(apiBaseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const destination = await resolveSafeDeviceDestination(hostname);
  const port = Number(url.port || 443);
  const tlsServernameUsed = requestedServername || (isIP(hostname) === 0 ? hostname : null);

  return new Promise((resolve, reject) => {
    const socket = tlsConnect({
      host: hostname,
      port,
      ...(tlsServernameUsed ? { servername: tlsServernameUsed } : {}),
      // Certificate validation is disabled only to inspect the peer certificate. No API key is sent, and this socket is never used for API requests.
      rejectUnauthorized: false,
      lookup: createPinnedLookup(hostname, destination),
      timeout: 5000
    });

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(message));
    };

    socket.once("error", () => fail("Unable to retrieve the firewall TLS certificate."));
    socket.once("timeout", () => fail("Firewall TLS certificate discovery timed out."));
    socket.once("secureConnect", () => {
      if (settled) return;
      try {
        const peer = socket.getPeerCertificate();
        if (!peer.raw) throw new Error("Certificate unavailable");
        const certificate = new X509Certificate(peer.raw);
        const subjectAltName = certificate.subjectAltName ?? "";
        const dnsNames = [...subjectAltName.matchAll(/(?:^|,\s*)DNS:([^,]+)/g)]
          .map(match => match[1]?.trim()).filter((value): value is string => Boolean(value));
        const ipAddresses = [...subjectAltName.matchAll(/(?:^|,\s*)IP Address:([^,]+)/g)]
          .map(match => match[1]?.trim()).filter((value): value is string => Boolean(value));
        settled = true;
        resolve({
          subject: certificate.subject,
          issuer: certificate.issuer,
          subjectAltName,
          dnsNames,
          ipAddresses,
          suggestedServername: dnsNames.length === 1 && !dnsNames[0]?.startsWith("*.") ? dnsNames[0] ?? null : null,
          fingerprint256: certificate.fingerprint256,
          validFrom: certificate.validFrom,
          validTo: certificate.validTo,
          tlsServernameUsed
        });
      } catch {
        fail("The firewall presented a certificate that could not be inspected.");
      } finally {
        socket.end();
      }
    });
  });
}

export async function registerDeviceAdminRoutes(
  app: FastifyInstance,
  dependencies: DeviceAdminRouteDependencies
): Promise<void> {
  const { devices, clientFactory, pool, onDeviceChanged } = dependencies;


  app.post("/api/v1/devices/discover-certificate", { preHandler: requireAdministrator }, async (request, reply) => {
    const parsed = z.object({ apiBaseUrl: apiOriginSchema, tlsServername: tlsServernameSchema }).strict().safeParse(request.body);
    if (!parsed.success) return invalidBody(reply, "INVALID_FIREWALL_URL", "Enter a valid HTTPS firewall origin.");
    try {
      return { data: await discoverFirewallCertificate(parsed.data.apiBaseUrl, parsed.data.tlsServername) };
    } catch (error) {
      return reply.code(422).send({
        error: {
          code: "CERTIFICATE_DISCOVERY_FAILED",
          message: error instanceof Error ? error.message : "Firewall certificate discovery failed."
        }
      });
    }
  });

  const registrationTestSchema = z.object({
    apiBaseUrl: apiOriginSchema,
    apiKey: z.string().min(1).max(4096).refine(value => !/[\r\n]/.test(value), "API credentials cannot contain line breaks."),
    certificateAuthority: z.string().max(60 * 1024).optional(),
    tlsServername: tlsServernameSchema
  }).strict();

  app.post("/api/v1/devices/registration-test", { preHandler: requireAdministrator }, async (request, reply) => {
    const parsed = registrationTestSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(reply, "INVALID_CONNECTION_TEST", "Provide a valid HTTPS origin, API credential, and optional TLS trust settings.");
    const actor = actorFor(request);
    try {
      await clientFactory.testConnection(parsed.data);
      await appendAudit(pool, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: "device.registration_test",
        outcome: "success",
        targetType: "device",
        summary: "Pre-registration firewall connection test succeeded",
        metadata: { operation: "version" },
        requestId: request.id
      });
      return { data: { outcome: "reachable", operation: "version", testedAt: new Date().toISOString() } };
    } catch (error) {
      const errorClass = classifyError(error);
      const diagnosticCode = error instanceof PfSenseApiError ? error.diagnosticCode ?? findUpstreamErrorCode(error) : findUpstreamErrorCode(error);
      request.log.warn({
        errorClass,
        ...(diagnosticCode ? { diagnosticCode } : {})
      }, "Firewall registration connection test failed");
      await appendAudit(pool, {
        actorId: actor.id,
        actorUsername: actor.username,
        action: "device.registration_test",
        outcome: "failure",
        targetType: "device",
        summary: "Pre-registration firewall connection test failed",
        metadata: { operation: "version", errorClass, ...(diagnosticCode ? { diagnosticCode } : {}) },
        requestId: request.id
      });
      return reply.code(422).send({
        error: { code: "CONNECTION_TEST_FAILED", message: "Firewall connection test failed.", errorClass, ...(diagnosticCode ? { diagnosticCode } : {}) }
      });
    }
  });

  app.post("/api/v1/devices", { preHandler: requireAdministrator }, async (request, reply) => {
    const parsed = createDeviceSchema.safeParse(request.body);
    if (!parsed.success) {
      return invalidBody(reply, "INVALID_DEVICE", "Provide a name, optional location, Plus or CE edition, HTTPS API origin, and API credential.");
    }

    const actor = actorFor(request);
    const connectionCheckStartedAt = Date.now();
    try {
      await clientFactory.testConnection(parsed.data);
    } catch (error) {
      const errorClass = classifyError(error);
      return reply.code(422).send({
        error: { code: "CONNECTION_TEST_FAILED", message: "Firewall connection test failed. Registration was not saved.", errorClass }
      });
    }
    const connectionCheckDurationMs = Math.max(0, Date.now() - connectionCheckStartedAt);
    const profile = await devices.create(parsed.data, connectionCheckDurationMs);
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

  app.get("/api/v1/devices/:deviceId/profile", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const profile = await devices.getProfile(deviceId);
    if (!profile || profile.isDemo) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    return { data: profile };
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
    onDeviceChanged?.(deviceId);
    return { data: profile };
  });

  app.delete("/api/v1/devices/:deviceId", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const parsed = z.object({ confirmation: z.literal("ARCHIVE") }).strict().safeParse(request.body);
    if (!parsed.success) {
      return invalidBody(reply, "ARCHIVE_CONFIRMATION_REQUIRED", "Confirm this manager-side action by sending confirmation: ARCHIVE.");
    }

    const actor = actorFor(request);
    const archived = await devices.archive(deviceId, actor.id);
    if (!archived) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found or is already archived." } });
    }
    await appendAudit(pool, {
      actorId: actor.id,
      actorUsername: actor.username,
      action: "device.archive",
      outcome: "success",
      targetType: "device",
      targetId: deviceId,
      summary: "Archived managed firewall and purged its stored connection secrets",
      metadata: { pollingHistoryRetained: true, alertsRetained: true, resolvedAlertCount: archived.resolvedAlertCount },
      requestId: request.id
    });
    onDeviceChanged?.(deviceId);
    return { data: { deviceId, archived: true, pollingHistoryRetained: true, alertsRetained: true, resolvedAlertCount: archived.resolvedAlertCount } };
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
    onDeviceChanged?.(deviceId);
    return { data: profile };
  });

  app.put("/api/v1/devices/:deviceId/credential", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;
    const parsed = credentialSchema.safeParse(request.body);
    if (!parsed.success) return invalidBody(reply, "INVALID_DEVICE_CREDENTIAL", "Provide a non-empty API credential within the supported length.");

    const actor = actorFor(request);
    const profile = await devices.getProfile(deviceId);
    if (!profile || profile.isDemo) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    let certificateAuthority: string | null;
    try {
      certificateAuthority = await devices.decryptDeviceCaBundle(deviceId);
      await clientFactory.testConnection({
        apiBaseUrl: profile.apiBaseUrl,
        apiKey: parsed.data.apiKey,
        tlsServername: profile.tlsServername,
        ...(certificateAuthority ? { certificateAuthority } : {})
      });
    } catch (error) {
      const errorClass = classifyError(error);
      return reply.code(422).send({
        error: { code: "CREDENTIAL_TEST_FAILED", message: "The replacement credential or TLS connection test failed. The stored credential was not changed.", errorClass }
      });
    }
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
    onDeviceChanged?.(deviceId);
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
    onDeviceChanged?.(deviceId);
    return { data: { deviceId, customTrustConfigured: normalizedCertificateAuthority !== null } };
  });

  app.post("/api/v1/devices/:deviceId/connection-test", { preHandler: requireAdministrator }, async (request, reply) => {
    const deviceId = parseDeviceId(request, reply);
    if (!deviceId) return;

    const actor = actorFor(request);
    const profile = await devices.getProfile(deviceId);
    if (!profile || profile.isDemo) {
      return reply.code(404).send({ error: { code: "DEVICE_NOT_FOUND", message: "Managed device was not found." } });
    }
    if (!profile.enabled) {
      return reply.code(409).send({ error: { code: "DEVICE_DISABLED", message: "Enable this firewall before testing its connection." } });
    }

    const startedAt = Date.now();
    let client: Awaited<ReturnType<DevicePfSenseClientFactory["create"]>> = null;
    let outcome: "reachable" | "unreachable" = "reachable";
    let errorClass: ReturnType<typeof classifyError> | null = null;

    try {
      client = await clientFactory.create(deviceId);
      if (!client) {
        return reply.code(409).send({
          error: { code: "DEVICE_UNAVAILABLE", message: "The device has no usable encrypted API credential." }
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

    const completedAt = new Date();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt);
    await pool.query(
      "INSERT INTO poll_runs(id,device_id,operation_group,outcome,started_at,completed_at,duration_ms,error_class) VALUES($1,$2,'version',$3,now()-($4::integer * interval '1 millisecond'),now(),$4,$5)",
      [randomUUID(), deviceId, outcome === "reachable" ? "success" : "failure", durationMs, errorClass]
    );

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
    return { data: { deviceId, outcome, errorClass, testedAt: completedAt.toISOString(), operation: "version" } };
  });
}

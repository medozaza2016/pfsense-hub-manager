import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { AdminUser } from "../auth.js";
import { MAX_LOG_LINES, hostServiceSchema, operationSubmissionSchema } from "./protocol.js";
import type { HostSystemService } from "./service.js";

interface HostSystemRouteDependencies {
  service: HostSystemService;
  pool: Pool;
}

const logQuerySchema = z.object({
  lines: z.coerce.number().int().min(1).max(MAX_LOG_LINES).default(100)
}).strict();

const operationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();

const operationIdSchema = z.string().uuid();

const FAILURE_STATUS: Record<string, 400 | 404 | 409 | 502 | 503> = {
  HOST_MONITORING_DISABLED: 503,
  HOST_OPERATIONS_DISABLED: 503,
  HOST_AGENT_NOT_CONFIGURED: 503,
  HOST_AGENT_SOCKET_NOT_CONFIGURED: 503,
  HOST_AGENT_REQUEST_INVALID: 502,
  HOST_AGENT_UNAVAILABLE: 502,
  HOST_AGENT_TIMEOUT: 502,
  HOST_AGENT_PROTOCOL_MISMATCH: 502,
  HOST_AGENT_RESPONSE_INVALID: 502,
  HOST_AGENT_RESPONSE_TOO_LARGE: 502,
  HOST_AGENT_RESPONSE_INCOMPLETE: 502,
  HOST_AGENT_FAILURE: 502,
  HOST_OPERATION_CONFIRMATION_REQUIRED: 400,
  HOST_OPERATION_IN_PROGRESS: 409,
  HOST_OPERATION_NOT_FOUND: 404,
  HOST_OPERATION_JOURNAL_INVALID: 502
};

const FAILURE_MESSAGE: Record<string, string> = {
  HOST_MONITORING_DISABLED: "Host monitoring is disabled for this deployment.",
  HOST_OPERATIONS_DISABLED: "Host operations are disabled for this deployment.",
  HOST_AGENT_NOT_CONFIGURED: "The Host Agent integration is not configured.",
  HOST_AGENT_SOCKET_NOT_CONFIGURED: "The Host Agent integration is not configured.",
  HOST_AGENT_REQUEST_INVALID: "The request could not be sent to the Host Agent.",
  HOST_AGENT_UNAVAILABLE: "The Host Agent is not reachable on this host.",
  HOST_AGENT_TIMEOUT: "The Host Agent did not answer in time.",
  HOST_AGENT_PROTOCOL_MISMATCH: "The Host Agent and API protocol versions do not match. Upgrade both together.",
  HOST_AGENT_RESPONSE_INVALID: "The Host Agent returned an unexpected response.",
  HOST_AGENT_RESPONSE_TOO_LARGE: "The Host Agent response exceeded the accepted size.",
  HOST_AGENT_RESPONSE_INCOMPLETE: "The Host Agent connection closed before a complete response arrived.",
  HOST_AGENT_FAILURE: "The Host Agent request could not be completed.",
  HOST_OPERATION_CONFIRMATION_REQUIRED: "Stopping the whole stack requires explicit confirmation.",
  HOST_OPERATION_IN_PROGRESS: "Another host operation is already in progress.",
  HOST_OPERATION_NOT_FOUND: "Host operation was not found.",
  HOST_OPERATION_JOURNAL_INVALID: "The host operation could not be recorded."
};

/** Resident administrator from the global authentication hook, or null. */
function actorFor(request: FastifyRequest): AdminUser | null {
  const actor = (request as FastifyRequest & { admin?: AdminUser }).admin;
  return actor && actor.role === "admin" ? actor : null;
}

function failureCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.message)
    ? error.message
    : "HOST_AGENT_FAILURE";
}

/**
 * Map an internal failure onto a fixed status and message pair. The thrown code
 * is the only detail that leaves the server, so socket paths, agent stderr, and
 * request payloads stay server-side.
 */
function sendFailure(reply: FastifyReply, error: unknown): void {
  const code = failureCode(error);
  reply.code(FAILURE_STATUS[code] ?? 502).send({
    error: { code, message: FAILURE_MESSAGE[code] ?? "The Host Agent request could not be completed." }
  });
}

export async function registerHostSystemRoutes(
  app: FastifyInstance,
  dependencies: HostSystemRouteDependencies
): Promise<void> {
  const { service, pool } = dependencies;

  app.get("/api/v1/system/status", async (_request, reply) => {
    try {
      return { data: await service.status(pool) };
    } catch (error) {
      sendFailure(reply, error);
      return reply;
    }
  });

  app.get("/api/v1/system/services/:service/logs", async (request, reply) => {
    const { service: target } = request.params as { service: string };
    const parsedService = hostServiceSchema.safeParse(target);
    const parsedQuery = logQuerySchema.safeParse(request.query);
    if (!parsedService.success || !parsedQuery.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_LOG_REQUEST",
          message: "Select a supported service and a line count between 1 and " + MAX_LOG_LINES + "."
        }
      });
    }
    try {
      return { data: await service.logs(parsedService.data, parsedQuery.data.lines) };
    } catch (error) {
      sendFailure(reply, error);
      return reply;
    }
  });

  app.post("/api/v1/system/compose/validate", async (_request, reply) => {
    try {
      return { data: await service.validateCompose() };
    } catch (error) {
      sendFailure(reply, error);
      return reply;
    }
  });

  /**
   * Queue one administrator-requested start/stop/restart. The body is restricted
   * to the released action, target, and confirmation fields, so no command, path,
   * service override, or upstream address can reach the agent from a caller.
   */
  app.post("/api/v1/system/operations", async (request, reply) => {
    const actor = actorFor(request);
    if (!actor) {
      return reply.code(403).send({
        error: { code: "ADMINISTRATOR_REQUIRED", message: "Administrator permissions are required for this operation." }
      });
    }
    const parsed = operationSubmissionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: "INVALID_OPERATION_REQUEST",
          message: "Provide a supported action and target. Stopping the whole stack also requires explicit confirmation."
        }
      });
    }
    try {
      const record = await service.requestOperation(pool, actor, parsed.data, request.id);
      return reply.code(202).send({ data: record });
    } catch (error) {
      sendFailure(reply, error);
      return reply;
    }
  });

  app.get("/api/v1/system/operations", async (request, reply) => {
    const parsed = operationListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: "INVALID_OPERATION_QUERY", message: "The operation history limit must be between 1 and 50." }
      });
    }
    try {
      return { data: await service.listOperations(pool, parsed.data.limit) };
    } catch (error) {
      sendFailure(reply, error);
      return reply;
    }
  });

  app.get("/api/v1/system/operations/:operationId", async (request, reply) => {
    const parsed = operationIdSchema.safeParse((request.params as { operationId?: string }).operationId);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: "INVALID_OPERATION_ID", message: "A valid host operation identifier is required." }
      });
    }
    try {
      return { data: await service.operation(pool, parsed.data) };
    } catch (error) {
      sendFailure(reply, error);
      return reply;
    }
  });
}

# Automatic Hub access deployment

## Status and scope

This document defines the implementation contract for automatic application of the LAN, Tailscale, and Custom access method selected in Administration → Hub Settings. The feature is not operational until the host agent, API orchestration, database lifecycle, UI redirect, and host integration tests described here are implemented and verified.

The existing endpoint settings and desired/applied revision model remain the source of truth. Saving an endpoint is no longer intended to be an administrator attestation. A successful save must enqueue a deployment against the exact desired revision and return a deployment identifier and current status.

## Required lifecycle

1. The authenticated administrator submits the complete three-endpoint configuration.
2. The API validates the complete configuration, persists it transactionally, increments the desired revision, and creates a deployment record for that revision.
3. The API submits only the deployment identifier and validated desired revision to the restricted host agent. The agent independently reloads and validates the approved configuration. It never accepts arbitrary shell commands, Compose arguments, file paths, service names, ports, or environment variable names.
4. The agent serializes deployments with a host lock and snapshots the currently applied binding before making changes.
5. The agent verifies the requested bind address is assigned to an eligible host interface. For the default local mode, it uses loopback. For a remote IP bind, the address must be assigned locally. A hostname is a reachability name, not a bind address. Do not bind to wildcard addresses.
6. The agent changes only HUB_BIND_ADDRESS in the managed deployment environment file, validates the fixed Compose project configuration, and recreates only the web service. It must not restart the API, database, code-server, unrelated projects, or remove volumes.
7. The agent probes the exact newly published HTTP origin and /health endpoint with a bounded timeout. It uses the actual WEB_PORT and scheme configured by the deployment. A port label in Hub Settings is not proof that TLS is configured.
8. Only after the probe succeeds does the agent mark the revision applied. The API exposes the confirmed origin and deployment status to the browser.
9. The browser navigates to the returned origin only after a successful status response. The UI retains a recovery link to the prior origin during the transition.
10. If apply or verification fails, the agent restores the previous environment value, recreates only the web service, verifies the previous origin, and records whether rollback succeeded. Never claim rollback succeeded without a successful recovery probe.

## Host agent security boundary

- Run the agent as a dedicated unprivileged service account with minimum rights needed to update this project's deployment file and invoke a fixed, root-owned wrapper for this Compose project.
- The agent is a separate host process, not a container with /var/run/docker.sock mounted.
- Expose a local Unix-domain socket on Linux with restrictive owner/group/mode. Only the API service identity may connect. The API container receives only the agent socket mount, never the Docker socket.
- The agent accepts a strict, versioned JSON request with a deployment ID and revision. It loads trusted deployment root, Compose file, and environment file from root-owned fixed configuration. Reject unknown properties and stale revisions.
- Permit exactly one project and one service recreation operation. No arbitrary command, path, Compose argument, image build, pull, volume, database restore, or unrelated container action is exposed.
- Validate every bind address against host interface assignments immediately before applying. Reject wildcard, multicast, unspecified, loopback for remote modes, and addresses not assigned to an eligible interface.
- Use a process lock and compare-and-swap revision check to prevent overlapping or stale deployments.
- Bound command duration, probe duration, retries, output size, and log retention. Redact environment values and never return secrets.
- Audit request, actor, target mode, revision, timestamps, result, and rollback result. Do not log credentials or full environment files.

## Platform behavior

### Linux production host

The supported production mechanism is a host-managed system service and local Unix socket. Installation must explicitly provision the service account, socket permissions, fixed project paths, wrapper, service unit, and recovery instructions. The service must fail closed if its trusted paths, ownership, or Compose project identity do not match the installation.

### Windows Docker Desktop development

The production Linux agent must not be assumed to work on Windows. Until a separately implemented and tested Windows host adapter exists, the API must report automatic deployment as unavailable on Windows and preserve the currently applied local binding. Do not silently fall back to manual confirmation or claim the setting was applied. Windows development must continue to support frontend and API development without requiring the production agent.

## Persistence and API contract

Add a deployment history table keyed by a generated deployment ID, with desired revision, requested mode, state, safe error code, started/finished timestamps, applied origin, rollback outcome, and actor. States are queued, validating, applying, verifying, succeeded, rolling_back, rolled_back, and failed. Store no secrets or arbitrary command output.

The API must expose current desired endpoint settings and applied revision, a save operation that persists desired settings and initiates deployment, deployment status lookup by opaque deployment ID, and bounded deployment history for administrators.

All mutation routes require an administrator session and server-side authorization. Reject stale desired revisions with HTTP 409. Deployment requests are idempotent per desired revision. Do not accept a browser-supplied applied status, host path, arbitrary bind address, or arbitrary origin.

## Browser transition

The save response distinguishes persisted desired state from deployment state. The UI displays progress and polls the authenticated status endpoint with bounded backoff. It redirects only when the backend reports succeeded and returns the origin verified by the host agent. It must not redirect on queued, applying, verifying, failed, or rolled_back. If the new origin cannot be reached from the browser, retain a recovery path to the previous origin and explain that host-side verification does not guarantee the browser's route or DNS works.

## Required tests and acceptance criteria

- Validation tests for all endpoint modes and invalid, wildcard, and unassigned addresses.
- API integration tests for administrator authorization, revision conflicts, idempotency, deployment history, and audit records.
- Agent tests for strict request parsing, path/service allowlists, interface validation, stale revisions, lock contention, command timeout, bounded output, successful apply, failed apply, successful rollback, and failed rollback.
- Compose integration tests proving only the web service is recreated and persistent volumes and other services remain untouched.
- Linux host integration tests on the actual supported distribution and Docker Engine/Compose versions.
- Browser tests proving no redirect occurs before verified success, redirect uses the returned origin, and the previous origin remains available for recovery.
- Explicit tests that API and web containers do not receive the Docker socket and that no arbitrary command interface exists.

The feature is complete only after the above tests pass on the supported Linux host. A code-only success, a database update, or a successful Compose command is not sufficient evidence of deployment or reachability.

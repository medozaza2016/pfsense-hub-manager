# Automatic Hub access deployment

## Status and scope

This document defines the implementation contract for automatic application of the LAN, Tailscale, and Custom access method selected in Administration → Hub Settings.

Implementation status on `feature/multi-site-onboarding`:
- Implemented in code: strict API-to-agent protocol, bearer-authenticated revision-scoped configuration retrieval, loopback-only API publication, Unix-socket client, Linux systemd host agent and installer, root-owned agent configuration, restricted socket permissions, Tailscale MagicDNS identity and certificate-domain preflight, Tailscale Serve configuration, HTTPS certificate and health verification, rollback of the newly-created Serve endpoint on verification failure, API desired-revision serialization, frontend HTTPS-only redirect, previous-origin recovery link, and recent deployment history.
- Deliberately unsupported: LAN and Custom deployment, Tailscale-IP HTTPS, and any method requiring a certificate lifecycle outside Tailscale Serve. The UI prevents unsupported methods from being queued. The agent also fails closed if it receives an unsupported request.
- Tests added: host-agent unit tests, API dispatcher revision-lock tests, HTTPS protocol tests, and Tailscale-IP validation tests.
- Not verified in this environment: test execution, API/web typecheck, production builds, Docker Compose validation, Linux installation, live Tailscale Serve, browser redirect, and rollback against a real tailnet. Do not treat source changes as production verification.

The feature is partially operational for Linux Tailscale MagicDNS only after the host agent is installed and tailnet HTTPS certificates are already enabled.

The existing endpoint settings and desired/applied revision model remain the source of truth. Saving an endpoint is no longer intended to be an administrator attestation. A successful save must enqueue a deployment against the exact desired revision and return a deployment identifier and current status.

## Required lifecycle

1. The authenticated administrator submits the complete three-endpoint configuration.
2. The API validates the complete configuration, persists it transactionally, increments the desired revision, and creates a deployment record for that revision.
3. The API submits only the deployment identifier and validated desired revision to the restricted host agent. The agent must independently retrieve the approved configuration from a narrowly authenticated API endpoint or another explicitly provisioned read-only source, then validate it. The API retrieval route is implemented with a dedicated bearer token and checks the deployment state and current desired revision. The Linux agent client for this route is not yet implemented. The agent must not be given unrestricted database or Docker access merely to obtain settings. It never accepts arbitrary shell commands, Compose arguments, file paths, service names, ports, or environment variable names.
4. The Linux agent serializes requests over one Unix-socket worker and a host lock. The API also holds a PostgreSQL desired-revision row lock for the duration of host verification, so a concurrent settings save cannot supersede an in-flight deployment.
5. For Tailscale, the agent verifies the requested MagicDNS name exactly matches the connected host's DNSName and appears in the host's CertDomains. It refuses Tailscale IP addresses and refuses to overwrite existing Serve or Funnel configuration.
6. The agent configures only `tailscale serve --bg --https=<port> http://127.0.0.1:8080`. It does not change Docker Compose bindings, restart containers, enable HTTPS for the tailnet, change ACLs, or enable Funnel.
7. The agent probes the exact HTTPS origin and `/health` endpoint with normal certificate-chain and hostname verification. A port label in Hub Settings is not proof that TLS is configured.
8. Only after the HTTPS probe succeeds does the agent return a verified origin. The API records the applied revision and exposes deployment status/history to the browser.
9. The browser redirects only to an HTTPS origin returned by a successful deployment status response. The Hub Settings page shows the last verified origin as a recovery link. Host-side verification does not prove that the administrator's current client has working DNS or a route to the tailnet.
10. If verification fails after the agent creates its Serve endpoint, it removes only that newly-created endpoint and verifies that Serve no longer reports it. It reports rollback success only after that check. Existing Serve/Funnel configuration is never reset or overwritten.

## TLS and Tailscale deployment model

The current web container's Nginx configuration listens on plain HTTP at container port 8080. A Compose host-port mapping changes only the host address and port; it does not terminate TLS. The Hub Settings field is currently named `httpsPort`, but that name does not make the published endpoint HTTPS. Mapping host port 443 to container port 8080 still serves HTTP.

TLS is mode-specific:

- **Tailscale:** use an already-installed and authenticated Tailscale client on the Linux host. The agent configures one Tailscale Serve HTTPS proxy to the Hub's loopback-only HTTP listener. It checks that the selected MagicDNS name is the local node and is listed in `CertDomains` before making changes. Tailscale Serve terminates TLS using its automatically provisioned certificate. The agent does not install or authenticate Tailscale, enable tailnet HTTPS, change ACLs, or enable Funnel. It refuses any pre-existing Serve or Funnel configuration to avoid overwriting another service.
- **LAN and Custom:** these modes still require an explicitly configured TLS termination layer with a valid certificate and hostname/IP identity appropriate to the endpoint. Certificate provisioning, renewal, and rollback are not implemented. These methods are disabled in the current UI and are not deployable.

The API-to-agent contract requires an `https://` success origin and rejects plaintext success responses. For Tailscale mode, this origin is verified through Tailscale Serve. For LAN and Custom, it must be verified through their separately configured TLS termination layer. No mode may silently fall back to remote plaintext HTTP.

The agent must control only a fixed, documented configuration surface. It must not accept arbitrary certificate paths, proxy directives, Tailscale commands, shell commands, or arbitrary service names from the API.

## Host agent security boundary

- Run the Linux agent as a root-owned systemd service because it controls the local Tailscale daemon. The service drops all Linux capabilities, uses systemd filesystem hardening, and is writable only to its socket and runtime-lock directories.
- The agent is a separate host process, not a container with `/var/run/docker.sock` mounted. It does not invoke Docker or Compose.
- Expose a local Unix-domain socket with a dedicated group, set-group-ID socket directory, and mode 0660. The API container receives that directory read-only and joins only the dedicated supplementary group. It never receives the Docker socket.
- The agent accepts a strict, versioned JSON request containing only a deployment UUID and desired revision. It retrieves approved configuration from the loopback-only API endpoint using a root-owned bearer token. Unknown properties and stale revisions are rejected.
- The only host command operations are fixed Tailscale status, Serve status, Funnel status, Serve configuration, and rollback invocations. The binary path and local web target come from root-owned configuration, never API input. No arbitrary shell, path, Docker argument, environment variable, or service name is accepted.
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

The API currently exposes current desired endpoint settings and applied revision, a save operation that persists desired settings and queues deployment, deployment status lookup by opaque deployment ID, and bounded deployment history for administrators. The agent transport is fail-closed and does not apply configuration until the Linux host agent is installed and configured.

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

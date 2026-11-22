# Automatic Hub access deployment

## Status and scope

This document defines the implementation contract for automatic application of the LAN, Tailscale, and Custom access method selected in Administration → Hub Settings.

Implementation status on `feature/multi-site-onboarding`:
- Implemented in code: strict API-to-agent protocol, bearer-authenticated revision-scoped configuration retrieval, loopback-only API publication, Unix-socket client, Linux systemd host agent and installer, root-owned agent configuration, restricted socket permissions, assigned-interface validation, atomic HUB_BIND_ADDRESS updates, fixed Docker Compose validation and web-only recreation, HTTPS certificate and health verification, rollback to the previous bind with previous-origin verification, Tailscale MagicDNS identity/certificate validation, fixed Tailscale Serve provisioning and verification, Funnel conflict checks, API desired-revision serialization, frontend HTTPS-only redirect, previous-origin recovery link, and recent deployment history.
- Deliberately unsupported: certificate issuance/renewal, DNS changes, reverse-proxy provisioning, Funnel provisioning, Tailscale-IP HTTPS, and automatic Windows host deployment. LAN and Custom require an operator-managed trusted TLS reverse proxy. The UI and API fail closed when the feature gate is disabled.
- Tests added: host-agent unit tests for interface assignment, atomic environment updates, fixed web-only Compose operations, HTTPS verification and rollback, Tailscale identity/Serve/Funnel checks; API dispatcher revision-lock and origin-validation tests; HTTPS protocol tests; and Tailscale-IP validation tests.
- Not verified in this environment: test execution, API/web typecheck, production builds, Docker Compose validation, Linux installation, live Tailscale Serve, browser redirect, and failure handling against a real tailnet. Do not treat source changes as production verification.

The code path supports Linux LAN/Custom bind changes with an existing trusted TLS reverse proxy, and Tailscale MagicDNS Serve provisioning through the restricted host agent. It is **disabled by default**. The API and UI remain gated until the Linux host integration tests pass. Hub Manager does not issue certificates, configure DNS/reverse proxies, enable tailnet HTTPS, change ACLs, or configure Funnel.

The existing endpoint settings and desired/applied revision model remain the source of truth. Saving an endpoint is no longer intended to be an administrator attestation. A successful save must enqueue a deployment against the exact desired revision and return a deployment identifier and current status.

## Required lifecycle

1. The authenticated administrator submits the complete three-endpoint configuration.
2. The API validates the complete configuration, persists it transactionally, increments the desired revision, and creates a deployment record for that revision.
3. The API submits only the deployment identifier and validated desired revision to the restricted host agent. The agent must independently retrieve the approved configuration from a narrowly authenticated API endpoint or another explicitly provisioned read-only source, then validate it. The API retrieval route is implemented with a dedicated bearer token and checks the deployment state and current desired revision. The Linux agent client for this route is implemented. The agent must not be given unrestricted database or Docker access merely to obtain settings. It never accepts arbitrary shell commands, Compose arguments, file paths, service names, ports, or environment variable names.
4. The Linux agent serializes requests over one Unix-socket worker and a host lock. The API also holds a PostgreSQL desired-revision row lock for the duration of host verification, so a concurrent settings save cannot supersede an in-flight deployment.
5. For LAN and Custom, the agent resolves the selected hostname or validates the selected IP against addresses assigned to the host. It rejects wildcard, unassigned, multicast, unspecified, link-local, and globally routable public addresses. A trusted TLS reverse proxy must already forward to the selected host address on port 8080.
6. For LAN and Custom, the agent snapshots the existing HUB_BIND_ADDRESS, atomically updates only that variable in the fixed project .env file, validates the fixed Compose project, and runs only `docker compose up -d --no-deps --no-build web`. For Tailscale, it restores the web bind to loopback when necessary, verifies the local MagicDNS identity and CertDomains, checks Funnel state, and provisions the fixed Serve root proxy if it is missing. It refuses to replace any conflicting Serve root handler.
7. The agent probes the exact HTTPS origin and `/health` endpoint with normal certificate-chain and hostname verification. If a newly created Serve route fails verification, it removes only that root handler. A port label in Hub Settings is not proof that TLS is configured.
8. Only after the HTTPS probe succeeds does the agent return a verified origin. The API records the applied revision and exposes deployment status/history to the browser.
9. The browser redirects only to an HTTPS origin returned by a successful deployment status response. The Hub Settings page shows the last verified origin as a recovery link. Host-side verification does not prove that the administrator's current client has working DNS or a route to the endpoint.
10. If a LAN/Custom apply or probe fails, the agent restores the previous HUB_BIND_ADDRESS, recreates only web, and probes the previous successful origin. It reports rollback success only if that previous HTTPS endpoint passes certificate and health verification. When switching from LAN/Custom, the agent changes HUB_BIND_ADDRESS back to 127.0.0.1 and recreates only the web service before verification. If a Tailscale route created by the current deployment fails verification, the agent removes only its own root handler. Existing operator routes are left unchanged.

## TLS and Tailscale deployment model

The current web container's Nginx configuration listens on plain HTTP at container port 8080. A Compose host-port mapping changes only the host address and port; it does not terminate TLS. The Hub Settings field is currently named `httpsPort`, but that name does not make the published endpoint HTTPS. Mapping host port 443 to container port 8080 still serves HTTP.

TLS is mode-specific:

- **Tailscale:** use an already-installed and authenticated Tailscale client on the Linux host, with MagicDNS and tailnet HTTPS certificates already enabled. The agent verifies that the selected MagicDNS name is the local node and is listed in `CertDomains`, then creates the fixed HTTPS Serve reverse proxy to the loopback-only web listener if it is not already present. It refuses to replace a conflicting root handler, never configures Funnel, and does not install or authenticate Tailscale, enable tailnet HTTPS, or change ACLs.
- **LAN and Custom:** the selected hostname/IP must resolve to a private address assigned to the Hub host. Publicly routable addresses are rejected. A trusted TLS termination/reverse-proxy layer must already be configured and forward to that address on port 8080. The agent changes only the web host binding, recreates only the web service, verifies the external HTTPS endpoint, and rolls back the previous binding on failure. Certificate issuance/renewal, DNS, and reverse-proxy configuration remain operator-managed.

The API-to-agent contract requires an `https://` success origin and rejects plaintext success responses. For Tailscale mode, this origin is verified through Tailscale Serve. For LAN and Custom, it must be verified through their separately configured TLS termination layer. No mode may silently fall back to remote plaintext HTTP.

The agent must control only a fixed, documented configuration surface. It must not accept arbitrary certificate paths, proxy directives, Tailscale commands, shell commands, or arbitrary service names from the API.

## Host agent security boundary

- Run the Linux agent as a root-owned systemd service because it uses the host Docker CLI for one fixed web-only Compose operation. The service drops all Linux capabilities, uses systemd filesystem hardening, and is writable only within the fixed project directory and runtime-lock directory.
- The agent is a separate host process, not a container with `/var/run/docker.sock` mounted. It invokes only the root-owned Docker CLI with fixed project paths and fixed `config --quiet` / `up -d --no-deps --no-build web` arguments.
- Expose a local Unix-domain socket with a dedicated group, set-group-ID socket directory, and mode 0660. The API container receives that directory read-only and joins only the dedicated supplementary group. It never receives the Docker socket.
- The agent accepts a strict, versioned JSON request containing only a deployment UUID and desired revision. It retrieves approved configuration from the loopback-only API endpoint using a root-owned bearer token. Unknown properties and stale revisions are rejected.
- The only host command operations are fixed `ip -j address show`, Docker Compose config validation, Docker Compose web-only recreation, Tailscale status/Serve/Funnel queries, and one narrowly fixed Tailscale Serve root-proxy setup/removal operation. No Funnel, ACL, DNS, certificate, arbitrary Serve path, or arbitrary Tailscale configuration mutation is performed. Binary paths, project paths, service name, and web target come from root-owned configuration, never API input. No arbitrary shell, path, Docker argument, environment variable, or service name is accepted.
- Validate LAN/Custom addresses against actual host interface assignments. Validate Tailscale MagicDNS identity against the connected host's DNSName and CertDomains. Reject Tailscale IP-address endpoints and any Serve route that does not proxy to the fixed loopback web target.
- Use a process lock and compare-and-swap revision check to prevent overlapping or stale deployments.
- Bound command duration, probe duration, retries, output size, and log retention. Redact environment values and never return secrets.
- The API audit event records the administrator and desired revision. Deployment history stores safe result codes and timestamps only. Do not log credentials, bearer tokens, or private key material.

## Platform behavior

### Linux production host

The Linux agent is installed with `host-agent/install-linux.sh` on a host with the project checked out at `/opt/pfsense-hub`. The installer provisions a root-only JSON configuration, a dedicated GID 2000 socket group, a restrictive socket directory, and a systemd service. The service drops all Linux capabilities and is filesystem-hardened. The API container receives only the socket directory as a read-only mount.

The agent uses a fixed Docker Compose project path and recreates only the web service for LAN/Custom bind changes. For Tailscale it can provision only the fixed root Serve proxy to 127.0.0.1:8080, after MagicDNS and HTTPS eligibility checks. It does not provision certificates, DNS, reverse proxies, Funnel, or tailnet ACLs. The feature gate is HUB_ACCESS_DEPLOYMENT_ENABLED=false by default. Do not set it to true until the supported Linux host integration tests have passed and the external TLS/Serve configuration has been reviewed. The installer requires the exact project, socket, and loopback settings documented in DEPLOYMENT.md.

### Windows Docker Desktop development

The production Linux agent does not run on Windows. Leave the agent token and socket empty for local development. The API reports `HOST_AGENT_NOT_CONFIGURED` if a deployment is requested without the Linux agent. The UI keeps all deployment saves disabled while HUB_ACCESS_DEPLOYMENT_ENABLED is false. Once explicitly enabled after Linux integration tests, LAN/Custom binding and Tailscale MagicDNS verification are supported only with the required operator-managed TLS prerequisites. Windows development continues to support the frontend and API without the production agent; it does not provide automatic host deployment.

## Persistence and API contract

Migration `014_hub_access_deployments.sql` adds deployment history keyed by generated deployment ID, desired revision, requested mode, state, safe error code, timestamps, applied origin, rollback outcome, and actor. States are queued, validating, applying, verifying, succeeded, rolling_back, rolled_back, and failed. No secrets or arbitrary command output are stored.

The API exposes current desired endpoint settings and applied revision, a save operation that persists settings and queues deployment, status lookup by deployment ID, and bounded deployment history for administrators. The dispatcher holds a PostgreSQL row lock on the desired revision while the host agent verifies the endpoint. This serializes concurrent settings changes against an in-flight verification. The agent transport remains fail-closed when the Linux host agent is not installed or configured.

All mutation routes require an administrator session and server-side authorization. Reject stale desired revisions with HTTP 409. Deployment requests are idempotent per desired revision. Do not accept a browser-supplied applied status, host path, arbitrary bind address, or arbitrary origin.

## Browser transition

The save response distinguishes persisted desired state from deployment state. The UI displays progress and polls the authenticated status endpoint with bounded backoff. It redirects only when the backend reports succeeded and returns the origin verified by the host agent. It must not redirect on queued, applying, verifying, failed, or rolled_back. If the new origin cannot be reached from the browser, retain a recovery path to the previous origin and explain that host-side verification does not guarantee the browser's route or DNS works.

## Required tests and acceptance criteria

- Added: endpoint schema tests, including rejection of Tailscale IP HTTPS; strict API-agent protocol tests; Unix-socket client tests; dispatcher tests for missing agent, stale revisions, row-lock ordering, origin validation, and database connection failure; Python host-agent tests for assigned-interface validation, atomic environment updates, web-only Compose recreation, successful LAN/Custom apply, rollback after TLS failure, MagicDNS identity, certificate eligibility, private Serve route verification, GUI-triggered Serve provisioning, conflict refusal, and removal of an agent-created route after failed verification.
- Not yet executed here: API/web typecheck, API tests, Python host-agent tests, frontend build, Compose config validation, and Linux systemd integration.
- Still required: live Linux host integration on the supported distribution, actual Tailscale Serve and TLS verification, browser tests from another tailnet device, failure/rollback tests against a real tailnet, and a full Windows development verification pass.
- LAN and Custom certificate issuance/renewal and TLS reverse-proxy provisioning are not implemented. A Windows host adapter is not implemented.

The feature is not complete until the tests above are executed and the Linux Tailscale path is verified on the supported host. A code-only success or a successful host-side probe is not evidence that the administrator's browser can reach the endpoint.

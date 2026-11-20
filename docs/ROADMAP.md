# Roadmap

## Current status

**Discovery and first-device connectivity validation completed.** Application implementation has not yet been started.

## M0, Discovery and environment validation

- [x] Create private GitHub repository and documentation foundation.
- [x] Define multi-firewall product direction.
- [x] Record Plus and CE as target editions.
- [x] Keep Netgate Nexus out of the dependency model.
- [x] Deploy manager LXC and install Docker / Docker Compose.
- [x] Establish Tailscale connectivity on the manager host.
- [x] Create dedicated regular pfSense API user pfsense_hub.
- [x] Assign the initial eight GET privileges.
- [x] Create API key for pfsense_hub.
- [x] Authenticate from the manager LXC using X-API-Key.
- [x] Receive HTTP 200 from all eight initial read-only endpoints on the Plus firewall.
- [ ] Record exact REST API package version and compatibility evidence.
- [ ] Complete verified TLS trust from the manager.

## M1, Architecture and application foundation

- [x] Use the existing Proxmox LXC `pfsense-hub-manager` with Docker Compose for application deployment.
- [x] Approve React, TypeScript, and Vite frontend.
- [x] Approve separate Node.js and TypeScript REST backend.
- [x] Select Fastify as backend HTTP framework (DEC-015).
- [x] Select PostgreSQL as the application database, running in the Docker Compose stack.
- [ ] Define PostgreSQL schema, migrations, retention, and backup/restore policy.
- [ ] Approve administrator authentication and authorization model.
- [ ] Approve secret storage mechanism.
- [ ] Define normalized device, health, gateway, interface, service, and observation types.
- [ ] Scaffold frontend and backend workspaces, then establish lint, type-check, test, and build commands.
- [ ] Add secure configuration loading and validation.

## M2, Read-only integration

- [ ] Implement server-side pfSense API client.
- [ ] Implement certificate-verified TLS.
- [ ] Implement runtime response validation.
- [ ] Implement per-device provider/adapter and capability detection.
- [ ] Implement device reachability and classified errors.
- [ ] Implement polling with timeouts, bounded retries, and backoff.
- [ ] Test authentication failure, timeout, TLS failure, malformed responses, and unsupported endpoints.
- [ ] Keep write operations disabled.

## M3, Dashboard

- [ ] Device inventory and status overview.
- [ ] Per-device system health.
- [ ] Gateway and interface status.
- [ ] Service status.
- [ ] Firewall state count and other approved metrics.
- [ ] Last successful poll and error details.
- [ ] Partial outage behavior.

## M4, Multi-edition validation and hardening

- [ ] Connect the second pfSense CE firewall when the user is ready.
- [ ] Record its release, API package version, architecture, and reachable management path.
- [ ] Verify supported endpoints independently on CE.
- [ ] Complete security review, access controls, logging redaction, and backup/recovery planning.
- [ ] Establish operational documentation and release process.

## Later phases, full management

The product direction includes configuration management. Write functionality is not part of the initial read-only milestone, but it is an intended product capability and should be reflected in the architecture from the beginning.

- [ ] Define capability matrix by pfSense edition, release, and API package version.
- [ ] Design change preview/diff and validation workflow.
- [ ] Design configuration backup and recovery/rollback strategy.
- [ ] Implement fine-grained authorization and explicit confirmation.
- [ ] Implement tamper-evident audit records for every write action.
- [ ] Add configuration management domains incrementally, starting with a narrowly scoped feature such as firewall aliases/rules after API compatibility is verified.
- [ ] Verify post-apply state and clearly report partial failures.
- [ ] Add safeguards for changes that can interrupt connectivity or lock out the administrator.

The exact firewall-to-hub connection method remains deferred. The transport abstraction must be preserved until that decision is made.


## Documentation and API inventory work

- [x] Capture the supplied pfSense REST API OpenAPI specification metadata and identify it as a separate artifact from application metrics.
- [ ] Add the supplied source file as `specs/pfsense-openapi.json` (retain the original source unchanged).
- [ ] Add and maintain the generated `docs/API-MATRIX.md` from the OpenAPI source.
- [ ] Add API compatibility records per firewall edition, release, architecture, and REST API package version.
- [ ] Add metrics definitions and monitoring/runbook documentation.
- [ ] Add the security baseline for credentials, TLS, access control, and future write operations.
- [ ] Add CI validation that checks the OpenAPI JSON and detects an out-of-date generated API matrix.

## M1, Backend implementation update

- [x] Select Fastify as the Node.js backend HTTP framework (DEC-015).
- [ ] Scaffold the Fastify + TypeScript backend.
- [ ] Implement a protected/restricted `/metrics` endpoint with the metric names and labels defined in `METRICS.md`.
- [ ] Keep Prometheus deployment optional until historical metrics, alerting, or dashboard requirements justify it.

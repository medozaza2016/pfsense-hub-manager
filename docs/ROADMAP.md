# Roadmap

## Current status

**Discovery completed. Initial application foundation scaffolded; container build and live runtime validation remain pending.**

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
- [x] Establish initial device inventory and poll-run persistence model; detailed normalized observation mapping remains pending.
- [x] Scaffold React/Vite frontend and Fastify/TypeScript backend workspaces with build, type-check, and test commands.
- [x] Add runtime configuration validation and HTTPS-origin enforcement.
- [x] Mount the pfSense API key as a Docker secret, not a frontend or ordinary API environment variable.

## M2, Read-only integration

- [x] Implement server-side pfSense API client with a fixed eight-route GET allowlist.
- [x] Enforce certificate and hostname verification, with optional private CA trust. Live trust validation remains pending.
- [x] Validate the common upstream JSON response envelope at runtime; endpoint-specific data schemas remain pending.
- [x] Implement initial configured-device provider and capability inventory; multi-device onboarding and per-edition validation remain pending.
- [x] Classify timeout, TLS, authentication, authorization, unsupported, rate-limit, remote-server, invalid-response, and unknown failures.
- [x] Implement user-triggered read-only collection with per-request timeouts and independent operation outcomes. Scheduled polling, retry/backoff policy, and concurrency controls remain pending.
- [ ] Expand automated tests for authentication, timeout, TLS, malformed responses, and unsupported endpoints.
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
- [x] Add `docs/API-MATRIX.md` and the generator; the complete 694-operation generated output is available as a working artifact, pending addition of the original source JSON to the repository.
- [x] Add API compatibility records per firewall edition, release, architecture, and REST API package version.
- [x] Add metrics definitions and monitoring/runbook documentation.
- [x] Add the security baseline for credentials, TLS, access control, and future write operations.
- [x] Add CI validation that regenerates the API matrix from the existing reference JSON and fails if the committed generated matrix is out of date.

## M1, Backend implementation update

- [x] Select Fastify as the Node.js backend HTTP framework (DEC-015).
- [ ] Scaffold the Fastify + TypeScript backend.
- [x] Implement an internal-only `/metrics` endpoint with bounded labels defined in `METRICS.md`.
- [ ] Keep Prometheus deployment optional until historical metrics, alerting, or dashboard requirements justify it.


## Initial foundation implementation record

The initial application scaffold is committed: React/Vite web app, Fastify API, PostgreSQL Compose service, initial SQL migration, Dockerfiles, local-only web exposure, Docker-secret API-key mount, strict HTTPS client, fixed allowlist for the eight previously verified GET endpoints, per-operation poll records, health/readiness endpoints, Prometheus-format metrics, and CI workflow. The first UI can trigger a read-only collection and show the result. ARP rows and individual firewall state rows are reduced to aggregate counts and are not persisted.

This is not a production release. The manager has no user login or role model yet. Only one firewall is configured through environment variables. The live TLS trust chain, Compose build on the LXC, API response compatibility, and CI run must be verified before calling the foundation operational. No write API, shell execution, reboot, halt, apply, or arbitrary upstream proxy is implemented.

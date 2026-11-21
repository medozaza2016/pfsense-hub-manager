# Implementation Checklist

> **Canonical roadmap and cross-session handoff:** [PROJECT-ROADMAP.md](PROJECT-ROADMAP.md). That document is the authoritative phased plan, feature-domain register, current position, next action, and session handoff. Update it at the end of every meaningful session. This file remains a concise engineering checklist and must not contradict the canonical roadmap.

# Implementation Checklist

## Current status

**Current implementation:** Windows 11 local development is running with Docker Compose. Manager authentication, Admin/User roles, multi-firewall registration, encrypted per-device credentials, TLS certificate discovery/server identity, firewall inventory editing/removal, read-only checks, and the initial responsive dashboard shell are implemented. React Router URL-based navigation is now in the frontend. The user has confirmed that the firewall connection test and read-only collection work locally. The latest React Router changes have not yet been locally type-checked or built.

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
- [x] Implement verified TLS trust configuration with optional per-firewall CA certificates and TLS server-name identity. [A successful local connection test was reported; certificate trust is not automatically accepted during discovery.]

## M1, Architecture and application foundation

- [x] Use the existing Proxmox LXC `pfsense-hub-manager` with Docker Compose for application deployment.
- [x] Approve React, TypeScript, and Vite frontend.
- [x] Approve separate Node.js and TypeScript REST backend.
- [x] Select Fastify as backend HTTP framework (DEC-015).
- [x] Select PostgreSQL as the application database, running in the Docker Compose stack.
- [ ] Define PostgreSQL schema, migrations, retention, and backup/restore policy.
- [x] Implement first-run administrator bootstrap, sign-in sessions, Admin/User roles, server-side role checks, and protected manager API routes. Production hardening remains tracked separately.
- [x] Implement server-side Docker-secret handling for the initial API key and AES-256-GCM encrypted storage for additional firewall API keys, with a separate 32-byte encryption key mounted as a Docker secret. Key backup and rotation procedures remain operational work.
- [x] Establish initial device inventory and poll-run persistence model; detailed normalized observation mapping remains pending.
- [x] Scaffold React/Vite frontend and Fastify/TypeScript backend workspaces with build, type-check, and test commands.
- [x] Add runtime configuration validation and HTTPS-origin enforcement.
- [x] Mount the pfSense API key as a Docker secret, not a frontend or ordinary API environment variable.

## M2, Read-only integration

- [x] Implement server-side pfSense API client with a fixed eight-route GET allowlist.
- [x] Enforce certificate and hostname verification, with optional private CA trust. Live trust validation remains pending.
- [x] Validate the common upstream JSON response envelope at runtime; endpoint-specific data schemas remain pending.
- [x] Implement multi-device inventory, admin-only connection testing and registration, per-device TLS settings, encrypted API credentials, and read-only collection. Live CE compatibility validation remains pending.
- [x] Classify timeout, TLS, authentication, authorization, unsupported, rate-limit, remote-server, invalid-response, and unknown failures.
- [x] Implement user-triggered read-only collection with per-request timeouts and independent operation outcomes. Scheduled polling, retry/backoff policy, and concurrency controls remain pending.
- [ ] Expand automated tests for authentication, timeout, TLS, malformed responses, and unsupported endpoints.
- [ ] Keep write operations disabled.

## M3, Dashboard and frontend

- [x] Implement responsive application shell, sidebar navigation hierarchy, dashboard summary, and firewall inventory.
- [x] Implement inventory search/filter, appliance details, enable/disable, metadata editing, and removal with confirmation. The installation-configured primary firewall is protected from deletion.
- [x] Implement per-device read-only check in a modal with automatic scrolling to returned results.
- [x] Implement React Router URL-based navigation and deep-link fallback. See DEC-021 and the frontend routing standard in `AGENTS.md`.
- [ ] Split the current large frontend application component into route-level page components.
- [ ] Implement full monitoring views for system health, gateways, interfaces, services, and logs.
- [ ] Implement persistent last-success/error status and scheduled polling where required.

## M4, Multi-edition validation and hardening

- [ ] Complete live connection and compatibility validation for the second pfSense CE firewall when the user is ready.
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
- [x] Confirm the original source file is already committed unchanged at `docs/reference/pfsense-openapi.json`; do not duplicate it.
- [x] Add `docs/API-MATRIX.md` and the generator; the complete 694-operation generated output is available as a working artifact, pending addition of the original source JSON to the repository.
- [x] Add API compatibility records per firewall edition, release, architecture, and REST API package version.
- [x] Add metrics definitions and monitoring/runbook documentation.
- [x] Add the security baseline for credentials, TLS, access control, and future write operations.
- [x] Add CI validation that regenerates the API matrix from the existing reference JSON and fails if the committed generated matrix is out of date.

## M1, Backend implementation update

- [x] Select Fastify as the Node.js backend HTTP framework (DEC-015).
- [x] Scaffold the Fastify + TypeScript backend.
- [x] Implement an internal-only `/metrics` endpoint with bounded labels defined in `METRICS.md`.
- [ ] Keep Prometheus deployment optional until historical metrics, alerting, or dashboard requirements justify it.


## Initial foundation implementation record

The initial application scaffold is committed: React/Vite web app, Fastify API, PostgreSQL Compose service, initial SQL migration, Dockerfiles, local-only web exposure, Docker-secret API-key mount, strict HTTPS client, fixed allowlist for the eight previously verified GET endpoints, per-operation poll records, health/readiness endpoints, Prometheus-format metrics, and CI workflow. The first UI can trigger a read-only collection and show the result. ARP rows and individual firewall state rows are reduced to aggregate counts and are not persisted.

This remains a development release, not a production security sign-off. Manager authentication and multi-firewall onboarding are implemented. The initial environment-configured firewall and additional database-registered firewalls use different credential paths. Per-device TLS certificate discovery and TLS server-name support are implemented, and the user has reported a successful local connection test. The second CE firewall's live compatibility, expanded automated test coverage, complete security review, audit event implementation, backup/restore testing, credential rotation/recovery, scheduled polling, and full monitoring pages remain outstanding. No pfSense configuration-write API, shell execution, reboot, halt, apply, or arbitrary upstream proxy is implemented.

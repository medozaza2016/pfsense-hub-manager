# Roadmap

## Current status

**Current baseline, November 21, 2026:** PR #5 is merged into `main`. The responsive UI foundation and manager administration APIs are present. Managed-device inventory is API-backed, but live firewall connectivity is still configured for one device through environment variables. Multi-site onboarding, per-device credential lifecycle, independent device collection, and scheduled polling remain unimplemented. This is a development baseline, not a production release.

## Frontend design foundation, November 21, 2026

This is a separate UI implementation milestone, not completion of the live-data dashboard milestone below.

- [x] Implement the approved Hub and Site workspace visual structure.
- [x] Implement responsive sidebar, mobile drawer, and mobile bottom navigation.
- [x] Implement the Hub and Site navigation surfaces and local preview interactions.
- [x] Simplify Hub Overview site rows to one primary Open Site/Details action.
- [x] Make the Site navigation sidebar vertically scrollable.
- [x] Run local Windows typecheck, API tests, and production build after the latest branch pull (November 21, 2026).
- [ ] Validate desktop and mobile layouts against the approved mockup in a running browser.
- [ ] Replace local demonstration fixtures with database-backed site inventory and verified API state.

**Data boundary:** The current redesigned frontend is still a mockup/preview. The API and PostgreSQL foundation exist on `main`, but the current API is configured for one firewall through environment variables. Multi-site onboarding, per-site credential storage, and live-data UI integration are not complete. See [Frontend Implementation](FRONTEND-IMPLEMENTATION.md) for the ordered implementation plan and security gates.

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

This is not a production release. The manager has no user login or role model yet. Only one firewall is configured through environment variables. The live TLS trust chain, Compose build on the LXC, API response compatibility, and CI run must be verified before calling the foundation operational. No write API, shell execution, reboot, halt, apply, or arbitrary upstream proxy is implemented.


## Hub system monitoring and recovery, approved November 21, 2026

**Scope:** Administration-only operational controls for the pfSense Hub Manager Compose stack on its dedicated host. This does not turn the product into a general-purpose Docker manager and does not manage unrelated containers.

### Initial delivery
- [ ] Show host CPU, memory, and disk usage where reliable host-side telemetry is available.
- [ ] Show status and health for Web, API, PostgreSQL, and Code Server, including uptime and last health-check result where available.
- [ ] Provide bounded, sanitized per-service log viewing.
- [ ] Provide individual service start, stop, and restart operations.
- [ ] Provide whole-stack start, stop, and restart operations.
- [ ] Provide Docker Compose configuration validation without applying changes.
- [ ] Record operator, requested action, target, timestamp, outcome, and sanitized error in an operations history.
- [ ] Add explicit confirmation for stopping the stack and other disruptive operations.
- [ ] Document host-side recovery because stopping/downing the stack also stops the management GUI.

### Security and lifecycle constraints
- Use a narrowly scoped host-side management boundary that permits only predefined actions against this project's Compose file/project name.
- Never mount the Docker socket into the web or API containers, and never expose arbitrary command execution or arbitrary Compose arguments.
- Never remove named or anonymous volumes as part of routine stop, restart, or recovery actions. Database data must persist.
- Keep rebuild, recreate, image update, volume operations, database restore, and management of unrelated containers out of the initial release. Review them separately before implementation.
- Distinguish a successful command submission from confirmed service health. Refresh runtime state after every operation and report partial failures.

This is an approved product scope, not an implemented feature. Implementation and host-runtime validation remain pending.


### System Monitoring and Recovery implementation sequence, November 21, 2026

- [x] Approve the four-service monitoring scope and fixed-project boundary (DEC-026).
- [x] Approve `admin` and `user` visibility/operation permissions (DEC-027).
- [x] Add database-backed `admin` / `user` roles. The additive migration defaults existing accounts to `admin` and includes the session schema.
- [x] Include the database role in authenticated session, setup, and login responses.
- [x] Add a Fastify pre-handler that returns 401 for unauthenticated requests and 403 for non-admin requests under the reserved system-operations and user-management API paths.
- [x] Add unit coverage for admin allow, regular-user 403, and unauthenticated 401 decisions.
- [x] Run API typecheck and source unit tests on Windows (November 21, 2026, 19 tests passed). Migration validation against both a fresh database and a copy of the existing database remains pending.
- [ ] Add integration tests that exercise the Fastify pre-handler and last-admin protection.
- [ ] Add safe user provisioning/role management and last-admin protection.
- [ ] Add read-only monitoring contracts and bounded sanitized logs.
- [ ] Implement and review the restricted cross-platform host-side management agent.
- [ ] Add individual and stack operations only after agent boundary, confirmation, audit, and host recovery tests pass.
- [ ] Add the Administration UI, preserving the approved design; keep controls visible but disabled for regular users.
- [ ] Validate on Windows 11 with Docker Desktop and Linux production deployment separately.

**Gate:** No Docker operation endpoint or UI action may be enabled until role enforcement and the host-agent security boundary are tested. Host resource metrics must come from reliable host-side telemetry, not be inferred from container process metrics.

## Database persistence and recovery architecture, approved November 21, 2026

**Status:** Approved design direction. This is a planned future implementation phase, not implemented functionality. The current Windows Docker Desktop database remains a separate, newly initialized local database. This decision does not migrate or recover any earlier database.

### Design decisions
- Treat application containers and the application installation directory as replaceable. Rebuilding or moving the application must not destroy application data.
- Keep the live PostgreSQL data on reliable persistent storage independent of the application container lifecycle. Do not place PostgreSQL's live data directory on an ordinary NAS network share as a bind mount.
- Support a standard installation using a Docker-managed persistent volume, with an advanced option for a dedicated local database directory where the host platform supports it safely.
- Keep the NAS and/or cloud as independent backup destinations, not as the default live PostgreSQL data directory. Evaluate a PostgreSQL service running directly on capable NAS hardware only as a separately validated deployment option.
- Keep the database connection configurable so a future deployment can use an independently hosted PostgreSQL service without changing application behavior.
- Keep application files, live database storage, and backup storage as distinct locations. The installer should provide safe defaults and avoid requiring ordinary users to understand Docker storage internals.

### Onboarding and lifecycle requirements
- [ ] Onboarding selects or confirms the application installation directory and configures persistent database storage automatically using a platform-appropriate default.
- [ ] Offer an advanced database-directory override where supported, with validation of path, permissions, available capacity, and storage suitability.
- [ ] Generate and protect database credentials; do not expose them to the browser or commit them to source control.
- [ ] Detect an existing database directory or initialized database before initialization. Never silently initialize, overwrite, or replace existing data; stop and require an explicit recovery or migration decision.
- [ ] Make routine stop, restart, rebuild, and upgrade operations preserve database storage. Never include volume deletion in routine lifecycle commands.
- [ ] Clearly warn that destructive volume-removal commands (including `docker compose down -v`) can delete persistent data.
- [ ] Back up the database before schema-changing upgrades and provide a documented restore workflow.

### Backup and recovery requirements
- [ ] Provide scheduled automated PostgreSQL backups to storage independent of the application container and live database volume.
- [ ] Support NAS backup storage and an optional off-site cloud destination, with encryption, retention settings, and backup-failure reporting.
- [ ] Define and document backup frequency, retention, credential/key recovery, and restore-point expectations before release.
- [ ] Verify backup integrity and test restoration into a separate database before declaring the recovery workflow complete.
- [ ] Evaluate WAL archiving / point-in-time recovery against the required recovery-point and recovery-time objectives; do not claim point-in-time recovery until implemented and tested.
- [ ] Document migration to a replacement server: install the application, connect to an existing external database or restore a verified backup, then validate the existing administrator and application records.

### Implementation sequence and release gate
1. Finalize the PostgreSQL lifecycle, migration, backup, retention, and recovery design.
2. Implement persistent storage defaults and safe existing-data detection in the onboarding/install scripts and Compose configuration.
3. Implement backup-before-upgrade, scheduled backup, retention, encryption, and failure reporting.
4. Implement restore and replacement-server procedures, including credential/key recovery.
5. Test clean installation, ordinary container recreation, application upgrade, host replacement, interrupted backup, and restoration from NAS/off-site backup.
6. Update installation, administration, and disaster-recovery documentation.

**Release gate:** Do not call database persistence/recovery complete until automated tests and a documented restore drill demonstrate that application containers can be rebuilt or replaced without losing the database, and that a backup can restore the application state on a replacement host. This work is intentionally deferred to a later development phase; do not interrupt the current frontend validation and real-data integration sequence to implement it now.



## Manager administration phase, November 2026

- [x] Add migration for account activation state, append-only audit events, and persisted alert lifecycle.
- [x] Add audit metadata sanitization and centralized audit persistence service.
- [x] Add administrator-only user listing, creation, role changes, activation/deactivation, password reset API, last-active-admin protection, and session revocation.
- [x] Reject sessions for disabled accounts.
- [x] Add audit API and record authentication, access-denied, user administration, Hub settings, and alert lifecycle events.
- [x] Add deduplicated critical/warning alerts for firewall polling failures and automatic resolution after recovery.
- [x] Replace User Management, Audit Logs, and Alerts fixture content with API-backed views.
- [x] Add service-level tests for metadata sanitization and alert deduplication.
- [ ] Run API tests, typecheck, production build, migration validation, and Compose build in CI.
- [ ] Verify administrator and regular-user behavior in the Windows Docker environment.
- [ ] Define audit/alert retention, backup, and restore policy before production release.
- [ ] Implement and verify an external notification delivery channel only when one is selected and configured.

**Scope note:** This phase does not make the overall dashboard live. Other Hub and Site pages still contain preview data. The alert producer currently uses the existing firewall polling endpoint, which runs when the device overview is requested; it is not a background polling scheduler.


## Development closeout and next baseline, November 21, 2026

The implementation and documentation closeout were merged through [PR #5](https://github.com/medozaza2016/pfsense-hub-manager/pull/5) into `main` on November 21, 2026. The merge commit is `12bf57733aab1f654a2819639b3a16887ac62bb4`. The feature branch was 98 commits ahead of `main` immediately before merge. Upcoming work must start from an updated local `main`; do not continue feature work on the merged feature branch.

### Completed in this implementation increment
- [x] Add shared frontend UI components for searchable tables, search fields, list toolbars, expandable filters, pagination, and responsive mobile cards.
- [x] Apply the shared components to site inventory and administration views, including mobile-friendly user, audit, and alert records.
- [x] Add a global toast provider and use it for operation feedback.
- [x] Complete API-backed user management, audit log, and alert screens, backed by the account/alert/audit persistence and authorization work described in DEC-028.
- [x] Add a development-only transactional/idempotent seed command and sample dataset, with migration support.
- [x] Confirm the feature branch and origin branch point to the same commit.
- [x] Diagnose the recent UI discrepancy: the running Docker web container was using an older image. Rebuilding the web service loaded the current source and restored the expected shared UI, search/filter behavior, and mobile presentation.

### Merge gate
- [ ] Finish this documentation update on the feature branch.
- [ ] Run final local typecheck, API tests, production build, `docker compose config`, and a clean `docker compose up -d --build` on the final branch head. Record exact results and any skipped checks.
- [ ] Inspect the pull-request diff for secrets, generated artifacts, accidental environment files, and unrelated changes.
- [ ] Open and review a PR from `feature/development-seed-data` to `main`; resolve any merge conflicts before merging.
- [ ] Merge only after the PR is mergeable and final checks pass.
- [ ] On Windows, switch to `main`, fetch and pull the merge, verify a clean working tree, and confirm the local branch is tracking `origin/main`.
- [ ] Retire the feature branch after successful merge if no longer needed.

### Next development sequence on main
1. Verify the merged application from a clean local Docker rebuild and exercise the current UI at desktop and mobile widths.
2. Close remaining role/access-control and seed-data verification gaps, including migration validation and last-active-admin protections.
3. Continue the live-data path: database-backed site inventory, per-site configuration/credential lifecycle, connection testing, and per-device compatibility/capability state.
4. Implement a real background polling scheduler with bounded concurrency, retries/backoff, and independent per-device outcomes before treating alerts as continuously monitored.
5. Complete secure TLS trust for the first Plus firewall and record the exact REST API package version; defer the CE firewall until explicitly ready.
6. Define audit/alert retention and database backup/restore, then perform a restore drill.
7. Only after read-only integration is reliable, plan configuration write workflows with capability gating, preview, explicit confirmation, rollback/recovery, and audit verification.

**Do not mark the product production-ready.** A working local UI and passing unit tests do not prove production deployment, multi-device operation, background monitoring, or safe firewall configuration management.


## Current main baseline and next milestone, November 21, 2026

This section is authoritative for work starting from the current `main` branch. Earlier implementation records in this file are retained as historical records; where they describe pre-merge branch instructions or earlier status, this section supersedes them.

### Repository and workflow baseline

- [x] Merge PR #5 into `main`.
- [x] Synchronize the user's Windows working copy with `origin/main`; the user reported a clean working tree at `fa2d524d746213972b1c085f8737d427b134b012`.
- [x] Confirm Windows 11, VS Code, and Docker Desktop as the local development environment.
- [x] Retain Linux deployment on the existing Proxmox LXC as the intended production direction.
- [x] Complete and review this documentation baseline on `main`.
- [ ] After documentation completion, obtain the user's authorization and create a dedicated development branch for the multi-site implementation.
- [ ] Do not create, switch, or delete any branch without explicit user authorization.

### Current implementation truth

- [x] Shared frontend tables, search, filters, pagination, responsive record cards, and toast notifications are merged.
- [x] User Management, Audit Logs, and Alerts are backed by the manager API and PostgreSQL.
- [x] Hub inventory screens load managed-device inventory from the manager API.
- [ ] Replace the single environment-configured live firewall with a database-backed multi-device connection lifecycle.
- [ ] Integrate encrypted per-device credentials with onboarding and provider selection.
- [ ] Implement per-device connection tests and compatibility state.
- [ ] Replace remaining firewall preview fixtures only when matching read-only API contracts and verified device capabilities exist.
- [ ] Implement independent background polling with bounded concurrency, retries/backoff, and per-device outcomes.
- [ ] Complete verified TLS trust and record the exact installed REST API package version for the first Plus firewall.
- [ ] Define and test retention, backup, and restore before production use.

### Next milestone: secure multi-site onboarding

The next implementation milestone is documented in [Multi-site Onboarding Implementation Plan](MULTI-SITE-ONBOARDING-PLAN.md). Its objective is to make a firewall a first-class managed device, rather than a database row that cannot independently connect.

The milestone sequence is:

1. Review the existing device schema, migrations, encryption helper, provider, and API contracts.
2. Implement authenticated and authorized device registration and lifecycle APIs, with encrypted credentials and strict input validation.
3. Refactor the provider so each real device has its own connection configuration, API credential, TLS trust configuration, and capability result.
4. Add administrator GUI workflows for adding a site, editing non-secret connection details, entering or rotating credentials, enabling/disabling a device, and testing connectivity.
5. Verify that failures on one device do not affect another, that secrets never reach the browser or logs, and that demo records cannot be treated as real devices.
6. Update integration status and frontend documentation with exact test results and remaining gaps.

### Explicit non-goals for this milestone

- No firewall configuration writes.
- No arbitrary upstream API proxy or user-supplied API paths.
- No shell execution or Docker socket access from application containers.
- No automatic selection of a firewall-to-hub transport. That decision remains deferred.
- No connection of the second CE firewall until the user is ready.
- No claim of continuous monitoring until the scheduler is implemented and tested.
- No production-ready claim.

### Verification gate

Before merging the implementation branch, run API tests, web and API typechecks, production builds, migration tests against a fresh database and an existing-data copy, `docker compose config`, and a full local Compose rebuild. Exercise the onboarding and connection-test flows in the browser. Verify credential encryption/decryption, key failure behavior, authorization, TLS validation, multi-device isolation, audit coverage, and no secret leakage. Record the actual command outputs and do not mark skipped checks as passed.

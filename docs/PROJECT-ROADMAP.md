# Project Roadmap and Session Handoff

**Product:** pfSense Hub Manager  
**Canonical tracking document:** `docs/PROJECT-ROADMAP.md`  
**Active branch:** `feature/installation-onboarding`  
**Last updated:** 2026-11-21  
**Status:** Persisted firewall connection lifecycle implementation passed Windows tests, type checks, production builds, and Docker Compose rebuild/startup

This is the authoritative cross-session project tracker. At the end of every meaningful development session, update this document before stopping. A new chat should read this file first, then `AGENTS.md`, `docs/DECISIONS.md`, and the phase-specific documents linked below. Do not rely on chat history as the project record.

---

## 1. Product vision

Build a secure, centralized, one-stop management and configuration platform for multiple pfSense Plus and pfSense CE firewalls.

The operator should be able to manage supported firewalls from one application without repeatedly opening each firewall's WebConfigurator. The manager should eventually cover the supported configuration lifecycle, including discovery, viewing, creating, editing, validating, applying, monitoring, auditing, backup, and recovery of firewall configuration.

The application must be capability-aware. pfSense edition, release, installed REST API package version, hardware architecture, and endpoint availability can differ. A feature is enabled only when it is implemented, authorized, and verified for the target device.

**Important product boundary:** “Full control” means comprehensive, explicitly implemented management through supported and verified APIs. It does not mean arbitrary shell access, an unrestricted API proxy, or blindly exposing every upstream OpenAPI operation. Reboot, halt, package upgrades, firmware upgrades, firewall apply, and other disruptive actions require separate risk review and explicit approval. No such operation is implicitly authorized by this roadmap.

## 2. How to use this document between sessions

At the start of a new chat:
1. Open this file and read **Current position**, **Next action**, and **Session handoff**.
2. Read `AGENTS.md` for mandatory engineering and security rules.
3. Read `docs/DECISIONS.md` before changing architecture or scope.
4. Read the relevant phase acceptance criteria and linked technical document.
5. Inspect the actual branch and working tree before editing. Never assume the previous chat's code state is still current.

At the end of a session:
1. Update completed, in-progress, blocked, and deferred checklist items.
2. Update **Current position**, **Next action**, and **Session handoff** with exact commands/results and the latest commit SHA.
3. Record new architecture choices in `docs/DECISIONS.md`, then link the decision here.
4. Update `PRD.md`, `ARCHITECTURE.md`, `SECURITY.md`, `API-SPECIFICATION.md`, `INTEGRATION-STATUS.md`, and/or `DEPLOYMENT.md` when their subject changes.
5. Do not mark a feature complete merely because code was written. Completion requires implementation, appropriate tests, documentation, and a recorded validation result.
6. Do not start CI unless specifically required or approved. Prefer local/manual validation with the user.

Status meanings:
- [x] Implemented and validated to the level stated.
- [~] Implemented but validation or documentation is incomplete.
- [ ] Not implemented.
- [!] Blocked or requires an explicit decision.
- [D] Deliberately deferred.

## 3. Current position (2026-11-21)

### Confirmed implemented
- [x] React + TypeScript + Vite frontend, Fastify + TypeScript backend, PostgreSQL, Docker Compose.
- [x] Windows 11 local development setup is running in Docker Compose.
- [x] First-run administrator bootstrap, login/logout, Admin and User roles, database-backed sessions, server-side authorization.
- [x] Multi-firewall registration and inventory, with admin-only connection testing and registration.
- [x] Additional firewall API credentials encrypted in PostgreSQL with AES-256-GCM, using a separate 32-byte key mounted as a Docker secret.
- [x] Per-firewall CA certificate and TLS server-name configuration.
- [x] TLS certificate discovery during onboarding. Discovery inspects the presented certificate; it does not automatically trust it.
- [x] Fixed allowlist of eight initial read-only pfSense GET operations.
- [x] User-triggered per-device read-only checks and overview collection.
- [x] Inventory metadata editing, enable/disable, and confirmation-based removal of eligible additional devices. The environment-configured primary device is protected from deletion.
- [x] Responsive dashboard shell, sidebar hierarchy, user administration, firewall inventory, and placeholder navigation areas.
- [x] React Router navigation standard recorded in `AGENTS.md` and DEC-021.
- [x] User reported a successful local firewall connection test and read-only collection.

### Validated local development baseline
- [x] Windows development installer completed successfully, including native Rollup/esbuild verification, dependency audit, type checks, production builds, Docker image builds, and Compose startup (earlier validated session).
- [x] `npm audit`: 0 vulnerabilities (earlier user-reported validation; not rerun in the latest command sequence).
- [x] API tests: 46 tests passed across 7 test files in the latest Windows run (2026-11-21), including persisted lifecycle status coverage.
- [x] `npm run typecheck`: API and web passed after lifecycle implementation (2026-11-21).
- [x] `npm run build`: API and web production builds passed after lifecycle implementation (2026-11-21). Vite emitted two non-fatal React Router `use client` directive warnings.
- [x] Latest Windows validation was run after pulling the lifecycle test fixes and roadmap update; exact local HEAD and working-tree state were not included in the user's validation output.
- [x] `docker compose up -d --build` completed successfully after lifecycle implementation; database and API reported healthy, web container started. The output did not show the web container's health status.
- [x] User reports the application acceptance check passed (earlier validation).
- [x] The npm workspace `package-lock.json` is tracked in the repository; the old untracked-lockfile note is obsolete.
- [x] The injectable Fastify app factory and separated runtime bootstrap compile and pass the latest tests.

### Remaining foundation work
- [x] UI refresh accepted by the user: persistent non-collapsible desktop navigation, simplified firewall links, refined inventory layout, page/card/detail/dialog motion, and reduced-motion support committed. A fresh local build after these changes is still pending.
- [x] Add route-level coverage for device registration, metadata updates, credential rotation, authorization, primary-device protection, and relevant error paths.
- [x] Add provider and route tests for credential revalidation, TLS CA/server-name propagation, certificate discovery metadata, and invalid non-HTTPS discovery input.
- [ ] Review the non-fatal React Router build warnings only if a compatible, low-risk fix is identified; they do not currently fail the build.
- [~] Continue reconciling older documentation with the current implementation and validation evidence.

### Not yet completed
- [ ] Full monitoring pages and useful normalized per-firewall detail views.
- [ ] Automatic/scheduled polling, concurrency controls, backoff, and stale-data behavior.
- [ ] Full Plus/CE/API-package compatibility evidence.
- [ ] Additional verified read-only API capabilities beyond the initial eight endpoints.
- [ ] Configuration backup and restore workflow, with tested recovery.
- [ ] Durable audit trail for privileged and configuration-changing actions.
- [ ] Safe configuration-change engine and first write-capable feature.
- [ ] Full firewall configuration domains.
- [ ] Production security review, deployment validation on the target Proxmox LXC, and operational runbooks.

### Environment and safety facts to preserve
- Local Windows project path: `C:\Users\ahmed\Desktop\Projects\pfsense-hub-manager`.
- Active branch: `feature/installation-onboarding`.
- Initial Plus firewall address: `https://172.10.50.1:10443`.
- Branch LAN: `172.10.50.0/24`, reached from the workstation through Tailscale subnet routing via the Branch Synology.
- The user intentionally retains the existing `172.10.x.x` addressing.
- The initial firewall connection test succeeded through Tailscale and TLS/API validation.
- Do not modify the production LXC while developing on Windows.
- Preserve local `compose.yaml` changes and untracked `certs/pfsense-ca.pem`.
- Preserve `secrets/device_credentials_key`, `secrets/pfsense_api_key`, `.env`, PostgreSQL volume `postgres_data`, and all user data. Never regenerate keys or delete/reset volumes without explicit approval.
- Do not run destructive Git commands or discard local changes.
- User preference: no CI unless needed. User can run local commands and provide results.

## 4. Product phases and acceptance criteria

The phases are ordered. A phase may overlap with documentation or design work, but do not skip its safety gate.

### Phase 0, Product governance and continuity
**Status: [~] In progress**

- [x] Establish this canonical roadmap and session-handoff document.
- [x] Establish repository-wide agent instructions and frontend routing standard.
- [ ] Review and remove contradictions in older documentation; make this document the single roadmap source.
- [ ] Add a lightweight release/versioning and changelog convention.
- [ ] Ensure every session ends with an updated handoff record.

**Exit gate:** A new chat can identify the active branch, current validated state, exact next task, constraints, and remaining phases from repository documentation alone.

### Phase 1, Stabilize the current foundation
**Status: [~] In progress**

- [x] Local Windows Docker Compose application startup.
- [x] Manager authentication and server-side role enforcement.
- [x] Multi-device onboarding and encrypted credential storage.
- [x] TLS certificate discovery and configurable server identity.
- [x] React Router adoption.
- [x] Run local frontend and API type checks and production builds after routing/dependency changes.
- [x] Run API tests: 29 tests passed across 7 test files, including provider and route authorization coverage.
- [x] Run `npm audit`: 0 vulnerabilities.
- [x] Complete Windows development installer, Docker image builds, and Compose startup.
- [x] User reports the application acceptance check passed; all three Compose services are healthy.
- [x] npm workspace lockfile committed and retained.
- [x] Add provider tests for registration/connectivity, credential encryption behavior, TLS verification failure, device listing, and protected primary-device deletion.
- [x] Extract injectable Fastify app factory and add six route authentication/authorization tests.
- [x] Add route tests for device registration, metadata updates, credential rotation, admin authorization, and primary-device protection.
- [x] Add route/provider boundary tests for TLS trust configuration, CA and TLS server-name propagation, certificate metadata discovery, and invalid URL handling.
- [x] Validate 42 tests across 7 files, API/web type checks, and API/web production builds on Windows 11.

**Exit gate:** Clean local build and documented manual acceptance test, without data loss or CI requirement.

### Phase 2, Device lifecycle and compatibility foundation
**Status: [~] Partially implemented**

- [x] Multi-device data model and registration.
- [x] Independent per-device API credential encryption.
- [x] Per-device CA and TLS server-name support.
- [x] Certificate inspection/discovery during onboarding.
- [x] Persist device connection lifecycle state independently from the enabled/disabled setting, including last checked, last fully successful check, and classified error. Windows validation passed: 46 tests across 7 files, API/web typechecks, API/web production builds, Docker image builds, database/API healthy, web started (2026-11-21).
- [D] Select a transport-specific connection profile until the firewall-to-manager transport decision in DEC-010 is approved.
- [~] Backend credential replacement/rotation route implemented for additional devices, with read-only connection re-test before encrypted credentials and TLS settings are persisted; primary-device rotation remains installation-secret managed.
- [~] Frontend credential/TLS editor implemented for additional devices: replacement API key, optional CA PEM import/paste or explicit clear, TLS server-name update or explicit clear, read-only revalidation before save, and failure feedback. User visually accepted the editor, file picker, dialog scrolling, and sidebar refinements on 2026-11-21. Latest Windows build validation and live secondary-firewall workflow validation remain pending.
- [ ] Define and document the operational credential rotation/revocation procedure.
- [ ] Record pfSense edition, release, architecture, REST API package version, and verified capability profile per device.
- [ ] Add a compatibility matrix and capability discovery process.
- [ ] Validate CE independently when the user connects the CE firewall.
- [ ] Show per-device capability gaps and explain unsupported features in the UI.

**Exit gate:** Each device has an independently tested connection profile, protected credentials, and a truthful compatibility/capability profile.

### Phase 3, Unified monitoring and operational dashboard
**Status: [ ] Planned**

- [ ] Create dashboard overview across all registered firewalls.
- [ ] Show online/degraded/offline/unknown status with last check and last successful check.
- [ ] Normalize system health, CPU, memory, disk, uptime, and version where supported.
- [ ] Normalize gateways, interfaces, services, and firewall state counts.
- [ ] Add per-firewall detail pages and status history.
- [ ] Add scheduled polling with per-device isolation, bounded concurrency, timeout, retry/backoff, and jitter.
- [ ] Handle stale results and partial outages without presenting stale data as current.
- [ ] Add operator-configurable polling intervals and safe defaults.
- [ ] Add monitoring filters, search, and device/location grouping.
- [ ] Add useful alerts/notifications only after alert criteria and delivery channels are specified.

**Exit gate:** One screen provides a reliable fleet view, with drill-down for every supported read-only operational domain.

### Phase 4, Read-only configuration inventory
**Status: [ ] Planned**

Before changing firewall configuration, build a comprehensive read-only inventory:
- [ ] Firewall rules and rule ordering.
- [ ] Aliases and alias contents, with sensitive values appropriately protected.
- [ ] NAT: port forwards, outbound NAT, 1:1 NAT, and related mappings.
- [ ] Interfaces, assignments, VLANs, bridges, LAGG, and interface status.
- [ ] Routing, gateways, static routes, and policy routing where exposed.
- [ ] DHCP server and static mappings.
- [ ] DNS resolver/forwarder configuration.
- [ ] VPN configuration and peer/tunnel status where supported.
- [ ] Certificates, certificate authorities, and expiration metadata.
- [ ] Users, groups, privileges, and API access metadata, with secrets never displayed.
- [ ] Services and service configuration where safely readable.
- [ ] System settings, firmware/package metadata, and configuration revision metadata.
- [ ] Per-domain capability and schema validation by firewall edition/release/package.
- [ ] Exportable configuration inventory/report with secrets and sensitive values redacted.

**Exit gate:** Operators can inspect the supported configuration of each firewall centrally, without making changes, and can see where devices differ.

### Phase 5, Change safety and configuration transaction foundation
**Status: [ ] Planned, mandatory before writes**

- [ ] Design a typed manager-owned operation model. Never accept arbitrary upstream paths/methods/bodies.
- [ ] Design per-device capability checks and fine-grained authorization.
- [ ] Add durable audit events with actor, target, operation, timestamp, request summary, result, and correlation ID.
- [ ] Design configuration backup before changes, secure storage, retention, and restore verification.
- [ ] Design change preview/diff and validation.
- [ ] Require explicit target firewall and impact confirmation.
- [ ] Add safeguards against management lockout, loss of connectivity, and unsafe rule ordering.
- [ ] Define transaction behavior for multi-step changes, partial failures, and rollback limitations.
- [ ] Add post-apply verification and clear success/partial/failure reporting.
- [ ] Add concurrency control and protection against conflicting edits.
- [ ] Add tests for authorization bypass, stale config, malformed input, interrupted apply, partial apply, and recovery.
- [ ] Document exactly which operations cannot be safely rolled back.

**Exit gate:** Security design, backup/recovery, audit, preview, authorization, and failure handling are implemented and tested before enabling any write endpoint.

### Phase 6, First controlled configuration management release
**Status: [ ] Planned**

Deliver one small domain end-to-end before broad write coverage:
- [ ] Select firewall aliases as the first candidate, subject to API verification and explicit user approval.
- [ ] Implement list/view/create/edit/delete for supported alias types only.
- [ ] Show validation and change preview.
- [ ] Require explicit confirmation naming the target firewall and object.
- [ ] Back up configuration before apply.
- [ ] Apply through fixed, typed, allowlisted API methods.
- [ ] Record audit event and verify resulting configuration.
- [ ] Handle conflicts, unsupported alias types, and partial failure.
- [ ] Add automated tests and Plus/CE compatibility records.

**Exit gate:** One configuration domain is safely manageable end-to-end, with tested backup, audit, authorization, and verification.

### Phase 7, Core firewall policy and NAT management
**Status: [ ] Planned**

- [ ] Firewall rules: list, inspect, create, edit, reorder, enable/disable, delete.
- [ ] Rule validation, interface/direction/protocol/port/address constraints.
- [ ] Alias references and impact analysis.
- [ ] NAT: port forwards, outbound NAT, 1:1 NAT, and associated rule handling.
- [ ] Rule/NAT change preview and risk warnings.
- [ ] Apply/reload behavior only where documented and verified.
- [ ] Post-change verification and rollback guidance.
- [ ] Per-edition capability differences and tests.

**Exit gate:** Common firewall policy and NAT workflows can be managed centrally without relying on direct WebConfigurator access for supported operations.

### Phase 8, Network and service configuration
**Status: [ ] Planned**

- [ ] Interfaces, assignments, VLANs, bridges, LAGG, and interface configuration.
- [ ] Gateways, static routes, routing policy, and failover groups where supported.
- [ ] DHCP scopes, reservations, and related options.
- [ ] DNS resolver/forwarder configuration.
- [ ] Service configuration and safe service lifecycle controls.
- [ ] VPN configuration and peer management where supported.
- [ ] Certificate/CA lifecycle management with private-key protections.
- [ ] Explicit lockout warnings and recovery workflow for management-interface/network changes.
- [ ] Per-operation compatibility and safety tests.

**Exit gate:** Supported network and service configuration can be centrally managed with safeguards for connectivity-impacting changes.

### Phase 9, System administration and advanced operations
**Status: [ ] Planned, each capability separately gated**

- [ ] User/group/privilege administration with least-privilege safeguards.
- [ ] Package inventory and supported package configuration.
- [ ] System settings and time/NTP/DNS settings.
- [ ] Configuration history, diffs, restore points, and recovery workflow.
- [ ] Controlled firmware/package maintenance only after vendor/package support and rollback are established.
- [ ] Reboot/shutdown/service restart only as separate explicitly approved capabilities, with confirmation, scheduling, and out-of-band recovery planning.
- [ ] No arbitrary shell or command execution.

**Exit gate:** Each advanced operation has its own risk classification, API verification, authorization, backup/recovery, audit, and explicit approval.

### Phase 10, Fleet operations and enterprise hardening
**Status: [ ] Planned**

- [ ] Fleet-wide search, grouping, tagging, and bulk read-only operations.
- [ ] Safe staged bulk changes with per-device previews and independent results.
- [ ] Role/permission granularity, optional MFA/SSO, and administrator recovery.
- [ ] Persistent distributed rate limiting and session management hardening.
- [ ] Tamper-evident audit retention and export.
- [ ] Backup automation, restore drills, encryption, and retention controls.
- [ ] Monitoring alerts, notification integrations, and maintenance windows.
- [ ] Operational health, metrics, logs, and support bundles with secret redaction.
- [ ] Upgrade/migration procedures and disaster recovery runbooks.

**Exit gate:** The manager is supportable as a long-running multi-site operational platform.

### Phase 11, Production release
**Status: [ ] Planned**

- [ ] Complete threat model and independent security review.
- [ ] Verify all supported API capabilities against actual Plus and CE versions.
- [ ] Complete backup/restore and upgrade rehearsal.
- [ ] Harden ingress, TLS, secrets, access, session cookies, and network policy.
- [ ] Define supported version matrix, release policy, and deprecation policy.
- [ ] Document installation, upgrade, rollback, backup, restore, and disaster recovery.
- [ ] Define production acceptance criteria, monitoring, alerting, and incident response.
- [ ] Release only after all critical security and recovery gates pass.

**Exit gate:** A documented, tested production release with clear support boundaries.

## 5. Feature-domain coverage register

This register prevents feature areas from disappearing between phases. Each domain must eventually track: read support, write support, capability detection, UI, authorization, audit, backup/recovery, automated tests, and Plus/CE compatibility.

| Domain | Read inventory | Write/configure | Planned phase |
|---|---|---|---|
| Device inventory and connectivity | [x] | [~] metadata/lifecycle only | 2 |
| System health and status | [~] initial endpoints | [ ] | 3 |
| Gateways and interfaces status | [~] initial endpoints | [ ] | 3 |
| Services and firewall states | [~] aggregate/limited | [ ] | 3 |
| Firewall rules | [ ] | [ ] | 4, 7 |
| Aliases | [ ] | [ ] | 4, 6 |
| NAT | [ ] | [ ] | 4, 7 |
| Interfaces, VLANs, bridges, LAGG | [ ] | [ ] | 4, 8 |
| Gateways, routes, policy routing | [ ] | [ ] | 4, 8 |
| DHCP and static mappings | [ ] | [ ] | 4, 8 |
| DNS resolver/forwarder | [ ] | [ ] | 4, 8 |
| VPNs and peers | [ ] | [ ] | 4, 8 |
| Certificates and CAs | [ ] | [ ] | 4, 8 |
| Users, groups, privileges | [ ] | [ ] | 4, 9 |
| Packages and system settings | [ ] | [ ] | 4, 9 |
| Configuration backup, diff, restore | [ ] | [ ] | 5, 10 |
| Audit and change history | [ ] | [ ] | 5, 10 |
| Firmware/package maintenance | [ ] | [ ] | 9, separately gated |
| Reboot/shutdown/service restart | [ ] | [ ] | 9, separately gated |

Status [~] means partial support only, not complete domain coverage.

## 6. Mandatory feature completion definition

A feature is not complete when the UI button appears or the backend route compiles. Mark it complete only when all applicable items are true:
1. Requirement and scope recorded in PRD and this roadmap.
2. Architecture/security decision recorded where needed.
3. Exact upstream API endpoint, method, schema, package/release compatibility verified.
4. Backend typed operation and strict allowlist implemented.
5. Server-side authorization and per-device capability enforcement implemented.
6. Frontend workflow and clear unsupported/error states implemented.
7. Audit, backup/recovery, preview, and confirmation implemented for writes.
8. Automated tests cover success, denied access, malformed response, timeout, and relevant failure cases.
9. Local build and manual acceptance test completed and recorded.
10. Technical and operator documentation updated.

## 7. Current next action

**Next task: inspect and implement per-device compatibility discovery. Record pfSense edition, release, architecture, REST API package version, and a verified capability profile per device. The transport-specific connection profile remains deferred until DEC-010 is resolved.**

The user has successfully completed the corrected Windows development installer. The installer:
- Recognized the required Windows native Rollup and esbuild packages at their expected versions.
- Reported 0 npm vulnerabilities.
- Passed API and web TypeScript checks.
- Built the API and web production bundles.
- Built both Docker images and started the Compose stack successfully.

The user separately ran and confirmed:
- `npm audit`: 0 vulnerabilities.
- `npm run test --workspace @pfsense-hub/api`: 15 tests passed across 5 files.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Application acceptance check: passed.
- `docker compose ps`: API, database, and web containers all healthy.
- Web is bound to `127.0.0.1:8080`, not exposed on all interfaces.

Latest relevant branch commits:
- `716d33b` (`refactor(api): extract injectable Fastify application`)
- `041b14b` (`refactor(api): keep runtime startup separate from app factory`)
- `24b15b0` (`test(api): cover session and route authorization`)

The user pulled the branch and confirmed it was already up to date before running the latest local checks.

The two Vite React Router `use client` warnings are non-fatal. Do not change dependencies solely to silence them without checking compatibility and necessity.

Commit `ec41fda2e3ab9fda991a8c2961d8788d99051343` was validated locally. The installer removed the obsolete API nested duplicate after verifying the root package name/version, preserved the Vite nested package, and completed audit, typecheck, production builds, Docker image builds, and Compose startup. `npm ls esbuild @esbuild/win32-x64 --all` now reports both expected native packages without an extraneous root package. The subsequent `npm ls --depth=0n` invocation contained a command-line typo (`0n` rather than `0`), producing an npm config warning; the dependency listing itself showed no extraneous package.

**Previous action completed:** Phase 1 route/provider tests for registration, credential rotation, authorization, TLS configuration, and certificate discovery are implemented and recorded above. The user accepted the UI refresh. The Phase 2 frontend credential/TLS editor is committed. A follow-up layout fix now places the inventory form and credential editor inside one scroll container and corrects checkbox sizing. The unified dialog scroll fix is not yet locally validated. A further polish commit themes the native certificate file picker and hides the dialog scrollbar track while preserving wheel, touch, and keyboard scrolling. The latest sidebar refinement prevents horizontal overflow, hides scrollbar chrome, retains vertical scrolling, and keeps the account footer fixed within the sidebar. The user confirmed the dialog and sidebar visual changes are good.

## 8. Session handoff

**Latest user-validated Windows results (2026-11-21, after pulling the lifecycle test fixes):**
- `npm test`: 46 tests passed across 7 test files.
- `npm run typecheck`: API and web passed.
- `npm run build`: API and web production builds passed. Vite emitted two non-fatal React Router `use client` directive warnings.
- `docker compose up -d --build`: both images built; database and API reported healthy; web container started. The output did not show web health status.
- These checks validate the persisted lifecycle implementation at test, typecheck, build, and container startup levels. They do not verify a live secondary firewall or credential rotation against a secondary firewall.

**User acceptance:** The user reviewed and accepted the UI refresh, credential editor layout, and sidebar refinements (2026-11-21).

**Latest implementation commits:**
- `86d3794`: persist connection lifecycle state after read-only collection.
- `fecbba5` and `5f1abbd`: register and add the lifecycle database migration.
- `d002147`: test online, degraded, offline, and inventory status projection.
- `3ce9796`: show persisted lifecycle status in the inventory.
- `de91e79` and `418b614`: preserve camelCase API response fields and cover metadata edits.
- `2df7f63`: mock the primary provider client for lifecycle collection tests.
- `851a5e0`: refresh inventory after credential revalidation.
- `a41cca8`: persistent sidebar navigation and page transition hook.
- `cb96b00`: inventory layout, sidebar styling, and motion.
- `1e946e8`: dialog entrance motion.
- `8837bb8`: frontend credential and TLS editor.
- `01aeeff`: credential form state reset and editor markup correction.
- `e6b8c20`: credential/TLS editor styling.
- `ccf3a82`: clear credential form secrets after editor close.

**Latest layout refinements (2026-11-21):** `c299c91` wraps the inventory form and credential editor in one scrollable dialog body; `3d93fd3` removes nested credential scrolling and fixes checkbox sizing; the CSS commit themes the certificate file picker and hides the dialog scrollbar track without disabling scrolling; the latest sidebar CSS commit prevents horizontal overflow, hides scrollbar chrome, and preserves the pinned account footer. User must pull and run `npm test`, `npm run typecheck`, and `npm run build`, then inspect the Edit firewall dialog at desktop and narrow/mobile widths. Manual credential rotation remains pending until an additional firewall is registered and reachable. Do not attempt primary firewall rotation through this screen. No firewall configuration writes are involved. The new persisted lifecycle fields and frontend display require local validation.

**Lifecycle status implementation (2026-11-21):** Commits `86d3794`, `fecbba5`, and `5f1abbd` add persisted connection status, timestamps, and error classification with migration `005_device_connection_lifecycle.sql`; `d002147` adds provider tests for online, degraded, offline, and inventory projection. Frontend commits `3ce9796`, `4876143`, `56aee68`, and `851a5e0` display persistent status and refresh inventory after checks and credential revalidation. `de91e79` ensures inventory edits return camelCase lifecycle fields, and `418b614` tests that response; `2df7f63` supplies the mocked primary client used by the new collection lifecycle tests. DEC-022 defines the status semantics. The first Windows test run exposed three test-fixture assertion issues, not a production-code failure: collection writes eight poll-history rows before the lifecycle update, and timeout tests must use the provider's typed timeout error. Commit `c74e08b` corrects the assertions and fixtures. The corrected Windows rerun passed all 46 tests, API/web typechecks, API/web production builds, and Docker Compose image build/startup.

**Preserve:** Do not touch production LXC, reset PostgreSQL volumes, regenerate secrets, overwrite local compose/certificate changes, assume the second CE firewall is connected, or enable firewall writes before Phase 5. Keep `package-lock.json` until reviewed. No CI unless explicitly needed and approved.


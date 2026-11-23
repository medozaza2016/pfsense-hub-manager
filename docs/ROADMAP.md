# Roadmap

**Last reconciled:** November 23, 2026  
**Active branch:** `main`  
**Delivery status:** Core multi-site onboarding, unified Linux installation, and Linux Tailscale Hub access deployment are merged into `main`. System Monitoring & Recovery is implemented, live-verified, and locked (DEC-039, DEC-040). The Application Settings page remains an approved visual placeholder whose functional scope is under review. Deferred verification items are listed in the relevant sections below.

This roadmap is the current planning source. For exact command output, test counts, skipped tests, clean-install evidence, and known verification gaps, see [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md).

## 1. Delivered on `main`

### Hub application and manager administration

- [x] React/Vite frontend, Fastify API, PostgreSQL, and Docker Compose application.
- [x] Database-backed manager authentication and session handling.
- [x] `admin` and `user` roles with server-side authorization.
- [x] Administrator user management, role/status changes, session revocation, and last-active-admin protections in the API.
- [x] Append-only audit events with sanitized metadata.
- [x] API-backed User Management, Audit Logs, and Alerts screens.
- [x] Responsive shared table, filters, pagination, mobile cards, and application-wide toast feedback.

### Managed-site onboarding and connection lifecycle

- [x] Hub starts without a registered firewall; no real firewall identity or API credential is required by the normal fresh-install workflow.
- [x] PostgreSQL-backed managed-device profiles with backend-generated UUIDs.
- [x] Per-device AES-256-GCM encrypted API credentials and custom TLS CA trust.
- [x] Optional per-device TLS server name.
- [x] Administrator-only certificate discovery, fingerprint confirmation, pre-registration connection test, and registration.
- [x] Administrator-only profile edit, enable/disable, credential rotation, TLS trust set/remove, explicit connection test, and non-destructive archive.
- [x] Per-device client factory and provider collection using the device's own HTTPS origin, credential, TLS trust, and optional server name.
- [x] Fixed read-only allowlist of eight pfSense GET operations. No firewall configuration writes or generic upstream proxy.

### Linux installation and Hub access deployment

- [x] One first-install entry point, `scripts/install-linux.sh`, provisions the Hub and standard Host Agent.
- [x] Installer generates PostgreSQL password, application encryption key, and Host Agent token; protects secrets; and requires confirmation that the recovery copy was saved.
- [x] Installer invokes the Host Agent maintenance installer internally, enables the systemd service, and verifies service/socket readiness.
- [x] Installer builds and starts web, API, and PostgreSQL, waits for health, verifies API supplementary group and bearer-authenticated Unix-socket request, then enables `HUB_ACCESS_DEPLOYMENT_ENABLED=true`.
- [x] Hub Settings supports Local, Tailscale MagicDNS, and Custom methods, with exactly one active method.
- [x] Linux Host Agent supports assigned-interface validation, fixed web-only Compose operations, HTTPS verification, rollback, and the fixed private Tailscale Serve route.
- [x] Hub Settings displays deployment state/history, last verified origin, and phase-specific save-button progress.
- [x] Clean Debian 13 installation completed; all three containers healthy and the API-to-agent handshake verified.
- [x] Application Settings frontend placeholder delivered with the approved General and Preferences cards (DEC-035). Functional workflows remain deferred; the page's necessity and exact functional scope are under review in [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md#necessity-and-scope-evaluation-november-23-2026).
- [x] System Monitoring & Recovery delivered end to end: Host Agent monitoring and allowlisted operations, API routes, audit trail, live-wired page, and the Hub mobile **System monitoring** tab (DEC-039, DEC-040). Scope locked in [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md) section 10.
- [x] Tailscale MagicDNS endpoint successfully applied and browser-verified at configuration revision 2 / applied revision 2.

## 2. Verification completed

| Area | Recorded result |
|---|---|
| Windows package install | 196 packages installed; 0 npm audit vulnerabilities |
| Windows API tests | 177 passed, 4 skipped |
| Windows API typecheck | Passed |
| Windows web typecheck | Passed |
| Windows API build | Passed |
| Windows web production build | Passed |
| Linux Host Agent tests | 23 passed |
| Linux installer Bash syntax | Passed for main and Host Agent scripts |
| Docker Compose validation | Passed |
| Existing LXC services | API, web, and PostgreSQL reported healthy |
| Clean Debian 13 installation | All six installer phases completed |
| Installer socket/authentication check | Passed |
| Clean install services | PostgreSQL, API, and web healthy |
| Hub Settings Tailscale browser test | Endpoint verified, revision 2 applied |

Four Windows tests are intentionally skipped by the test file on Windows: they exercise the Unix-domain-socket client. Skipped tests are not passed. The Linux installer performed a real API-to-agent Unix-socket and bearer-authentication handshake.

## 3. Remaining acceptance and hardening

These are real gaps; do not describe them as completed.

### Installation, backup, and recovery

- [ ] Perform a reboot and snapshot-restore drill on the prepared Proxmox LXC.
- [ ] Define and test PostgreSQL backup/restore with the exact matching application encryption key.
- [ ] Test migration from a preserved existing-data copy, including existing device identity, encrypted credentials, poll history, alerts, and audit records.
- [ ] Define retention and disaster-recovery objectives.
- [ ] Design and test application encryption-key rotation. Never replace the current key while encrypted site credentials or TLS trust material exist.

### Firewall compatibility and collection

- [ ] Verify a trusted TLS connection to the first Plus firewall without a certificate-validation bypass.
- [ ] Record the exact installed pfSense REST API package version and confirm release/architecture compatibility.
- [ ] Connect the second pfSense CE firewall when the user is ready.
- [ ] Validate independent operation against two real firewall profiles.
- [ ] Implement a production background polling scheduler, bounded concurrency, retry/backoff, and independent per-device outcomes.
- [ ] Complete continuous alert production and define retention/notification behavior.

### Product experience and data coverage

- [ ] Replace preview fixtures only where a supported, verified read-only API data contract exists.
- [ ] Add server-side pagination/filtering if required by real inventory size.
- [ ] Complete full desktop/mobile comparison against the approved visual reference for all screens.
- [ ] Test the complete role matrix and last-active-admin restrictions manually in the browser.
- [ ] Complete audit/alert retention, export, mute, and notification design.

### Access deployment

- [ ] Perform a real-tailnet failure/rollback drill and verify the previous access address remains usable.
- [ ] Test LAN and Custom with an existing operator-managed trusted TLS reverse proxy.
- [ ] A full Windows `install-windows.ps1` is not implemented. The existing `scripts/setup-encryption-key.ps1` provisions the Windows runtime key only; local startup uses the documented Docker Compose workflow. A Windows host deployment adapter is also not implemented. Windows Docker Desktop exercises the frontend/API without applying production host access settings.

## 4. Explicit non-goals for the current implementation

- No pfSense firewall configuration writes, apply/reboot operations, or broad WebConfigurator privilege expansion.
- No arbitrary upstream API proxy or user-supplied API paths.
- No remote shell, arbitrary host command execution, or Docker socket mount in application containers.
- No automatic installation/authentication of Tailscale, tailnet HTTPS enrollment, ACL/grant changes, DNS changes, Funnel, certificate issuance, or reverse-proxy provisioning.
- No assumption that the eight selected GET operations work on every Plus/CE release or API package version.
- No claim of continuous monitoring until the background scheduler is implemented and tested.
- No production-ready claim.

## 5. Development and delivery workflow

- The current working baseline is `main`, consistent with DEC-029 and DEC-030.
- Create a dedicated feature branch for the next implementation only when authorized. Do not delete existing branches without separate review.
- Hosted CI workflows are not used in the current project workflow. Run local checks and record exact outcomes.
- Windows local validation from the repository root:

```powershell
npm ci
npm test
npm run typecheck
npm run build
```

- Linux Host Agent unit tests:

```bash
python3 -m unittest discover -s host-agent -p 'test_*.py' -v
```

- The production Linux LXC does not need Node.js or npm installed. Docker builds the API and web images.
- Do not run development seed commands against production data.
- Preserve the approved application design and current architecture. Any new firewall write capability requires a separate decision and security/recovery design before implementation.

## Application Settings redesign, November 22, 2026

**Design specification:** [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md)

The approved page scope follows the supplied mockup: one **General** card and one **Preferences** card. The immediate work is the visual redesign and responsive layout. Do not expand this page with System Information, Maintenance, Backup & Restore, or host/Docker administration as part of this increment.

- [x] Document the approved two-card layout, exact labels/descriptions, scope boundaries, and acceptance criteria.
- [x] Implement the Application Settings frontend placeholder with the approved two-card layout, responsive stacking, General actions, and Preferences switches.
- [x] Keep controls clearly preview-only. Local switch state is not persisted or enforced, and the General actions explicitly report that editing/selection is not available yet.
- [ ] Complete browser visual acceptance across desktop, tablet, and mobile viewports.
- [ ] Future phase: implement the Application name edit workflow, including validation, authorization, persistence, and audit behavior.
- [ ] Future phase: implement the Display timezone selection workflow and define timezone behavior for UI timestamps and scheduled jobs.
- [ ] Future phase: define and persist the Hub application name and timezone behavior.
- [ ] Future phase: design and implement the Hub-wide polling policy, scheduler, interval, concurrency, retries, and relationship to per-site polling enablement.
- [ ] Future phase: design and implement email notification events, recipients, provider configuration, secret handling, retries, and delivery history.
- [ ] Future phase: define consequential actions and enforce confirmation policy at the backend/API boundary.
- [ ] Future phase: define settings authorization, persistence, validation, audit requirements, and automated tests.

**Implementation boundary:** This documentation/design milestone does not add API routes, database migrations, scheduler jobs, email delivery, or backend security enforcement. Functional wiring is explicitly deferred to the future items above.


## System Monitoring & Recovery, delivered November 22, 2026 and locked November 23, 2026

**Design and requirements:** [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md), DEC-026, DEC-027, and DEC-039.

**Delivery:** Frontend structure merged through [PR #10](https://github.com/medozaza2016/pfsense-hub-manager/pull/10) (squash commit `9a55bfc4c7e5e165b16881f752232168558fcae6`). The live backend, Host Agent protocol v2 surface, API routes, audit trail, and wired page were implemented and committed as `eb008f5`, verified live as recorded in `eb4f5aa`, and the mobile navigation entry was changed in `20cc109`.

The Administration page is routed at `/settings/system-recovery` and appears as **System Monitoring & Recovery** in the Administration navigation and as **System monitoring** in the Hub mobile bottom bar (DEC-040). It is no longer a placeholder: host metrics, service health, bounded logs, Compose validation, operation history, and allowlisted service/stack operations are served by `apps/api` through the restricted Unix-socket Host Agent. Both feature flags default to `false`, so an installation that does not enable them is unchanged.

Delivered and verified UI sections:

- [x] Dedicated Administration navigation item and route, separate from Application Settings and site-level Monitoring.
- [x] Host resources: CPU, memory, disk, and host uptime cards fed by `GET /api/v1/system/status`; unreadable metrics render as unknown rather than as a fabricated value.
- [x] Docker Compose service health for Web, API, and PostgreSQL from the same status response, including absent, unhealthy, and unknown containers.
- [x] Start, Stop, and Restart controls per service, disabled for non-admins and while an operation is active, backed by `POST /api/v1/system/operations`.
- [x] Service logs panel with a fixed service selector, line-count selector, and refresh, backed by the bounded and redacted logs route.
- [x] Compose configuration validation panel backed by `POST /api/v1/system/compose/validate` for the fixed project file only.
- [x] Whole-stack Start, Stop, and Restart with the same controls; Stop requires a typed confirmation phrase.
- [x] Operation history journal with polling while an operation is active.
- [x] Recovery guidance describing host access, project inspection, stack restoration, and post-recovery verification.
- [x] Visible warning that stopping the stack makes the GUI unavailable and recovery must be performed from the host.
- [x] Explicit exclusion of browser-based code-server from the service allowlist.
- [x] Visible access-model note: authenticated admin and user accounts may view status; operational controls are admin-only and enforced server-side.
- [x] Responsive presentation styles for narrower screens.

**Verification status:** API typecheck and build, 275 API tests, 64 Host Agent tests, and the web production build pass for `eb008f5`. Live on the Ubuntu Docker host: `system.status`, `system.logs`, `compose.validate`, unknown-operation and unsupported-action rejection, migration 015, unauthenticated `401` responses, a browser session polling the live agent, and one whole-stack restart that returned all containers to healthy (its attribution is still to be confirmed; see closeout section 13). Exact figures are in [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) sections 12 and 13.

**Locked scope:** see [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md) section 10. Code-server, volume deletion, image update or rebuild, command-prompt execution, and arbitrary host administration remain outside the locked scope.

### Deferred verification, not passed

The implemented scope is locked. The following checks are tracked and not passed; record a result before describing any of them as verified.

- [ ] Observe a single-service `start`, `stop`, or `restart` from the browser. Only a whole-stack `restart` has been exercised live.
- [ ] Perform the stack-stop recovery rehearsal: stop the stack, recover it from a host shell without the GUI, and record the commands and outcome.
- [ ] Complete visual acceptance of the page against the approved mockup at desktop, tablet, and narrow widths. Desktop use of the live page is confirmed; a viewport-by-viewport comparison is not.
- [ ] Run the flow on a production host with the systemd-managed agent (`/etc/pfsense-hub/deployment-agent.json`) rather than the unprivileged development harness.
- [ ] Review any expansion beyond the locked scope separately. Rebuild/recreate, image updates, volume deletion, destructive database maintenance, and broader host management are not part of it.

**Operational boundary:** Enabling either host flag requires recreating the `api` container. Disabling a flag never rolls back an operation that already ran, so the page's host-side recovery guidance remains authoritative.


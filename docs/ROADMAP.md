# Roadmap

**Last reconciled:** November 23, 2026  
**Active branch:** `main`  
**Delivery status:** Core multi-site onboarding, unified Linux installation, and Linux Tailscale Hub access deployment are merged into `main`. System Monitoring & Recovery is implemented, live-verified, and locked (DEC-039, DEC-040). The Application Settings page was retired on November 23, 2026 (DEC-041). Read-only site telemetry from the eight approved endpoints is merged into `main` (DEC-042, `d979354`) and live-verified against the registered Plus firewall. Deferred verification items are listed in the relevant sections below.

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
- [x] Application Settings frontend placeholder delivered with the General and Preferences cards (DEC-035), then retired on November 23, 2026 (DEC-041). No settings workflow was implemented; see [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md#outcome-november-23-2026).
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

The table above is the historical Windows 11 installation record from November 22, 2026. The current Linux baseline is **25 test files / 314 tests passed**, both typechecks and both production builds passing, as recorded in [closeout section 15](VERIFICATION-AND-CLOSEOUT.md#15-site-telemetry-increment-november-23-2026). Do not quote the Windows figures as the current count.

## 3. Remaining acceptance and hardening

These are real gaps; do not describe them as completed.

### 3.1 Next increment in sequence

The queue below is the agreed order. Take the first item whose gate is open; do not start a later item to avoid an open gate.

1. **Background polling scheduler and continuous alert production.** Gate: an approved polling cadence and history-retention decision recorded in `docs/DECISIONS.md` before any code. The parameters and recommended defaults are drafted in [Background polling design proposal](BACKGROUND-POLLING-DESIGN.md) (P-1 to P-10) and are **not approved**. `docs/PRD.md` still lists polling frequency as open, and this roadmap states that continuous monitoring must not be claimed until the scheduler exists. It is the only queued item that closes a documented product requirement (the continuous-polling and last-successful-communication part of FR-4/FR-5, with per-device isolation for FR-2/FR-6) without an external dependency.
2. **Second-device (pfSense CE) comparison.** Gate: the CE firewall is connected. Blocked on the operator, not on engineering.
3. **Exact REST API package version and architecture record.** Gate: a read-only check on the firewall itself; no approved manager endpoint exposes either value, so it cannot be collected through the Hub.
4. **Page-by-page visual acceptance against the approved mockup.** Gate: the mockup image, which is not present in this checkout.
5. **Backup/restore, key rotation, and recovery drills.** Gate: an operator maintenance window on the Proxmox LXC; each drill risks the only existing development data.
6. **Access-deployment failure/rollback drill and LAN/Custom reverse-proxy test.** Gate: a second operator-managed host and a trusted reverse proxy.

Reconciled November 23, 2026: the trusted-TLS verification item that previously led this list is now satisfied and moved to the delivered record below.

### Installation, backup, and recovery

- [ ] Perform a reboot and snapshot-restore drill on the prepared Proxmox LXC.
- [ ] Define and test PostgreSQL backup/restore with the exact matching application encryption key.
- [ ] Test migration from a preserved existing-data copy, including existing device identity, encrypted credentials, poll history, alerts, and audit records.
- [ ] Define retention and disaster-recovery objectives.
- [ ] Design and test application encryption-key rotation. Never replace the current key while encrypted site credentials or TLS trust material exist.

### Firewall compatibility and collection

- [x] Verify a trusted TLS connection to the first Plus firewall without a certificate-validation bypass. Satisfied November 23, 2026 through the manager client rather than a manual test: the registered `pfsense-HOME` profile carries a device-scoped CA bundle (`device_tls_trust`) and a pinned TLS server name, `apps/api/src/pfsense/client.ts` sets `rejectUnauthorized: true` and pins `checkServerIdentity` to that name, and the live eight-operation snapshot authenticated over that connection. The historical `curl -k` diagnostic recorded in [Integration Status](INTEGRATION-STATUS.md) remains historical only and is not the evidence for this item.
- [ ] Record the exact installed pfSense REST API package version and confirm release/architecture compatibility.
- [ ] Connect the second pfSense CE firewall when the user is ready.
- [ ] Validate independent operation against two real firewall profiles.
- [ ] Implement a production background polling scheduler, bounded concurrency, retry/backoff, and independent per-device outcomes. **Next increment; see section 3.1 for the gate.**
- [ ] Complete continuous alert production and define retention/notification behavior. **Follows the scheduler.**

### Product experience and data coverage

- [x] Replace preview fixtures only where a supported, verified read-only API data contract exists. Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility now use the eight-endpoint snapshot (DEC-042); Rules, Aliases, NAT, Routing, DHCP, DNS, Certificates, and VPN remain labeled preview fixtures because no approved endpoint supplies them.
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

## Application Settings page retired, November 23, 2026

**Decision:** [DEC-041](DECISIONS.md#dec-041-retire-the-hub-wide-application-settings-page). **Design record:** [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md).

The Hub-wide Application Settings page is withdrawn. It had no PRD requirement, and each approved row duplicated a capability owned by Hub Settings, the managed-site lifecycle, User Management/Audit Logs, or System Monitoring & Recovery, or described a capability the project explicitly defers.

- [x] Document the two-card layout, exact labels, and acceptance criteria (historical record retained).
- [x] Implement the frontend placeholder and later retire it (DEC-035, then DEC-041).
- [x] Remove the Administration navigation entry, the `app-settings` page identifier, the route-map entry, the placeholder card component, and its local toggle state from `apps/web/src/App.tsx`.
- [x] Remove the page-specific `.app-settings-*` and `.app-setting-row` rules from `apps/web/src/style.css`.
- [x] Remove the same placeholder block from Site Settings, where it presented Hub-wide values as site preferences.
- [x] Redirect `/settings/application` to `/settings/hub` with a history replacement.
- [x] Verify with `npm run typecheck`, `npm run build --workspace @pfsense-hub/web`, and built-bundle inspection.
- [ ] Browser spot check after the web image is rebuilt that no Administration entry or preference switch remains (hard refresh required).

**Not carried forward:** application name and display timezone are unimplemented; if a requirement ever needs them they belong to the Hub configuration surface under FR-13. Per-site polling stays with the managed-site lifecycle (DEC-031), notification delivery remains a deferred release requirement, and confirmation stays an enforced per-action policy (FR-9, DEC-031, DEC-039).

**Boundary:** no API route, database migration, scheduler job, notification provider, authorization rule, or audit event was added, and no setting is persisted or enforced.


## System Monitoring & Recovery, delivered November 22, 2026 and locked November 23, 2026

**Design and requirements:** [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md), DEC-026, DEC-027, and DEC-039.

**Delivery:** Frontend structure merged through [PR #10](https://github.com/medozaza2016/pfsense-hub-manager/pull/10) (squash commit `9a55bfc4c7e5e165b16881f752232168558fcae6`). The live backend, Host Agent protocol v2 surface, API routes, audit trail, and wired page were implemented and committed as `eb008f5`, verified live as recorded in `eb4f5aa`, and the mobile navigation entry was changed in `20cc109`.

The Administration page is routed at `/settings/system-recovery` and appears as **System Monitoring & Recovery** in the Administration navigation and as **System monitoring** in the Hub mobile bottom bar (DEC-040). It is no longer a placeholder: host metrics, service health, bounded logs, Compose validation, operation history, and allowlisted service/stack operations are served by `apps/api` through the restricted Unix-socket Host Agent. Both feature flags default to `false`, so an installation that does not enable them is unchanged.

Delivered and verified UI sections:

- [x] Dedicated Administration navigation item and route, separate from Hub Settings and site-level Monitoring.
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


## Site telemetry increment, November 23, 2026

**Decision:** [DEC-042](DECISIONS.md#dec-042-site-telemetry-from-the-eight-approved-read-only-endpoints). **Design and field mapping:** [API specification](API-SPECIFICATION.md#manager-site-snapshot-contract-november-23-2026).

- [x] One sanitized `GET /api/v1/devices/:deviceId/snapshot` contract for Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility; `/overview` retained as an alias.
- [x] Explicit allowlist parsing so serial numbers, Netgate IDs, MAC addresses, hardware interface names, monitor/source addresses, and counters never enter manager responses.
- [x] Migration `016_device_compatibility.sql` and inventory `release`/`platform`/`compatibility` evidence instead of `release: null`.
- [x] Capability state derived from this device's own `poll_runs`; refusal classes reported as unsupported, transport/schema failures as unknown, no history as unverified.
- [x] In-process snapshot cache (10 s success / 2 s failure, single-flight, 64-device bound) invalidated by profile, credential, TLS trust, enablement, and archival changes.
- [x] 314 API tests, both typechecks, and both builds pass; migration applied on the running development stack.
- [x] Authenticated live snapshot against the registered firewall: all eight operations `success`, `release` `26.07.2-RELEASE`, `platform` `Netgate 2100`, `compatibility` `verified`.
- [ ] A CE-device comparison against the second firewall location.
- [ ] Page-by-page visual acceptance against the approved mockup (the image is absent from this checkout).

**Boundary:** no new firewall permission, endpoint, HTTP method, write capability, command execution, or arbitrary upstream proxy. The eight-operation scope is unchanged.

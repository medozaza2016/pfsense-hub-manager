# Roadmap

**Last reconciled:** November 22, 2026  
**Active branch:** `feature/multi-site-onboarding`  
**Delivery status:** Core multi-site onboarding, unified Linux installation, and Linux Tailscale Hub access deployment are implemented and locally verified. This branch has not been merged into `main`.

This roadmap is the current planning source. For exact command output, test counts, skipped tests, clean-install evidence, and known verification gaps, see [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md).

## 1. Delivered on the active feature branch

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

- The active implementation and documentation branch is `feature/multi-site-onboarding`.
- The branch has not been merged into `main`. Do not merge, delete, or change branches without explicit user authorization.
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

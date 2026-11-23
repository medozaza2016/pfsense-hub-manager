# Integration Status

**Firewall integration last verified:** 2026-11-19 manual endpoint test (America/New_York; command output timestamps were 2026-11-20 UTC); manager-verified snapshot November 23, 2026  
**Application/install verification:** November 22, 2026  
**Status:** First pfSense Plus REST API connection historically verified by manual test and now verified through the manager client with TLS validation enabled; current manager supports per-device profiles and GUI onboarding, but wider device compatibility remains unverified.  
**Active implementation branch:** `main` (the `feature/multi-site-onboarding` work is merged)  
**Environment:** Prepared Debian 13 Proxmox LXC, plus Windows 11 local development

## Verified firewall

| Property | Observed value |
|---|---|
| Device | Netgate 2100 |
| pfSense edition | pfSense Plus |
| Release | 26.07.2-RELEASE |
| Platform architecture | ARM, ARM Cortex-A53 |
| CPU count | 2 |
| API base URL used from manager | https://172.10.50.1:10443 |
| API port | 10443 |
| API package | Community pfSense REST API, exact package version not recorded |

The API response also contained a serial number and Netgate ID. Those identifiers are intentionally omitted from repository documentation.

## Verified manager-side connectivity

The manager LXC successfully reached the API at 172.10.50.1:10443. The endpoint returned a structured HTTP 401 before credentials were supplied, proving the service was reachable and responding.

The public hostname, pfsense.luxoritpro.com, timed out from the manager LXC on port 443 during the recorded test. The same public hostname returned the API's structured HTTP 401 response when opened from the XPS-13. This is a separate routing/path issue and is not a blocker for the direct LAN endpoint currently used by the manager.

The direct-IP TLS certificate was self-signed and failed normal curl certificate validation. Tests therefore used curl -k / --insecure temporarily. This is a diagnostic workaround only. Production integration must validate the firewall certificate and must not disable TLS verification.

## API account and authentication

- Dedicated local pfSense account: pfsense_hub
- Account role: regular user, not a member of the admins group
- Effective API permissions: eight explicitly assigned GET permissions listed below
- API key: created for pfsense_hub
- Authentication header: X-API-Key
- Secret material: not recorded here and must never be committed
- Basic Authentication test: returned HTTP 401. The successful test was API-key authentication, not Basic Authentication.
- The restricted user did not have general WebConfigurator page access. This was not required for API polling.

The successful API-key test returned HTTP 200 with code 200, status ok, response_id SUCCESS.

## Eight verified read-only endpoints

All eight endpoints returned HTTP 200 from the manager LXC using the X-API-Key header:

| Endpoint | Verified response |
|---|---|
| /api/v2/status/system | System hardware and utilization data |
| /api/v2/status/gateways | Gateway status; WAN_DHCP reported online in the captured response |
| /api/v2/status/interfaces | Interface inventory and status |
| /api/v2/status/services | Service inventory and status |
| /api/v2/system/version | Version 26.07.2-RELEASE |
| /api/v2/diagnostics/arp_table | ARP table data |
| /api/v2/firewall/states | Firewall state entries |
| /api/v2/firewall/states/size | State table size; captured current state count was 2,337 |

The captured system response reported CPU usage 17%, memory usage 18%, and disk usage 33%. These are point-in-time values from the test, not service-level baselines.

## Test method

The key was entered interactively and stored only in a shell variable for the duration of the test. The test used the X-API-Key header and removed the variable afterward. The test bypassed certificate validation because the current certificate is self-signed.

Do not copy a real key into shell history, source files, issue comments, logs, or documentation. For repeatable tests, use a protected secret store or a root-readable environment file with restrictive permissions.

## Known limitations and pending work

1. ~~Replace temporary certificate bypass with verified TLS trust.~~ Satisfied for the manager path on November 23, 2026: the manager client validates TLS with a device-scoped CA bundle and pinned server name (`rejectUnauthorized: true`, no insecure fallback). The November 19 `curl -k` test remains history only.
2. Record the exact REST API package version and confirm compatibility for the installed Plus release and ARM architecture.
3. Test the corresponding endpoints on pfSense CE when that firewall is connected.
4. Investigate why the manager LXC cannot reach the public hostname on port 443, if that hostname is needed for the final design.
5. Confirm endpoint pagination, response schemas, and rate/collection behavior before designing persistent polling.
6. Do not infer that all eight endpoints have been validated on CE from the Plus test.
7. Do not enable write endpoints as part of the initial monitoring integration.

## Network addressing note

The existing 172.10.x.x addressing is intentionally being left unchanged for this project at the user's direction. Do not make subnet renumbering a prerequisite for current development. Revisit routing implications only if an actual conflict or connectivity failure is observed.


## Initial manager application implementation

The repository now contains an initial Fastify backend provider wired to exactly the eight GET paths above. The manager API's read-only overview route invokes these operations sequentially, records per-operation outcome and duration in PostgreSQL, and emits bounded Prometheus metrics. ARP and firewall-state response rows are reduced to counts when the upstream data is an array; the raw rows are not returned or stored. System, gateway, interface, and service payloads are not exposed as raw records by the provider; only collection indicators/counts are returned. The state-size and version responses are included for initial inspection.

This application implementation has since been built and deployed on the Linux LXC. The clean-install and Hub access evidence is recorded below and in [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md). This project uses operator-run local checks; no hosted CI workflow is used in the current workflow. The historical firewall TLS limitation above is now superseded for the manager path: the first Plus firewall's diagnostic `curl` test bypassed certificate validation, but the manager client validates TLS with a device-scoped CA bundle and pinned server name and completed a full eight-operation collection over that connection on November 23, 2026. See the manager-verified section below.


## Local application verification update, November 22, 2026

The Windows 11 / Docker Desktop local validation run on the active feature branch completed:

- `npm ci`: 196 packages installed; npm reported zero vulnerabilities. npm emitted install-script approval warnings for esbuild packages, but the subsequent build completed.
- `npm test`: 16 test files passed, 1 skipped; 177 tests passed, 4 skipped, 181 total.
- `npm run typecheck`: API and web TypeScript checks passed.
- `npm run build`: API TypeScript build and web TypeScript/Vite production build passed.

The four skipped tests are the Unix-domain-socket client tests, explicitly skipped by the test file on Windows. They are not counted as passed. The user later confirmed the Hub Settings save-progress animation in the browser after rebuilding the web service.

The Linux Host Agent suite was run on Linux and reported **23 tests passed**. The installer scripts passed Bash syntax checks, Docker Compose validation passed, and the existing LXC's API, web, and PostgreSQL containers reported healthy.

## Linux source validation and dependency lockfile fix, November 22, 2026

A Linux checkout of the current branch failed `npm test` with `Cannot find module @rollup/rollup-linux-x64-gnu`, because the committed `package-lock.json` had been generated on Windows and recorded only Windows optional binaries. The lockfile was regenerated with npm 11 platform overrides (`--os=linux --os=win32 --cpu=x64 --libc=glibc --libc=musl`), adding 76 platform-specific entries and changing four packages at patch level: `rollup` and `@rollup/rollup-win32-x64-msvc` to 4.68.8, `fast-json-stringify` to 7.3.10, and `caniuse-lite` to 1.0.30001827. On Linux, `npm ci` then installed 196 packages with 0 vulnerabilities, `npm test` passed 17 test files and 217 tests with none skipped, `npm run typecheck` and `npm run build` passed, and a `--no-cache` web image build succeeded without the previous manual Rollup binary workaround. The `npm pack` step in `apps/web/Dockerfile` and the unreferenced `scripts/repair-rollup-linux.mjs` helper were removed. See DEC-037 and [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md).

## Clean Linux installation and Hub access verification, November 22, 2026

A clean Debian 13 prepared Proxmox LXC installation completed using the unified Linux installer. The installer automatically installed/enabled the Host Agent, built the stack, waited for database/API/web health, verified the API supplementary group and Unix socket, and completed the bearer-authenticated API-to-agent request. It then enabled `HUB_ACCESS_DEPLOYMENT_ENABLED=true` and recreated the API container successfully.

The final containers reported healthy, the Host Agent was active/enabled under systemd, and the installer detected the existing Tailscale CLI. No Node.js/npm host installation was required.

The user accessed Hub Settings through an SSH tunnel, saved the host's Tailscale MagicDNS endpoint, and received **Endpoint verified**, configuration revision 2 and applied revision 2. The HTTPS MagicDNS endpoint then opened in the browser. The user also confirmed the updated save-button progress animation.

See [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) for exact install output summary, commands, skip details, and known gaps.


## Manager multi-device implementation status, November 22, 2026

This section describes code capability separately from the historical live test against the first Plus firewall above.

### Current manager implementation

- PostgreSQL stores managed-device profiles, encrypted per-device credentials, and encrypted per-device custom TLS trust.
- The API provisions the application encryption key separately from PostgreSQL and fails closed when the runtime key is missing or malformed.
- `GET /api/v1/devices` returns the manager inventory. Per-device clients are built from that device's own HTTPS origin, decrypted API key, TLS trust mode, and optional TLS server name.
- Administrator-only API routes support certificate discovery, pre-registration connection testing, registration, profile updates, enable/disable, credential rotation, custom TLS trust set/remove, connection testing, and archival.
- Registration generates the device UUID in the backend, performs an authenticated read-only `version` request, and stores credential material encrypted. Secret fields are write-only.
- The provider iterates enabled, non-demo devices independently and records per-operation results in `poll_runs`. One device's collection failure is handled within that device's collection loop.
- The pfSense client uses a fixed allowlist of eight GET operations and enforces TLS certificate verification, with optional device-scoped private CA trust and optional TLS server name.
- The legacy single-firewall environment bootstrap remains optional for existing installations; it is not a requirement for fresh Hub startup.

### Current limitations

- No second real firewall has been registered and validated as part of this closeout. The deferred CE firewall remains unconnected.
- The capability view is derived from each device's own recorded `poll_runs` (DEC-042), not from a hard-coded list: `supported: false` only for `unsupported`, `authorization`, and `authentication` refusals, `supported: null` for transport/TLS/rate-limit/schema failures, and `unverified` for a device with no polling history. This still does not prove compatibility across every Plus/CE release or API package version.
- The background polling scheduler, bounded concurrency, retry/backoff, and poll-history retention are implemented and unit-tested (DEC-043). It is enabled in the local Docker Compose deployment and was observed collecting consecutive scheduled cycles on November 23, 2026; it still ships disabled for other installations until an operator activates it.
- Several firewall-domain UI pages still contain preview fixtures rather than live device-specific data.
- Audit/alert retention, database backup/restore, and disaster recovery require separate policy and drills.
- Firewall configuration-changing operations remain out of scope. No generic proxy or arbitrary upstream route is exposed.

### Security and compatibility constraints

- Credentials and custom CA trust are encrypted before persistence using AES-256-GCM and the application encryption key, with versioned device-bound additional authenticated data.
- Plaintext credentials must never be returned by API responses, logged, placed in browser storage, or embedded in source, images, or committed environment files.
- Device URLs must be validated as HTTPS origins. Do not accept arbitrary paths, query strings, fragments, URL credentials, or non-HTTPS schemes.
- Continue using explicit provider operations and a fixed upstream route allowlist. Do not create a generic proxy endpoint.
- TLS certificate and hostname verification remain mandatory. A private CA is device-scoped and supplied through the protected manager workflow.
- Demo devices must not be probed, opened as real firewall workspaces, or used as evidence of live integration.
- Keep configuration-changing firewall operations disabled.

### Firewall integration verification status

The first Plus firewall has a historical diagnostic record of eight successful GET calls made with a self-signed certificate and temporary `curl` certificate bypass. That bypass is historical only. On November 23, 2026 the manager itself collected all eight operations over a **validating** TLS connection: the registered `pfsense-HOME` profile stores a device-scoped CA bundle and pins the TLS server name, and `apps/api/src/pfsense/client.ts` always sets `rejectUnauthorized: true` with `checkServerIdentity` pinned to that name. No insecure fallback exists in the client. The installed REST API package version is still not recorded (no approved endpoint exposes it), and the second CE firewall remains intentionally deferred.

The application and Hub access installation verification is not evidence that two real firewall devices or all supported pfSense editions have been validated.

## Manager-verified site telemetry, November 23, 2026

DEC-042 replaced the illustrative fixtures on Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility with one sanitized contract, `GET /api/v1/devices/:deviceId/snapshot`. This section records what the manager itself observed; the earlier sections describe the manual `curl` test.

- The registered device is `pfsense-HOME`, edition `plus`, origin `https://172.10.50.1:10443`, pinned TLS server name, custom CA bundle present, enabled, not demo.
- A live authenticated session produced a full snapshot: all eight operations recorded `success` in `poll_runs`, and no polling alert was raised.
- Compatibility metadata now appears in the inventory: `release` `26.07.2-RELEASE`, `platform` `Netgate 2100`, `compatibility` `verified`, `apiPackageVersion` `null`. Architecture is not reported because no approved endpoint supplies it.
- ARP and firewall-state responses contribute counts and a state limit only; serial numbers, Netgate IDs, MAC addresses, hardware interface names, monitor/source addresses, and counters are not modeled in the manager, so they cannot be returned, logged, or persisted.
- The same session exposed a defect: the compatibility queries projected `device_id` from `managed_devices`, whose key is `id`, so `GET /api/v1/devices` returned `500` and the site list failed to load. The projection is now `id AS device_id`, the SQL was executed against the live schema before the image rebuild, and the repository tests pin the projection. See [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) section 15.1.

Still unverified after this session: a CE comparison, page-by-page visual acceptance against the approved mockup, and the failure, cache-hit, and pruning paths under background polling (DEC-043) — the scheduler now runs on cadence in the local deployment, but a repeated poll failure with a deduplicated alert and auto-resolve, a page load inside the interval reporting `cacheHit: true`, and a prune that removes and audits real rows have not been exercised.

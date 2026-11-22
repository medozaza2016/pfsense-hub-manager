# Integration Status

**Last verified:** 2026-11-19 (America/New_York; command output timestamps were 2026-11-20 UTC)  
**Status:** First pfSense Plus REST API connection verified, read-only scope  
**Environment:** Proxmox LXC named pfsense-hub-manager

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

1. Replace temporary certificate bypass with verified TLS trust.
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

This is code implementation, not yet a successful live application run. The CI workflow has verified TypeScript, unit tests, and frontend/backend builds on GitHub Actions. Docker Compose image build validation and deployment on the target LXC are still pending. TLS verification is enforced, but the manager's trust of the firewall certificate has not yet been verified.


## Local application verification update, November 21, 2026

The current development work was performed on Windows 11 using VS Code and Docker Desktop. The feature branch contains the shared UI and administration work described in the frontend and phase documentation.

A local runtime discrepancy made the search/filter and mobile UI appear absent. Inspection confirmed that the source branch contained `ToastProvider.tsx`, `ui.tsx`, and `ui.css`, and the app referenced the shared components. The running web container was serving an older build. Rebuilding the web service loaded the current source and resolved the discrepancy. This incident was not evidence of missing source code or a divergent local/remote feature branch.

The development session's recorded API test result was **52 tests passing across 7 test files**. Treat this as a session result, not a substitute for rerunning the checks on the final PR head. The branch was synchronized with origin at commit `06e8d0f49433654d37b7d9c8c8135ab96da17283`.

### Remaining verification
- Re-run API tests, typecheck, and production builds on the final PR head.
- Run `docker compose config` and rebuild the complete local stack.
- Verify search, filters, pagination, toasts, and mobile cards in a browser at desktop and phone widths.
- Verify admin versus user authorization, disabled-account login rejection, last-active-admin protection, and audit outcomes.
- Validate migrations and development seed idempotency against a disposable local database.
- Do not treat the local Docker UI fix as evidence that firewall TLS trust, live multi-device collection, or production deployment has been validated.


## Manager multi-device implementation status, November 21, 2026

This section describes the manager application's current integration capability, separately from the historical live test against the first Plus firewall above.

### Current manager implementation

- The application has a PostgreSQL `managed_devices` inventory and a separate `device_credentials` table.
- Migration `006_development_demo_sites.sql` adds an explicit `is_demo` marker for development sample devices.
- The application includes an AES-256-GCM credential encryption helper and loads a 32-byte application encryption key at API startup.
- The device inventory endpoint is `GET /api/v1/devices`.
- Device detail, capability, and overview endpoints exist. Capability and overview collection are currently restricted to the single device ID configured by environment variables.
- The pfSense client uses a fixed allowlist of eight GET operations and enforces TLS certificate verification, with optional private CA trust.
- The current provider is not yet a multi-device provider. The presence of inventory rows, a credential table, and encryption primitives does not mean independent per-device connections are implemented.

### Not yet implemented

- Authenticated administrator endpoints to create, edit, enable, disable, and delete managed-device profiles.
- Per-device credential encryption/decryption integrated with the device lifecycle and provider.
- Per-device HTTPS origin and TLS CA/trust configuration.
- Connection-test endpoint that targets an arbitrary registered real device using its own credential.
- Per-device capability and compatibility persistence.
- Independent collection for multiple real devices.
- Background polling scheduler, bounded concurrency, retry/backoff, and continuous alert production.
- A live data contract for the firewall-domain preview pages.

### Security and compatibility constraints

- Credentials must be encrypted before persistence using the application encryption key, with authenticated encryption and key-version metadata.
- Plaintext credentials must never be returned by API responses, logged, placed in browser storage, or embedded in source, images, or environment files committed to Git.
- Device URLs must be validated as HTTPS origins. Do not accept arbitrary paths, query strings, fragments, URL credentials, or non-HTTPS schemes.
- Continue using explicit provider operations and a fixed upstream route allowlist. Do not create a generic proxy endpoint.
- TLS certificate and hostname verification remain mandatory. A private CA may be supplied through a protected server-side configuration path. Do not add an insecure certificate bypass.
- Demo devices must not be probed, opened as real firewall workspaces, or used as evidence of live integration.
- Keep configuration-changing firewall operations disabled.

### Verification status

The first Plus firewall has a historical diagnostic record of eight successful GET calls, but that test used a self-signed certificate with temporary curl certificate bypass. The application client itself enforces TLS verification; successful trust validation from the manager remains pending. The installed REST API package version is not yet recorded. The second CE firewall remains intentionally deferred.

No multi-device implementation or multi-device runtime validation is claimed by this document.

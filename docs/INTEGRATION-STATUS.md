# Integration Status

**Historical firewall-side verification:** 2026-11-19 (America/New_York; command output timestamps were 2026-11-20 UTC)  
**Latest application validation reported:** 2026-11-21, Windows 11 local development environment, 42 tests passed across 7 files, API/web type checks and production builds passed  
**Status:** First pfSense Plus connection and nine approved read-only GET operations reported successful; read-only scope  
**Environment:** Windows 11 development workstation connecting through Tailscale subnet routing to the Branch LAN. This is separate from validation on the production Proxmox LXC.

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

The original direct-IP TLS certificate was self-signed and failed normal curl certificate validation. The initial command-line investigation used curl -k / --insecure temporarily for diagnosis only. The application implementation subsequently added certificate discovery, per-device CA configuration, TLS server-name identity, and strict TLS verification. Certificate discovery inspects the remote certificate without authenticating or trusting it. Trust must still be established through a valid CA/trust configuration. The user later reported that the application connection test succeeded and the pfSense API version endpoint responded. Do not infer from this report that the target Proxmox LXC deployment or the second CE firewall has been validated.

## API account and authentication

- Dedicated local pfSense account: pfsense_hub
- Account role: regular user, not a member of the admins group
- Effective API permissions: nine approved GET permissions, eight core operational reads plus REST API package-version discovery
- API key: created for pfsense_hub
- Authentication header: X-API-Key
- Secret material: not recorded here and must never be committed
- Basic Authentication test: returned HTTP 401. The successful test was API-key authentication, not Basic Authentication.
- The restricted user did not have general WebConfigurator page access. This was not required for API polling.

The successful API-key test returned HTTP 200 with code 200, status ok, response_id SUCCESS.

## Eight core operational read-only endpoints

These eight core endpoints returned HTTP 200 from the manager LXC using the X-API-Key header:

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

## Latest manager-side automated coverage (2026-11-21)

The user reported 42 passing tests across 7 test files, followed by successful API and web TypeScript checks and production builds. The added route/provider coverage includes:

- Admin-only device registration and metadata update routes.
- Credential replacement for additional devices, including read-only connection re-test before encrypted credentials are saved.
- Rejection of credential rotation for the installation-configured primary device.
- Propagation of configured CA certificate and TLS server name into the firewall client used for connection testing.
- Certificate discovery response metadata (DNS identities, suggested server name, fingerprint) and rejection of non-HTTPS discovery URLs.
- Authorization checks for credential rotation and registration.

Certificate-discovery route tests use a mocked TLS socket. These tests validate route behavior and certificate metadata handling, not a new live TLS handshake with the physical firewall. The historical live firewall verification above remains the separate evidence for the Plus device. No CE validation or production LXC validation is implied.

## Known limitations and pending work

1. Record the exact REST API package version and confirm compatibility for the installed Plus release and ARM architecture.
2. Re-run and record strict TLS verification from the intended production manager host, including the exact CA and TLS server-name configuration.
3. Test the corresponding endpoints on pfSense CE when that firewall is connected.
4. Investigate why the manager LXC cannot reach the public hostname on port 443, only if that hostname is needed for the final design.
5. Confirm endpoint pagination, response schemas, response-size limits, and rate/collection behavior before designing persistent polling.
6. Do not infer that any of the nine operations have been validated on CE from the Plus test.
7. Do not enable write endpoints until the change-safety requirements in Phase 5 of `PROJECT-ROADMAP.md` have passed.

## Network addressing note

The existing 172.10.x.x addressing is intentionally being left unchanged for this project at the user's direction. Do not make subnet renumbering a prerequisite for current development. Revisit routing implications only if an actual conflict or connectivity failure is observed.


## Initial manager application implementation

The repository now contains an initial Fastify backend provider wired to the eight core operational GET paths above, with the separate ninth package-version GET probe. The manager API's read-only overview route invokes these operations sequentially, records per-operation outcome and duration in PostgreSQL, and emits bounded Prometheus metrics. ARP and firewall-state response rows are reduced to counts when the upstream data is an array; the raw rows are not returned or stored. System, gateway, interface, and service payloads are not exposed as raw records by the provider; only collection indicators/counts are returned. The state-size and version responses are included for initial inspection.

This implementation has since been exercised in the Windows local Docker Compose environment. The user reported a successful firewall connection test with the API version endpoint responding, followed by successful read-only collection. This is a user-reported manual result, not an independently captured test transcript in this document. Local validation of the newest React Router changes remains pending. Deployment and validation on the target Proxmox LXC remain separate pending work.


## Ninth approved read-only operation: REST API package version

The operator added the GET permission for `/api/v2/system/restapi/version`. The manager probes this separately from the eight core operational checks and reads `data.current_version`. On 2026-11-21, the per-firewall compatibility page displayed `v2.11.0` and reported **9 of 9** endpoint checks as Verified for the Netgate 2100 running pfSense Plus 26.07.2-RELEASE. This is the current application-reported evidence for that device; it does not establish CE compatibility or full schema validation. The adjacent PATCH method is not called or authorized.


## Firewall rules inventory and interface assignment verification (2026-11-21)

The administrator-only firewall rules inventory was implemented and manually accepted on the first Plus firewall.

- Manager endpoint: `GET /api/v1/devices/:deviceId/firewall/rules`.
- Upstream operation: `GET /api/v2/firewall/rules`.
- Collection uses bounded pagination (100 per page) and a hard cap of 1,000 rules.
- Provider normalizes an explicit allowlist of rule fields and requires an integer rule ID. Tracker and created/updated metadata are excluded. Raw firewall rule records are not persisted.
- The endpoint is separate from routine monitoring and is administrator-only. No firewall write method or generic proxy is exposed.
- Interface assignments use a separate administrator-only manager endpoint backed by `GET /api/v2/interfaces`. Logical IDs are read from `id`, human-readable descriptions from `descr`. The endpoint-specific `api-v2-interfaces-get` privilege was used, not `page-all`.
- The UI groups rules by interface, retains pfSense order, calculates priority from the original per-interface order (filters do not renumber), and keeps disabled rules visible.

User screenshot acceptance showed 30 rules: LAN 4, OpenVPN 1, Main (OPT1) 7, TestLab (OPT2) 4, IoT (OPT3) 3, Mgt (OPT4) 1, WAN 9, and WireGuard 1. Summary counts: 25 enabled, 5 disabled.

User-reported Windows validation: `npm test` passed 52 tests across 7 files; `npm run typecheck` passed for API and web; `npm run build` passed for API and web. Docker API/web services were rebuilt and the live UI was verified. No CI was run. This evidence applies to the first Plus firewall only, not the unconnected CE firewall.

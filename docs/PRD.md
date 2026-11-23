# Product Requirements Document

## 1. Product summary

**Name:** pfSense Hub Manager

**Status:** Draft, initial requirements captured from project discussions.

**Product type:** Centralized management and monitoring application for multiple pfSense firewall installations.

The product provides one management interface for a mixed pfSense environment, initially involving pfSense Plus at one location and pfSense CE at another. It is an independent management layer, not a replacement firewall and not a Netgate Nexus client.

## 2. Problem statement

Operating separate pfSense installations creates fragmented visibility and requires administrators to connect to each firewall independently. The project aims to provide a consolidated view and a consistent management experience across locations and editions.

A key challenge is that pfSense Plus and CE, and their REST API package versions, may not expose identical capabilities. The application must make those differences explicit.

## 3. Goals

1. Provide a central application to monitor and manage multiple pfSense devices across locations.
2. Support mixed pfSense Plus and pfSense CE deployments, with room for additional devices and supported editions/releases.
3. Establish secure, reliable communication with each firewall, while deferring the exact connection method.
4. Present device reachability, health, configuration, and operational information in one interface.
5. Support the full lifecycle of supported firewall configuration, including creating, editing, reviewing, applying, and deleting rules and related objects, subject to device capabilities and safety controls.
6. Isolate edition- and version-specific behavior behind a compatibility-aware integration layer.
7. Deliver functionality incrementally, starting read-only and introducing write operations only after authorization, validation, audit, and recovery controls are implemented.
8. Remain independent of Netgate Nexus.

## 4. Scope boundaries

The long-term product is a management application, not merely a monitoring dashboard. Planned management domains include firewall rules and aliases, NAT, interfaces and VLANs, routing and gateways, DHCP and DNS services, VPN-related capabilities where supported, certificates, and other pfSense configuration areas exposed by a compatible API.

The initial milestone remains read-only. Write operations will be introduced in stages after capability checks, least-privilege authorization, configuration backup/recovery, change previews, explicit confirmation, audit logging, and post-apply verification are designed and tested.

The product does not replace pfSense itself, require Netgate Nexus, assume every API operation exists on every edition/release, or expose firewall management APIs publicly by default. Remote shell access and arbitrary command execution are not assumed to be product requirements. Automatic firmware upgrades are not in the initial scope.

## 5. Users and primary use case

**Primary user:** An administrator responsible for more than one pfSense firewall.

**Initial scenario:** The administrator opens one dashboard and can identify both locations, see whether each firewall is reachable, and review the operational information that its installed REST API version supports.

The application uses two roles for the initial manager-user model: `admin` and `user`. Both authenticated roles may view System Monitoring and Recovery status in Administration. Operational controls are visible but disabled for `user`; only `admin` may invoke service or stack operations. The backend must enforce this authorization on every operation. Unauthenticated requests are denied.

## 6. Functional requirements and phased delivery

### FR-1: Managed devices

The system shall represent multiple firewall instances, each with a human-readable name, location, pfSense edition, installed release, API package version, and connection state where those values can be safely and reliably obtained.

### FR-2: Device connectivity

The system shall test connectivity to each configured firewall independently and display success, failure, timeout, or unsupported status without blocking other devices.

### FR-3: Compatibility awareness

The system shall account for pfSense edition, release, API package version, and platform architecture. It shall not assume that a feature or endpoint exists merely because it works on another device.

### FR-4: Read-only monitoring

The initial milestone shall retrieve only explicitly approved read-only information. The initial verified Plus endpoint set is recorded in docs/API-SPECIFICATION.md. The final dashboard metrics and polling frequency remain open.

### FR-5: Unified dashboard

The system shall provide a consolidated view of registered devices and make each device's status and last successful communication time clear.

### FR-6: Error handling

The system shall communicate authentication failures, network failures, timeouts, API errors, TLS failures, and unsupported capabilities distinctly. It shall tolerate partial outages.

### FR-7: Auditability

The read-only release shall log security-relevant access and operational errors without recording secrets. Before any write capability is enabled, the system shall provide an immutable or tamper-evident action history recording actor, target firewall, requested change, before/after or change reference, confirmation, result, timestamp, and correlation ID.

### FR-8: Configuration management (later phase)

The product is intended to support creating, viewing, editing, and deleting supported firewall configuration objects, including rules, aliases, NAT mappings, interfaces, routing, and service configuration. Each operation must be gated by the capability matrix for the target firewall and API version. Unsupported operations must be clearly identified rather than silently emulated.

### FR-9: Safe change workflow (before write release)

For consequential changes, the application shall validate input, show a human-readable change preview, identify the target firewall, require explicit confirmation, preserve a recoverable configuration backup or equivalent rollback path where available, apply changes through documented API operations, and verify the resulting state. Risky changes that could cut off management access require additional safeguards.

### FR-10: Extensible device onboarding

Administrators shall be able to add further supported pfSense firewalls without a fixed device-count assumption. Each device shall have independent credentials, connectivity settings, compatibility detection, and health state.

### FR-11: Installation and first-run onboarding
The product shall provide a guided installation and first-run setup experience that accounts for all required infrastructure, configuration, security, and operational prerequisites. The installation workflow and its documentation shall be updated with each feature increment that introduces a new dependency or setup requirement. Infrastructure setup and one-time bootstrap shall be automated wherever practical. Normal site registration, credential entry and rotation, connection testing, and site lifecycle management shall be available through the GUI without routine shell commands. Production deployment shall target Linux, while the supported local development workflow uses Windows 11 and Docker Desktop.

### FR-12: Hub-independent bootstrap and managed-device identity
A fresh Hub installation shall initialize and remain usable with zero registered firewalls. Hub infrastructure configuration shall not require a firewall UUID, name, edition, API origin, API credential, or firewall CA certificate. Windows PowerShell and Linux Bash installation workflows shall provision Hub infrastructure and Hub-level secrets only. Firewall registration shall be initiated by an authenticated administrator through the GUI after first-run administrator setup. The backend shall generate a random UUID for each new managed-device record. Existing single-firewall environment configuration and data shall be migrated without losing its device identity, credentials, polling history, or audit records.

## 7. Initial non-functional requirements

- **Security:** Least privilege, secret protection, TLS verification, and private connectivity preferred.
- **Reliability:** A single unreachable firewall must not make the overall service unavailable.
- **Compatibility:** Support must be explicit and tested by edition and release.
- **Maintainability:** Firewall API calls must be isolated behind a provider/adapter layer.
- **Observability:** Provide useful diagnostics while redacting credentials and sensitive payloads.
- **Extensibility:** Support adding further devices and locations without redesigning around a fixed count of two.

Quantitative availability, performance, and retention targets remain open.

## 8. Deployment and technology decisions

Development is performed locally on Windows 11 using VS Code and Docker Desktop. Production deployment targets Linux, with a prepared Debian 13 Proxmox LXC as the documented baseline. Docker Compose manages web, API, and PostgreSQL in both environments. The Linux production installer and its standard Host Agent are documented in `docs/DEPLOYMENT.md`. Cloudflare Workers and Cloudflare hosting are not used for this project.

The frontend uses React with TypeScript and Vite. The backend is a separate Node.js and TypeScript Fastify service exposing an authenticated REST API. PostgreSQL runs as a dedicated Docker Compose service. Manager accounts and sessions are database-backed and use `admin` and `user` roles. Managed firewall credentials and custom TLS trust are encrypted per device in PostgreSQL using the separately provisioned application encryption key. The firewall-to-hub connection method for additional sites remains deferred. See `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`.

Installation and first-run onboarding are product requirements. The current Linux installer automates one-time Hub/Host Agent bootstrap on the prepared Debian 13 Proxmox LXC, generates and protects the application encryption key, requires confirmation that the recovery copy was saved, and validates service/agent health before enabling GUI-managed access. Routine site registration, credential entry/rotation, connection testing, and site lifecycle management are performed through the GUI. Per-site credentials are encrypted in PostgreSQL. Backup/restore, key rotation, and broader production recovery acceptance remain outstanding. See DEC-024 and `docs/INSTALLATION-BOOTSTRAP.md`.
## 9. Integration constraints and risks

The pfSense REST API discussed for this project is community-maintained and unofficial. Its compatibility depends on the exact pfSense release and package release. Not all operations are necessarily available across Plus and CE.

The first tested Plus firewall is a Netgate 2100 with an ARM Cortex-A53 processor and two CPU cores. Its reported pfSense release was 26.07.2-RELEASE. The exact REST API package version has not yet been recorded. ARM package availability and runtime behavior must be verified rather than assumed.

The first integration used a dedicated regular user named pfsense_hub with an API key and eight GET privileges. All eight selected endpoints returned HTTP 200 from the manager LXC. The direct-IP certificate was self-signed and TLS verification was bypassed for diagnostics only. Production use requires verified TLS.

The application must not expose firewall API endpoints to the public internet by default. A VPN or other private management path is preferred. The current manager-to-Plus test uses 172.10.50.1:10443. The second CE firewall is not yet connected, by design.

## 10. Initial acceptance criteria

The first milestone is acceptable when:
1. The repository contains approved architecture and security decisions.
2. A firewall can be registered without storing credentials in frontend code or source control.
3. The backend can establish a verified, secure connection to a test firewall over the approved network path.
4. The application can report connection state and distinguish common failure categories.
5. The application can retrieve a small, explicitly selected set of read-only information from a supported device.
6. Unsupported edition/version capabilities are reported clearly.
7. Tests cover success, timeout, authentication failure, and unsupported capability cases.
8. No firewall configuration-changing operation is enabled by default.

## 11. Open questions

1. What exact read-only information should the first dashboard show?
2. How will the manager reach each firewall site?
3. Will the backend require a private connector/agent?
4. Which authentication method will administrators use to sign in?
7. How will encrypted firewall API credentials and the application encryption key be backed up, recovered, rotated, and revoked?
8. PostgreSQL is approved for device inventory, status history, users, and audit records. The schema, retention, and backup policy still need to be designed.
9. What are the exact CE release, Plus release, API package versions, and architectures at both locations?
10. Which API endpoints and capabilities are verified on each installation?
11. Is the product single-administrator initially, or must it support multiple users and roles?
12. What backup, retention, and recovery requirements apply?

## 12. Milestone outline

- **M0, Discovery:** Confirm firewall versions, API compatibility, connectivity, security model, and first dashboard data. The first Plus device's initial API connectivity and eight read-only endpoints are now verified.
- **M1, Foundation:** Approve architecture, scaffold repository, establish linting/testing, and implement secure configuration handling.
- **M2, Read-only integration:** Register devices, connect securely with verified TLS, check health, and retrieve approved read-only data.
- **M3, Unified dashboard:** Present device inventory, status, and per-device details.
- **M4, Hardening:** Complete security review, compatibility tests, audit coverage, and operational documentation.
- **Later milestones:** Consider selected write operations only after explicit requirements, authorization, audit, and recovery controls are approved.

## 13. Change control

This PRD is an initial draft based on the decisions captured in project discussions. New requirements and changes should be recorded explicitly. Do not silently convert an open question or technical assumption into an approved requirement.

## 14. Verified implementation preparation record

As of 2026-11-19 (America/New_York), the manager LXC named pfsense-hub-manager successfully authenticated to the first Netgate 2100 using the X-API-Key header for the dedicated pfsense_hub user. All eight GET endpoints in docs/API-SPECIFICATION.md returned HTTP 200. The API reported pfSense Plus 26.07.2-RELEASE.

The API key and firewall serial/Netgate identifiers are intentionally not included in this repository. The diagnostic TLS bypass and public-hostname timeout are documented in docs/INTEGRATION-STATUS.md. The 172.10.x.x addressing is being retained for now at the user's direction. The second pfSense CE firewall connection is deferred until the user is ready.

The frontend stack (React, TypeScript, Vite) and separate Node.js/TypeScript REST backend have been approved. The application scaffold is the next implementation step. See docs/ROADMAP.md for the remaining work and docs/DECISIONS.md for confirmed decisions versus open architecture choices.


## 15. Confirmed backend and API documentation requirements

The backend HTTP framework is **Fastify** (DEC-015). The approved application stack is React + TypeScript + Vite, a separate Node.js + TypeScript + Fastify REST backend, and PostgreSQL in Docker Compose.

The supplied pfSense REST API OpenAPI 3.0 JSON document is the upstream API reference. Its metadata reports title "pfSense REST API Documentation" and version "unknown". Preserve the original specification as `specs/pfsense-openapi.json` when added to the repository. Do not label its unknown version as a verified package version.

The project shall maintain a generated **pfSense REST API Matrix** from that specification. The matrix must record category/tag, path, HTTP method, operation ID, summary/description, authentication, required privileges, required packages, request/response schema references, immediate-apply behavior, cache behavior, and application coverage status. Coverage statuses must distinguish:
- Present in upstream specification.
- Verified against a specific real firewall and package version.
- Implemented in the backend.
- Exposed in the frontend.
- Automated-test status.

The initial release remains read-only. A method being present in the upstream specification does not authorize its implementation or use. Write operations remain disabled until the later safety and authorization requirements in this PRD are met.

Application observability is separate from the pfSense API matrix. Backend metrics shall cover HTTP request volume/latency/errors, per-device polling attempts/results/duration, device reachability, and process uptime. Metrics must not include credentials, API keys, raw URLs containing secrets, or high-cardinality labels such as arbitrary IPs and error messages.

See `API-SPECIFICATION.md`, `API-MATRIX.md`, `API-COMPATIBILITY.md`, `METRICS.md`, `MONITORING.md`, and `SECURITY.md`.


## 16. Initial application foundation implementation

The current feature branch includes the React/Vite frontend, Fastify/TypeScript backend, PostgreSQL migrations, Docker Compose deployment, fixed read-only provider for eight GET routes, strict TLS verification with optional device-scoped CA trust, per-device credential encryption, database-backed manager authentication and roles, site onboarding/lifecycle APIs, audit/alert APIs, metrics and health/readiness routes, and the Linux Host Agent for GUI-managed Hub access. A clean Debian 13 install and Tailscale Hub access were verified on November 22, 2026. Continuous background polling, two-real-firewall compatibility validation, broader live telemetry, backup/restore, key rotation, and firewall configuration writes remain incomplete. No hosted CI workflow is used in the current project workflow.


## 17. Frontend workspace foundation
The approved frontend direction uses a light content workspace with a dark navy sidebar and responsive navigation. Hub-level navigation and site-level navigation are contextual: opening a site replaces the Hub navigation with the Site workspace navigation and a **Back to Hub** action. The first UI increment must use existing API data only. It must not imply live reachability from a device's enabled/disabled manager configuration state, and it must label unimplemented views rather than displaying fabricated telemetry. The initial frontend foundation is being developed on the `feature/frontend-foundation` branch; local build and browser validation remain required before the increment is considered complete.


## 18. Hub access configuration requirements

### FR-13: GUI-managed Hub access settings
The administrator shall manage Hub access configuration from the existing **Administration → Hub Settings** page. A fresh installation shall use `127.0.0.1` as its safe default and shall remain usable locally without Tailscale, a reverse proxy, or a custom domain. The page shall allow the administrator to save an optional Tailscale IPv4 address and shall be extensible to hostname and reverse-proxy metadata. Configuration shall be persisted in PostgreSQL and validated server-side.

The UI and API shall distinguish at least: configured desired address, pending application, applied deployment binding, and verified reachability. Saving an address must not be presented as proof that the host is reachable. A real probe from an appropriate client/network vantage point is required to mark reachability verified.

The application container cannot change the Docker host's published-port binding merely by updating a database row. Applying a binding change requires a separate, narrowly scoped host-side deployment mechanism or an explicit operator apply workflow. The implementation must not grant the web/API containers unrestricted Docker socket access. Until manager authentication/authorization and the host-side apply boundary are implemented and reviewed, remote binding remains unavailable and loopback remains enforced. Public reverse-proxy exposure is out of scope for the unauthenticated stage.



## Manager identity, audit, and alert administration

The manager authentication baseline uses database-backed sessions and the two supported roles, `admin` and `user`. The initial manager-user administration capability shall allow administrators to create accounts, assign these roles, enable or disable accounts, and reset account passwords. Password material must never be returned to clients. Disabled accounts cannot authenticate, and security-sensitive account changes revoke existing sessions. The last active administrator cannot be disabled or demoted.

Audit events are persisted as append-only records. The initial implementation records authentication outcomes, access denials, user administration, Hub reachability preference changes, alert lifecycle actions, and automatic recovery of firewall polling alerts. Audit records include UTC timestamps, actor information, action, outcome, target, safe summary, request ID, and sanitized metadata. Secrets and password material must be redacted.

Alerts are persisted separately from audit events. The initial rule creates or updates a deduplicated warning/critical alert when read-only firewall polling fails, and automatically resolves it after a fully successful poll. Administrators can acknowledge and resolve alerts. Notification delivery, retention policy, export, and production backup policy remain separate release requirements and must not be represented as implemented.


## Current implementation note, November 22, 2026

The current code and verified delivery status are summarized in [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md). The product requirements above remain the intended product scope; they must not be interpreted as a claim that every requirement has been delivered. In particular, no firewall configuration-changing operation is currently implemented, the second CE firewall is deferred, and the first Plus firewall still requires a separately verified trusted TLS connection and exact API package-version record.

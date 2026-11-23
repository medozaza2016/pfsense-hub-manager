# Decision Log

This document records confirmed architectural decisions. Proposals and open questions must not be presented as settled.

## Confirmed decisions and constraints

### DEC-001, Multi-firewall product
**Status:** Accepted  
**Decision:** Build a centralized manager for multiple pfSense firewalls and locations. Do not hard-code exactly two devices.

### DEC-002, Edition support
**Status:** Accepted  
**Decision:** Target both pfSense Plus and pfSense CE. Treat endpoint and package compatibility as version-dependent and verify it per device.

### DEC-003, No Netgate Nexus dependency
**Status:** Accepted  
**Decision:** The product must remain independent of Netgate Nexus.

### DEC-004, Read-only first
**Status:** Accepted  
**Decision:** Initial integration is read-only. No configuration-changing API methods are enabled for the application at this stage.

### DEC-005, Least-privilege API identity
**Status:** Verified for first Plus firewall  
**Decision:** Use a dedicated regular pfSense user named pfsense_hub, not an administrator account, for the initial API integration. The API key belongs to this user and the user has the eight GET privileges recorded in INTEGRATION-STATUS.md.

### DEC-006, Keep current addressing for now
**Status:** Accepted  
**Decision:** Leave the existing 172.10.x.x addressing unchanged during current development.

### DEC-007, Defer second firewall connection
**Status:** Accepted  
**Decision:** Defer connecting the second pfSense CE firewall until the user is ready. Design the application for multiple devices now.

### DEC-008, Full management product direction
**Status:** Accepted  
**Decision:** The long-term product is a full pfSense management application, not a read-only monitoring dashboard. Delivery will be phased, with read-only first and write operations introduced only after security and recovery controls are implemented.

### DEC-009, Extensible firewall inventory
**Status:** Accepted  
**Decision:** The hub must support adding additional pfSense firewalls over time.

### DEC-010, Defer firewall connection method
**Status:** Deferred  
**Decision:** Do not select or implement the firewall-to-hub connection method yet. Keep the transport replaceable until a separate decision is made.

### DEC-011, Application deployment environment
**Status:** Accepted  
**Decision:** Deploy pfSense Hub Manager on the existing Proxmox LXC named `pfsense-hub-manager`, using Docker Compose to manage the application containers. Do not use Cloudflare Workers or Cloudflare hosting for this project.

### DEC-012, Frontend stack
**Status:** Accepted  
**Decision:** Use React with TypeScript and Vite for the web frontend.

### DEC-013, Backend separation
**Status:** Accepted  
**Decision:** Use a separate Node.js and TypeScript backend, exposing a REST API to the frontend. Keep firewall integration server-side and behind a provider/transport abstraction.

### DEC-014, Application database
**Status:** Accepted  
**Decision:** Use PostgreSQL as the application database, deployed as a dedicated service in the project's Docker Compose stack. Keep it on a private Compose network with a persistent data volume. Do not expose the database port publicly by default. Schema design, migrations, retention, backup/restore, and encryption requirements must be completed before production use.

## Open decisions

1. PostgreSQL schema, migrations, retention, and backup/restore policy.
3. Manager administrator authentication and roles.
4. Detailed key rotation, recovery, and platform-specific runtime-key protection procedures.
5. First dashboard metrics and polling frequency.
6. Supported Plus/CE and API package compatibility matrix.
7. Exact rollout order and supported scope of write capabilities.
8. Firewall-to-hub transport and whether a private connector/agent is required.


### DEC-015, Backend HTTP framework
**Status:** Accepted  
**Decision:** Use Fastify for the Node.js + TypeScript backend REST API. Keep domain services and the pfSense provider/adapter independent of Fastify-specific request and response types.

### DEC-016, Upstream pfSense API specification
**Status:** Accepted  
**Decision:** Treat the user-supplied pfSense REST API OpenAPI 3.0 JSON document as the upstream reference contract. Preserve the source unchanged at `docs/reference/pfsense-openapi.json` in the repository. This file is already committed; do not create a duplicate. Its metadata reports `info.version: unknown`; this is not the installed API package version for the tested firewall.

### DEC-017, Generated API coverage matrix
**Status:** Accepted  
**Decision:** Maintain `docs/API-MATRIX.md` as a generated inventory from the OpenAPI JSON, not as a manually curated endpoint list. Track specification presence, live-device verification, backend implementation, frontend exposure, and automated test status as separate fields. Presence in the upstream specification does not imply device compatibility or permission to enable a write operation.

### DEC-018, Application metrics
**Status:** Accepted  
**Decision:** Define application-level HTTP, polling, reachability, and process metrics in `docs/METRICS.md`. Initially expose metrics from the Fastify backend. Prometheus is optional for a later stage and is not a mandatory initial container.

### DEC-019, Initial read-only safety boundary
**Status:** Accepted  
**Decision:** Keep all pfSense configuration-changing operations disabled in the initial release, even when the OpenAPI specification documents them. Implement only explicitly approved read-only provider operations until the separate write-safety requirements are met.


### DEC-020, Local-only initial UI exposure
**Status:** Accepted as an implementation safety boundary
**Decision:** Until manager-user authentication and authorization are implemented, publish the web UI only on loopback (127.0.0.1) by default, or explicitly on the host's Tailscale interface when remote tailnet access is required. Do not bind the UI to all interfaces (0.0.0.0), expose it on the LAN or public internet, or place it behind a public reverse proxy. Restrict Tailscale access with ACLs or grants. Tailscale network access does not replace application authentication and authorization. The API and database remain unpublished to the host network.


### DEC-021, Approved frontend workspace design and navigation
**Status:** Accepted
**Decision:** Use a light main workspace with a dark navy sidebar, restrained blue primary actions, and clear status colors. The Hub workspace uses global navigation. Opening a site replaces the Hub navigation with contextual Site navigation and a persistent **Back to Hub** action. On narrow screens, the sidebar becomes an off-canvas navigation drawer. Device configuration state must not be represented as live reachability unless the backend provides a verified connectivity result.


### DEC-022, Development and production platforms
**Status:** Accepted  
**Decision:** Use Windows 11 with VS Code and Docker Desktop for local development. Production deployment will run on Linux. Keep application services and installation automation portable across these environments. The existing Proxmox LXC remains the currently intended Linux deployment target unless a later decision changes it; production distribution, host provisioning, and deployment topology remain to be finalized.

### DEC-023, GUI-first installation and onboarding
**Status:** Accepted  
**Decision:** Installation, first-run setup, and ongoing product onboarding are part of the product, not deferred operational documentation. The installation and onboarding workflow must be updated alongside every feature that adds a dependency, configuration requirement, credential, or operational task. Automate infrastructure prerequisites and one-time bootstrap wherever practical. Normal site registration, credential entry/rotation, connection testing, and site lifecycle management must be available through the GUI without routine shell commands. The credential-encryption and key-provisioning approach is recorded in DEC-024.


### DEC-024, Per-site credential encryption and key provisioning
**Status:** Accepted  
**Decision:** Store each site's pfSense API credential encrypted in PostgreSQL using authenticated encryption, with AES-256-GCM as the implementation candidate pending review. Generate one high-entropy application encryption key automatically during installation. The installer must provide a recovery copy for the administrator to save in a password manager and install a separate runtime copy in a protected host-side location that the backend can read automatically. Normal operation and restarts must not require manual key entry. The key must never be stored in PostgreSQL, source control, browser storage, application logs, or API responses. Losing both the runtime key and recovery copy makes existing encrypted credentials unrecoverable. Back up the encrypted database and key separately. Define and test permissions, recovery, rotation, and Windows/Linux provisioning before production use.


### DEC-025, GUI-managed Hub access configuration
**Status:** Implemented on `feature/multi-site-onboarding` and merged to `main`; Linux/Tailscale path verified November 22, 2026
**Decision:** Provide access configuration in **Administration → Hub Settings**. A fresh installation binds the Hub UI to `127.0.0.1:8080` by default. The administrator can select one active method from LAN, Tailscale, or Custom; each tab retains its own endpoint values. Tailscale HTTPS uses the host's MagicDNS hostname, not its Tailscale IPv4 address, because the certificate identity is the MagicDNS name. LAN and Custom require an operator-managed trusted HTTPS reverse proxy forwarding to the assigned private host address on port 8080. The Linux Host Agent applies the supported host binding, verifies HTTPS, and rolls back on failure. For Tailscale it may create only the fixed private Serve proxy to `http://127.0.0.1:8080` when missing. It does not install/authenticate Tailscale, enable tailnet HTTPS, configure ACLs or DNS, issue certificates, or configure Funnel. Never mount the Docker socket into the web/API containers, never bind to `0.0.0.0` by default, and keep the API and PostgreSQL unpublished to external interfaces. The desired/applied endpoint revision and successful host-side probe are distinct from browser reachability.

### DEC-026, Hub-only Docker Compose operations and monitoring
**Status:** Accepted and implemented. Frontend preview merged to `main` in PR #10; Host Agent monitoring and allowlisted operations were implemented as `eb008f5` and live-verified (DEC-039). The deferred verification items are tracked in `ROADMAP.md` and `VERIFICATION-AND-CLOSEOUT.md`.
**Decision:** Provide a simple System Monitoring and Recovery area in the existing Administration interface for this project's Docker Compose stack only. The dedicated host is reserved for pfSense Hub Manager; managing unrelated host containers is explicitly out of scope. The initial feature scope is host resource visibility (CPU, memory, and disk where safely available), health/status for the web, API, and PostgreSQL services, service logs, and individual service start/stop/restart controls, plus whole-stack start/stop/restart and Compose configuration validation. Operations must be implemented through a narrowly scoped host-side management boundary with an explicit allowlist for this Compose project. Do not mount the Docker socket into the web or API containers, expose arbitrary shell/Compose execution, or permit volume deletion. Stack stop/down makes the GUI unavailable, so recovery must be documented as a host-side Docker Desktop/CLI operation. Rebuild/recreate, image updates, destructive database maintenance, and broader host management are deferred until separately reviewed.


**Deployment amendment, November 22, 2026:** The browser-based code-server service is excluded from the active deployment and the monitoring allowlist. Reintroducing an editor container requires a separate explicit decision.

### DEC-027, Monitoring visibility and administrator-only operations
**Status:** Accepted  
**Decision:** The manager defines two application roles for this feature: `admin` and `user`. Authenticated users with either role may view the System Monitoring and Recovery status information in Administration. Only `admin` may invoke service-level or whole-stack operational controls, including start, stop, restart, and Compose validation. For a `user`, those controls remain visible but disabled with a clear administrator-only explanation. The API must enforce the same rule server-side on every operational endpoint; frontend visibility or disabled state is not an authorization boundary. Unauthenticated requests are denied. This role rule does not authorize arbitrary Docker or host operations and does not relax the fixed project/service allowlists or host-side management boundary.



### DEC-028, Manager user administration, audit events, and operational alerts
**Status:** Accepted
**Decision:** Preserve the existing database-backed session authentication and the existing `admin` and `user` roles. Add administrator-only user management, append-only audit records, and persisted operational alerts. Disabled accounts must not authenticate; role, activation, and password changes revoke the affected user's sessions. The last active administrator cannot be demoted or disabled. Audit data must exclude credentials and secret material. Alert lifecycle mutations require administrator authorization and must be audited. Initial automatic alerting is limited to the existing read-only firewall polling health signal. This decision does not authorize firewall configuration writes, arbitrary host operations, or an unreviewed notification channel.


### DEC-029, Main-branch development workflow after feature closeout
**Status:** Implemented, PR #5 merged to main on November 21, 2026  
**Decision:** Complete and review the current implementation on `feature/development-seed-data` through a pull request into `main`. After a successful merge, use the updated `main` branch as the sole working branch for upcoming development. Do not continue feature development on the merged branch. Preserve a PR-based merge and verify the local Windows working tree is clean and tracks `origin/main` before starting the next task.


### DEC-030, Documentation-first milestone handoff and branch workflow
**Status:** Accepted, November 21, 2026  
**Decision:** First complete and reconcile the project documentation directly on the current `main` branch. The documentation baseline must describe the actual merged implementation, its limitations, and the next approved development scope. After that documentation work is complete, create a dedicated development branch for implementation only when the user is ready and has authorized branch creation. Do not create, switch, or delete branches without explicit user authorization. Preserve the existing local branches until separately reviewed. This workflow decision does not authorize implementation changes as part of the documentation pass.

### DEC-031, Manager-side managed-site lifecycle
**Status:** Accepted, November 21, 2026  
**Decision:** Administrators may create, view, edit, enable/disable, rotate credentials, update TLS trust, and archive manager-owned firewall connection profiles through the Hub Manager. These operations change only the Hub's inventory and encrypted connection material. They do not authorize configuration changes on pfSense. Site removal uses a non-destructive archive operation: disable the profile, mark it archived, and purge its encrypted API credential and custom TLS trust material. Retain polling history, operational alerts, and append-only audit events; resolve any active or acknowledged alerts when the site is archived. Archived sites are excluded from active inventory and cannot be used for polling or connection tests. Require an explicit typed confirmation at the UI and API boundary for archival. Replacement API credentials must pass an authenticated read-only version check using the profile's current TLS trust before they are stored. Demo records cannot be edited or archived through the administrator API.


## Development sample firewall records

The development seed process must not create synthetic firewall sites. Existing rows marked `is_demo=true` are archived by migration `011_archive_development_demo_sites.sql`, with polling disabled and database records retained for referential integrity. The Sites page is reserved for actual registered firewall profiles. Connectivity is a separate operational view of API-reported reachability, polling enabled state, and last connection check. Do not display invented latency, TLS diagnostics, or failure streaks.


### DEC-033, Automatic Hub access deployment

**Status:** Implemented on `feature/multi-site-onboarding` and merged to `main`; clean Linux Tailscale deployment verified November 22, 2026
**Decision:** When an administrator saves a valid LAN, Tailscale, or Custom access method, Hub Manager automatically dispatches the desired configuration through a narrowly scoped Linux host deployment agent, verifies the HTTPS endpoint, and redirects the browser only after verification succeeds. If apply or verification fails, the agent restores the previous binding and verifies recovery. Normal operation does not require a separate manual apply confirmation. This does not authorize unrestricted Docker socket access, arbitrary command execution, wildcard binds, or automatic Tailscale/DNS/reverse-proxy provisioning. The agent exposes only fixed project/service operations, validates addresses against assigned host interfaces, serializes revisions, and preserves the previous working configuration. Windows Docker Desktop does not have this production host adapter. See [Automatic Hub Access Deployment](AUTOMATIC-HUB-ACCESS-DEPLOYMENT.md).


### DEC-032, Single-entry Linux installation and standard Host Agent provisioning
**Status:** Implemented and clean-install verified on November 22, 2026
**Decision:** The Linux Hub installer is the sole supported first-install entry point. It provisions the Hub application and the restricted Linux systemd Host Agent in one run, generates the agent bearer token and socket configuration locally, verifies the agent service and API-to-agent socket/authentication handshake, waits for web/API/PostgreSQL health, and enables GUI-managed access deployment only after those checks pass. The standalone Host Agent installer remains available for maintenance, not normal onboarding. Tailscale itself is a host prerequisite for Tailscale mode; it is not installed, authenticated, or configured by Hub Manager. The installer refuses to overwrite existing .env/secrets, Host Agent configuration/service, Compose project containers, or the persistent PostgreSQL volume; it never removes volumes to force a fresh installation. The standard operator path is a prepared Debian 13 Proxmox LXC template followed by the two documented clone/install commands. A successful clean install, agent handshake, container health checks, and GUI-managed enablement were verified on November 22, 2026.


### DEC-034, Release branch and installation-documentation boundary
**Status:** Accepted for the November 22, 2026 closeout
**Decision (historical delivery boundary):** At closeout the implementation and tested Linux installer were on `feature/multi-site-onboarding`; that work is now merged to `main`, so operator-facing release installation instructions use `main`. Windows 11 remains a Docker Desktop development environment. The repository contains `scripts/setup-encryption-key.ps1` for Windows key provisioning, but not a complete `install-windows.ps1`; documentation must describe the existing PowerShell key script and the actual Docker Compose workflow without implying a full Windows installer exists.

### DEC-035, Application Settings page scope and functional separation
**Status:** Superseded by DEC-041, November 23, 2026 — the page this decision describes has been retired. The text below is retained as history.
**Decision:** The Hub-wide Application Settings page follows the supplied mockup and contains only two cards, **General** and **Preferences**. General contains Application name with an Edit action and Display timezone with a Change action. Preferences contains Automatic polling, Email notifications, and Require confirmation, each with a supporting description and switch. Use a two-column desktop layout and stack the cards on narrower screens while preserving the approved application design system. This decision approves the page's visual structure only. Existing controls remain preview-only until separately implemented with validated persistence and backend enforcement. Their visual switch positions are not operational defaults. Do not add System Information, Maintenance, Backup & Restore, or host/Docker controls to this page under this decision. Functional settings behavior is deferred to the roadmap and must be implemented through approved API, persistence, authorization, scheduler, notification, and enforcement contracts. See [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md).

### DEC-036, Local Linux development install mode
**Status:** Implemented and verified November 22, 2026
**Decision:** `scripts/install-linux.sh` supports two explicit installation modes and never switches modes implicitly. The default production mode stays privileged and pinned to a root-owned `/opt/pfsense-hub` checkout, because the Host Agent runs as root and executes Docker Compose against that checkout; a user-writable project directory would be a privilege-escalation path. `--local` (alias `--dev`) is an unprivileged development mode that runs from any checkout path, installs no Host Agent and no systemd unit, creates no root-owned files, and keeps `HUB_ACCESS_DEPLOYMENT_ENABLED=false`, so Hub access deployment remains disabled with the existing `503 HUB_ACCESS_DEPLOYMENT_DISABLED` response. Unknown arguments fail with usage instead of being ignored. Installing the privileged production mode at an arbitrary root-owned path remains out of scope and requires a separate decision. Local mode cannot verify or apply Tailscale or Custom Hub access deployment.

### DEC-037, Platform-complete dependency lockfile for source validation
**Status:** Implemented and verified on Linux, November 22, 2026
**Decision:** `package-lock.json` must record the platform-specific optional binary packages for every supported development platform, not only for the platform that generated it. npm records optional dependencies for the resolving platform (npm/cli#4828), so the previously committed lockfile, generated on Windows, contained no `@rollup/*` entries and only `@esbuild/win32-x64`. On Linux, `npm ci` then produced a tree where Rollup could not load its native binding and the API test suite aborted with `Cannot find module @rollup/rollup-linux-x64-gnu` before running any test. The lockfile is now generated with explicit platform overrides, which requires npm 11 or later: `npm install --package-lock-only --os=linux --os=win32 --cpu=x64 --libc=glibc --libc=musl`. This added 76 platform-specific entries and resolved four packages at patch level within their existing ranges (`rollup` and `@rollup/rollup-win32-x64-msvc` to 4.68.8, `fast-json-stringify` to 7.3.10, `caniuse-lite` to 1.0.30001827). Do not reintroduce per-environment binary repair steps: the `npm pack` workaround in `apps/web/Dockerfile` was removed, and the unreferenced `scripts/repair-rollup-linux.mjs` helper was deleted. Any lockfile regeneration requires the source validation suite (tests, typecheck, build) and a clean `npm ci` on Linux before commit. This decision affects dependency reproducibility only; it does not change runtime dependencies, product behavior, or the read-only security boundary.

### DEC-038, Identity-derived Host Agent trust policy and unprivileged development agent
**Status:** Implemented November 22, 2026
**Decision:** The restricted Host Agent derives trust from the identity that runs it instead of from a hard-coded `root` requirement, so GUI-managed Hub access deployment can be exercised from the developer's own checkout without `sudo`. The agent no longer exits when `geteuid() != 0`. Its configuration file, project directory, Compose file, and `.env` must instead be owned by the agent's effective UID/GID and must not be group/world writable, and `.env` must be mode `0600`. A root agent additionally still requires `/opt/pfsense-hub`, so a privileged agent can never be pointed at a user-writable tree; conversely an unprivileged agent cannot run against a root-owned checkout. Both mismatches fail closed. `socket_gid` (default `2000`) and `lock_path` (default `/run/pfsense-hub/deployment.lock`) are now validated configuration fields with production-preserving defaults, so existing `/etc/pfsense-hub/deployment-agent.json` files stay valid without a rewrite, and a new optional `--config PATH` argument selects a different configuration file, defaulting to `/etc/pfsense-hub/deployment-agent.json`. An unprivileged agent refuses a `socket_gid` it cannot grant (`AGENT_SOCKET_GROUP_REQUIRES_ROOT`) rather than silently widening socket access. `scripts/install-linux.sh --local --with-agent` provisions `~/.config/pfsense-hub/deployment-agent.json` owned by the installing account, atomically sets `HUB_DEPLOYMENT_AGENT_TOKEN` (generated once, never regenerated), `HUB_DEPLOYMENT_AGENT_SOCKET`, `HUB_AGENT_GID`, and `HUB_ACCESS_DEPLOYMENT_ENABLED=true` in the existing local `.env`, starts the agent through the new `scripts/dev-host-agent.sh` pidfile harness (no systemd unit, nothing written to `/etc` or `/opt`), recreates only the `api` container, and verifies socket ownership plus the bearer-authenticated API retrieval handshake. This adds no privilege: the account already owns the checkout, already runs the Compose project, and docker-group membership is already root-equivalent. Production behavior, the `/opt/pfsense-hub` pin, the systemd sandbox, the read-only API boundary, and the refusal of configuration-changing firewall operations are unchanged. Tailscale Serve still needs a one-time operator delegation (`sudo tailscale set --operator=<user>`); without it the agent fails closed with `HOST_OPERATION_FAILED` instead of falling back to an unsafe route.

### DEC-039, Host Agent monitoring and recovery operation surface
**Status:** Implemented and committed as `eb008f5`, November 22, 2026. Live-verified on the Ubuntu Docker host on November 23, 2026 for the read paths, bounded logs, Compose validation, the unauthenticated-denial boundary, and one whole-stack restart recorded against the `ahmed` actor; that operation's attribution is still to be confirmed by the operator. Still outstanding: an observed single-service `start`/`stop`/`restart` from the browser, the stack-stop recovery rehearsal from a host shell, and visual acceptance of the page against the approved mockup. See [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md) sections 9 and 10, and [Verification and documentation closeout](VERIFICATION-AND-CLOSEOUT.md) sections 12 and 13.
**Decision:** System Monitoring & Recovery (DEC-026, DEC-027) is implemented through the existing restricted Host Agent rather than a new privileged path. At protocol version 2 the agent requires an explicit `operation` field and supports `system.status`, `system.logs`, `compose.validate`, `system.operation`, and `system.operationResult`; requests are strict objects, so unknown operations, actions, targets, or extra keys are rejected instead of forwarded. `system.operation` accepts only `start`, `stop`, and `restart` for `web`, `api`, and `db`, or `stack` for those three services. Each pair maps to fixed argv with the target interpolated only after allowlist validation, so no caller can supply a Compose argument, flag, profile, container name, project path, or shell fragment. The code-server container, volume deletion, image update or rebuild, command-prompt execution, and arbitrary host administration remain out of scope. Operations are exactly-once by manager-assigned UUID: the manager journals the row and its `system.operation.request` audit event before dispatch, the agent persists the id before answering `accepted`, a retried id is not re-executed, and a reused id with a different action or target is refused with `OPERATION_CONFLICT`. The host journal is `operation_state_path`, defaulting to `host-operations.json` beside `lock_path` (`/run/pfsense-hub/host-operations.json` for the systemd unit, inside `ReadWritePaths` and cleared on reboot; the checkout's `run/host-agent/` for the unprivileged development agent). It is written atomically with mode `0600`, rejects symlinks, foreign owners, malformed envelopes, and unknown entry shapes, prunes settled entries while retaining unsettled ones, and fails closed rather than inferring an outcome. Dispatch answers before execution and the worker takes the same `flock` as `deployment.apply`, so a slow Compose action does not block read-only monitoring. Command completion is not recovery: the agent verifies container state through `docker compose ps` and reports `OPERATION_UNVERIFIED` unless every addressed service reaches the requested state, and the manager sets `verified_at` only from a verified result. Reconciliation settles a row as `unknown` on timeout or when the agent no longer holds the id, and leaves the row untouched while the agent is unreachable instead of inventing an outcome. Both capabilities stay fail-closed behind `HUB_HOST_MONITORING_ENABLED` and `HUB_HOST_OPERATIONS_ENABLED` (the latter requires the former), with `HUB_HOST_OPERATION_TIMEOUT_MS` bounding reconciliation, and every mutation route stays administrator-only and audited. This decision adds no Docker socket to the web or API containers, no arbitrary command execution, and no pfSense configuration change.

### DEC-040, Hub mobile navigation tab set

**Status:** Implemented and verified as `20cc109`, November 23, 2026
**Decision:** The Hub-context mobile bottom bar is an explicit, typed list of five destinations: **Overview**, **Sites**, **Connectivity**, **Alerts**, and **System monitoring**. The fifth tab is no longer labelled *Settings*: that label matched no page and tapping it only moved the highlight without navigating. The **System monitoring** tab targets `/settings/system-recovery`. The highlight is driven by the current page matching each tab's declared target, and the selected button also carries `aria-current="page"`; the previously tapped label survives only as a local fallback for the **More** tab, which opens the navigation menu instead of navigating. Two-word labels wrap inside the 62 px bar. Site-context tabs are unchanged (Overview, Monitoring, Interfaces, Rules, More). Hub Settings, User Management, and Audit Logs stay reachable from the slide-in navigation menu; the former Application Settings entry was retired by DEC-041. Tab targets are declared per tab, so renaming a page label can no longer silently misroute a tab. This decision covers navigation only; it does not change any page's functional scope.

### DEC-041, Retire the Hub-wide Application Settings page

**Status:** Implemented November 23, 2026

**Decision:** The Hub-wide **Application Settings** page is retired, and DEC-035 is superseded for the page it described. `docs/PRD.md` defines no application-preferences requirement, and each approved row duplicated a capability that another approved surface already owns or a capability the project has explicitly not implemented: Hub access configuration belongs to Hub Settings (FR-13, DEC-025, DEC-033), per-site polling enablement belongs to the managed-site lifecycle (DEC-031), notification delivery and background scheduling are deferred requirements that must not be represented as implemented, and consequential-action confirmation is required unconditionally per action by FR-9, DEC-031, and DEC-039 rather than exposed as a switchable global preference. A global off-switch for confirmation would have weakened an existing control.

The Administration navigation entry, the `app-settings` page identifier, the `/settings/application` route, the placeholder settings card component, and its local toggle state are removed from `apps/web/src/App.tsx`; the page-specific rules are removed from `apps/web/src/style.css`, and the generic `.settings-grid` and `.settings-row` helpers used only by that screen were removed in a follow-up commit together with the `.settings-grid` fragments inside the shared auth-form selectors and the mobile override. `/settings/application` now redirects to `/settings/hub` with a history replacement, so an existing bookmark lands on Hub Settings instead of silently falling through to the Hub overview. The same placeholder block was also reused inside Site Settings under a *Site preferences* heading while displaying Hub-wide values (application name, display timezone, and a global confirmation switch); it is removed as well, so no fabricated preference switch remains in the interface. Site Settings keeps its reviewed device-profile panel and its existing edit, enable/disable, credentials/TLS, and archive actions.

Application name and display timezone are not implemented anywhere. If a later approved feature needs a persisted, administrator-only, audited Hub display name or timezone, it belongs with the Hub configuration surface under FR-13 and needs its own contract, validation, authorization, audit event, and tests. The three former preference switches are not carried over to another page: per-site polling stays with the managed-site lifecycle, notification delivery stays a deferred release requirement, and confirmation stays an enforced per-action policy.

This decision adds no API route, database migration, scheduler, notification provider, authorization rule, or audit event, and no setting is persisted or enforced. The DEC-035 mockup remains in the documentation history but is no longer a binding visual specification, because the screen it pictures no longer exists in the product. Reintroducing an application-preferences page requires a new PRD requirement and a new decision. See [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md#outcome-november-23-2026) and [Verification and documentation closeout](VERIFICATION-AND-CLOSEOUT.md) section 14.

### DEC-042, Site telemetry from the eight approved read-only endpoints

**Status:** Implemented November 23, 2026

**Decision:** The site workspace pages Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility read live data from one sanitized contract, `GET /api/v1/devices/:deviceId/snapshot`, instead of illustrative fixtures. The endpoint performs the existing fixed eight-operation collection (`status/system`, `status/gateways`, `status/interfaces`, `status/services`, `system/version`, `diagnostics/arp_table`, `firewall/states`, `firewall/states/size`) and adds no upstream route, HTTP method, firewall permission, or caller-controlled destination. The pre-existing `GET /api/v1/devices/:deviceId/overview` path is retained as an alias of the same handler so a second collection path cannot diverge.

The manager never forwards a firewall payload. `apps/api/src/pfsense/observations.ts` validates each response with a narrow schema and constructs an explicit allowlisted object, so serial numbers, Netgate IDs, MAC addresses, hardware interface names, monitor and source IP addresses, and packet/byte counters are not modeled at all. ARP and state-table responses contribute counts and limits only; no entry is persisted, returned, or logged.

Compatibility metadata is persisted by migration `016_device_compatibility.sql` (`release`, `platform`, `api_package_version`, `compatibility`, `compatibility_checked_at`) and appears in the device inventory. `api_package_version` remains `null` and CPU architecture remains unreported because no approved endpoint exposes either; they are not inferred. A compatibility verdict of `mismatch` is recorded only when the firewall's own release/platform string contradicts the edition declared in the site profile, and the page asks the administrator to correct the profile; the manager does not change firewall configuration.

Capability state is derived from each device's own recorded `poll_runs`. A successful operation reports `supported: true`. Only `unsupported`, `authorization`, and `authentication` failures report `supported: false`, because those are the only classes that establish the firewall refused or lacks the operation. Transport, TLS, rate-limit, and schema failures report `supported: null` with a failed verification, and a device with no polling history reports `unverified` rather than `supported`. `poll_runs.operation_group` now records one label per operation (`arpTable` replaces the shared `diagnostics` label); capability derivation falls back to the historical labels for rows written before this decision.

The server caches a snapshot in process for 10 seconds (success) or 2 seconds (partial/unavailable), configured by `PFSENSE_OBSERVATION_CACHE_MS` and `PFSENSE_OBSERVATION_ERROR_CACHE_MS`, with single-flight per device and a 64-device bound. Successful results are evicted when a device's profile, credential, TLS trust, or enabled state changes, or when it is archived. Nothing is persisted across restarts. The browser uses the same 10-second window and single-flight behavior, so navigating Overview → Monitoring → Interfaces → Gateways → Services → Compatibility performs one snapshot request and one eight-operation collection.

**Explicitly not added:** CPU or memory history and trend charts (the API returns a point-in-time sample), utilization alerts (no approved thresholds), a claimed REST API package version or CPU architecture, any write operation, any state-changing firewall action, and any change to the eight-endpoint firewall-side permission scope. Rules, Aliases, NAT, Routing, DHCP, DNS, Certificates, and VPN remain explicitly labeled preview fixtures because no approved endpoint supplies their data.

**Verification:** API typecheck, web typecheck, and production build pass; the API suite reports 314 passed tests, including new sanitization, cache, capability, and route-boundary tests. Migration `016_device_compatibility.sql` applied on the running development stack, the API restarted healthy, and the new routes reject unauthenticated requests with `401 AUTHENTICATION_REQUIRED`. A live authenticated session then produced a full snapshot of the registered firewall: all eight operations recorded `success`, no poll alert was raised, and the inventory reports `release` `26.07.2-RELEASE`, `platform` `Netgate 2100`, `compatibility` `verified`. That session also exposed one defect — the compatibility queries selected `device_id` from `managed_devices`, whose key is `id`, so `GET /api/v1/devices` returned `500` and the site list failed to load. The projection is now `id AS device_id`, the SQL was re-run against the live database before rebuilding, and the repository tests pin the projection.

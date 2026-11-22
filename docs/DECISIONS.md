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
**Status:** Accepted
**Decision:** Provide access configuration in the existing **Administration → Hub Settings** area. A fresh installation remains bound to `127.0.0.1` by default. The administrator may save an optional Tailscale IPv4 address and, in later increments, approved hostname/reverse-proxy metadata. These values are desired configuration, not proof of reachability. The application stores validated non-secret settings in PostgreSQL and reports them as configured, never as connected until a real probe succeeds. The GUI must not require Tailscale or a reverse proxy. Docker host-port publication is controlled by the host deployment, not by a containerized web application; applying a changed bind address therefore requires a narrowly scoped, authenticated host-side deployment mechanism or an explicit operator apply step. Never mount the Docker socket into the web or API containers, never bind to `0.0.0.0` by default, and do not enable remote access until manager authentication/authorization and the required host-side apply controls are in place. Keep the API and PostgreSQL unpublished to external interfaces.

### DEC-026, Hub-only Docker Compose operations and monitoring
**Status:** Accepted
**Decision:** Provide a simple System Monitoring and Recovery area in the existing Administration interface for this project's Docker Compose stack only. The dedicated host is reserved for pfSense Hub Manager; managing unrelated host containers is explicitly out of scope. The initial feature scope is host resource visibility (CPU, memory, and disk where safely available), health/status for the web, API, PostgreSQL, and code-server services, service logs, and individual service start/stop/restart controls, plus whole-stack start/stop/restart and Compose configuration validation. Operations must be implemented through a narrowly scoped host-side management boundary with an explicit allowlist for this Compose project. Do not mount the Docker socket into the web or API containers, expose arbitrary shell/Compose execution, or permit volume deletion. Stack stop/down makes the GUI unavailable, so recovery must be documented as a host-side Docker Desktop/CLI operation. Rebuild/recreate, image updates, destructive database maintenance, and broader host management are deferred until separately reviewed.


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


### DEC-026, automatic Hub access deployment

**Decision:** Once an administrator saves a valid LAN, Tailscale, or Custom access method, Hub Manager should automatically apply the desired binding through a narrowly scoped host-side deployment agent, verify the new endpoint, and redirect the browser only after verification succeeds. If apply or verification fails, restore the previous binding and verify recovery. Normal operation must not require a separate manual deployment confirmation. This decision does not authorize unrestricted Docker socket access, arbitrary command execution, wildcard binds, or automatic Tailscale/DNS/reverse-proxy provisioning. The host agent must expose only a fixed project/service operation, validate addresses against assigned host interfaces, serialize revisions, and preserve the previous working configuration. The Linux production adapter and Windows Docker Desktop adapter must be treated separately. The feature remains disabled until implementation and host integration tests pass. See [Automatic Hub Access Deployment](AUTOMATIC-HUB-ACCESS-DEPLOYMENT.md).

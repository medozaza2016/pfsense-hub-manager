# Frontend implementation and coverage

**Last reconciled:** November 23, 2026  
**Active branch:** `main`

## Visual authority

The approved source is the original **pfSense Hub Manager Redesign Mockup**, preserved in the project reference files at:

`/Projects/pfSense Hub Manager/mockups/pfsense-hub-manager-approved.png`

The image is the binding visual specification. Preserve its light workspace, dark navy sidebar, restrained blue actions, status treatment, responsive navigation, and desktop/mobile composition. See the root `AGENTS.md` for mandatory visual and implementation rules.

## Current implementation status

The frontend is a React/TypeScript/Vite application. It uses the existing backend contracts and preserves the approved design system. The current feature branch includes both API-backed workflows and explicitly labeled preview areas; do not describe every visible page as live firewall data.

### Hub workspace

- **Hub Overview, Sites, Connectivity:** load managed-device inventory from the authenticated `GET /api/v1/devices` API. Reachability is shown from recorded connection-check results, not inferred from the existence of a profile.
- **Sites:** administrator Add Site flow, certificate discovery, independent fingerprint confirmation, pre-registration connection test, profile creation, edit, enable/disable, credential rotation, custom TLS trust set/remove, connection test, and typed archive flow are wired to administrator-only API routes.
- **Alerts:** API-backed records and lifecycle actions, including bulk acknowledge/resolve behavior.
- **User Management:** API-backed user listing, creation, role/status changes, and password reset flows.
- **Audit Logs:** API-backed audit events with sanitized metadata.
- **Hub Settings:** Local, Tailscale, and Custom access method tabs, deployment state, revision tracking, last-verified recovery address, and recent deployment history.
- **Application Settings:** approved two-card General and Preferences frontend placeholder (DEC-035); values and switches are not persisted or enforced.
- **System Monitoring & Recovery:** live Administration page at `/settings/system-recovery`, wired through the API to the restricted Host Agent (DEC-039). Also the Hub mobile **System monitoring** tab (DEC-040). See [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md).

### Site workspace and data boundary

The Site workspace contains Overview, Monitoring, Interfaces, Firewall Rules, Aliases, NAT, Routing, Gateways, DHCP, DNS, Services, Certificates, VPN, Compatibility, and Site Settings.

The Hub inventory and site registration/profile/connection lifecycle are API-backed. Several firewall-domain pages outside the currently implemented read-only overview still contain preview fixtures. Preview fixtures are not live firewall state and must remain visibly identified as preview data. No frontend action may imply a firewall configuration change.

### Site onboarding and lifecycle

The Add Site workflow collects site name, optional location, edition, HTTPS API origin, API credential, optional TLS server name, and optional custom CA bundle. It can discover the certificate presented by the firewall before credentials are submitted. The administrator must independently confirm the displayed SHA-256 fingerprint before the authenticated pre-registration test proceeds.

Registration repeats the authenticated read-only `version` request server-side. The backend generates the device UUID, encrypts API credentials and custom TLS trust, stores the profile and connection-check result, and returns no plaintext secret. Credentials and CA text are cleared after successful registration.

Site Settings and inventory actions are backed by administrator-only API routes for non-secret profile edits, enable/disable, credential rotation, TLS trust updates, connection testing, and non-destructive archival. Credential and CA fields are write-only. Demo records cannot be used as live firewall workspaces or modified through the administrator lifecycle API.

The API still exposes only the fixed eight-operation pfSense GET allowlist. Adding or editing a site does not authorize firewall configuration writes.

## Hub Settings save interaction

Hub Settings provides Local, Tailscale, and Custom access tabs. Exactly one method is active at a time; each method retains its own endpoint values.

When an administrator saves a valid endpoint, the API stores the desired revision and queues the Linux Host Agent deployment. The button itself then shows a circular spinner and phase-specific label, such as Saving, Applying, Validating, Verifying, or Restoring. The tabs and endpoint fields are disabled while deployment is active. The busy state remains until the deployment reaches a terminal state, rather than ending when the API merely accepts the request.

The UI shows endpoint verified/failed/rollback state, desired and applied revisions, safe error guidance, recent deployment history, and the last verified origin as a recovery link. It redirects only after a successful HTTPS origin is returned by the backend. A successful host-side probe does not guarantee that the administrator's device has DNS and routing to the new endpoint.

The user manually confirmed the updated progress animation in the browser after rebuilding the web service.

## Shared UI and interaction components

The reusable components in `apps/web/src/components/` include:

- `DataTable<T>`: typed columns, sorting, client-side search integration, pagination, loading and empty states, optional row actions, selection, and responsive mobile-card rendering.
- `ListToolbar`: search, expandable filter controls, active-filter counts, removable filter chips, and clear-all behavior.
- `SearchField`, `PageHeader`, `EmptyState`, and `Feedback`: reusable presentation primitives.
- `ToastProvider`: application-wide success, info, warning, and error notifications. Inline validation remains alongside toasts where users need field-level correction.

Sorting and pagination are client-side over the rows returned by the API. Server-side pagination, URL-persisted filters, and large-inventory performance remain future work. Sites, User Management, and Alerts use mobile-card presentation where implemented. Other table views retain their current responsive behavior until explicitly migrated.

## Preview and development data

Development demo-site records are marked with `is_demo=true`, disabled, and use reserved `.invalid` endpoints. They must never be presented as reachable production firewalls. Development seed commands are guarded by `NODE_ENV=development` and must not be run against production.

The inventory refresh action reloads manager inventory. It is not a firewall connection test. A device's enabled state is not a reachability result. A successful explicit connection test records a timestamp and result in the backend.

## Validation record

The Windows local run on the feature branch reported:

- `npm test`: 177 passed, 4 skipped (16 test files passed, 1 skipped). The four skipped cases are the Unix-domain-socket client tests intentionally skipped on Windows.
- `npm run typecheck`: API and web checks passed.
- `npm run build`: API build and web TypeScript/Vite production build passed.

The clean Debian 13 install built the web image successfully. The user completed the Hub Settings Tailscale browser flow and saw **Endpoint verified** with desired revision 2 and applied revision 2. The subsequent Save-button progress animation was confirmed working in the browser.

This is not a full visual acceptance pass for every screen, navigation item, modal, and viewport. Do not state that every page has been compared one-to-one against the approved mockup. Exact evidence and remaining gaps are in [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md).

## Application Settings frontend placeholder status

The Application Settings frontend placeholder is implemented on main in apps/web/src/App.tsx and apps/web/src/style.css. It follows DEC-035 and contains only the approved General and Preferences cards. The layout uses two columns on desktop and stacks at narrower breakpoints. The three preference switches update local React state only. The Application name Edit and Display timezone Change actions are placeholders that report the corresponding workflows are not available yet.

**Frontend milestone:** Implemented. **Functional workflows:** Pending. No Application Settings value is currently persisted to PostgreSQL or enforced by an API, scheduler, notification service, or protected-action backend policy. Do not describe these controls as operational. The remaining workflow scope and acceptance boundary are tracked in Application Settings page redesign and Roadmap.

**Scope under review:** the product requirement for this page is not settled. The PRD defines no Application Settings requirement; Hub access configuration belongs to Hub Settings (PRD FR-13, DEC-025, DEC-033); per-site polling belongs to the site; and notification delivery, background scheduling, and confirmation enforcement are separately deferred capabilities. DEC-035 approves the page's visual structure only. Whether the page stays, is reduced, or is retired is an open decision recorded in [DECISIONS](DECISIONS.md) and evaluated in [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md#necessity-and-scope-evaluation-november-23-2026). Do not implement settings persistence or enforcement until that question is answered.

Browser visual and interaction acceptance across desktop, tablet, and mobile remains pending. The implementation status above is based on source inspection, not a claim that a new browser test pass was performed in this documentation update.

## Platform boundary

Windows 11 with VS Code and Docker Desktop is the local development platform. It runs the frontend and API but does not run the production Linux systemd Host Agent. Automatic host access deployment is Linux-only. A Windows host deployment adapter is not implemented.

## Historical implementation notes

Earlier sections of this document described the frontend-first preview phase and the pre-onboarding `main` baseline. Those were accurate when written but are superseded by the current implementation status above. Retain those historical decisions only where they explain why some screens remain preview-only.

## Application Settings page redesign, November 22, 2026

The target layout is documented in [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md) and follows the mockup supplied during the November 22 design review.

The page contains exactly two cards:

- **General:** Application name with an **Edit** action, and Display timezone with a **Change** action.
- **Preferences:** Automatic polling, Email notifications, and Require confirmation, each with its supporting description and a right-aligned switch.

At desktop widths the cards sit side by side; at tablet and mobile widths they stack. Preserve the existing light workspace, navy sidebar, blue action treatment, typography, spacing, and shared component conventions.

**Current behavior boundary:** The preference switches are local React state only. They do not persist to PostgreSQL or control a backend service. The General actions are preview affordances, not persisted settings. The mockup's switch positions are illustrative, not approved operational defaults. The redesign must not show a successful save or imply that polling, email delivery, or confirmation enforcement is active.

**Scope:** Do not add System Information, Maintenance, Backup & Restore, or host/Docker controls to this page as part of this design increment. Do not create API routes, migrations, background jobs, notification providers, or backend enforcement in the visual redesign. Track that work in the future functional items in [Roadmap](ROADMAP.md).

**Acceptance:** The page matches the supplied mockup's title/subtitle, two-card structure, labels, descriptions, actions, alignment, and responsive behavior. Keyboard operation, visible focus, accessible switch labels, and narrow-width overflow still require a recorded browser pass. The functional scope is additionally blocked on the open necessity decision described above.


## System Monitoring & Recovery

**Status:** Implemented and live-verified (DEC-039); the implemented scope is locked in [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md) section 10.

The page is a separate Administration destination at `/settings/system-recovery`. It must not be folded into Application Settings or confused with per-firewall/site Monitoring. It is also the target of the fifth Hub mobile bottom-bar tab, **System monitoring** (DEC-040).

The page renders live host data obtained through the API from the restricted Unix-socket Host Agent:

- Host resource cards for CPU utilization, memory utilization, disk utilization, and host uptime, from `GET /api/v1/system/status`. A metric the agent cannot read renders as unknown rather than as an invented value.
- Docker Compose service state and health for Web, API, and PostgreSQL only. Absent, unhealthy, and unknown containers are reported as such.
- Per-service Start, Stop, and Restart, and whole-stack Start, Stop, and Restart, submitted through `POST /api/v1/system/operations` with a fixed action/target pair. Controls are disabled for non-admins and while any operation is active.
- A bounded, redacted service log panel from `GET /api/v1/system/services/:service/logs?lines=`.
- Compose configuration validation for the fixed project file via `POST /api/v1/system/compose/validate`.
- Operation history from `GET /api/v1/system/operations[/:id]`, polled while an operation is in flight.
- Host-side recovery guidance, the stack-stop outage warning, the code-server exclusion note, and the role model note.

Stack Stop requires a typed confirmation phrase. Status polls on a 10 s interval. The page never fabricates resource values, service health, logs, validation results, or operation outcomes, and it cannot execute a shell or reach Docker directly; disabled or hidden controls are presentation only, and the API and agent re-check role, flag state, and the operation allowlist on every request.

**Verification boundary:** a desktop browser session against the running agent is confirmed for status polling, Compose validation, and one whole-stack restart that returned all containers to healthy, whose attribution is still to be confirmed. Tablet and narrow-width visual acceptance, a per-service operation observed in the browser, and the stack-stop recovery rehearsal remain outstanding and are tracked in [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) section 13.

See [System Monitoring & Recovery requirements and implementation plan](SYSTEM-MONITORING-RECOVERY.md) and DEC-026/DEC-027/DEC-039 for the complete approved scope and security boundaries.

## Hub mobile navigation

At widths up to 760 px the Hub context shows a five-tab bottom bar: **Overview**, **Sites**, **Connectivity**, **Alerts**, and **System monitoring**. Each tab declares its target page explicitly instead of being matched to a label, so renaming a page label cannot silently misroute a tab. The selected tab is derived from the current page and carries `aria-current="page"`; two-word labels wrap inside the 62 px bar.

The previous fifth tab was labelled *Settings* and matched no page, so tapping it moved the highlight without navigating. Hub Settings, User Management, Audit Logs, and Application Settings remain reachable from the slide-in navigation menu instead. Site-context tabs are unchanged: Overview, Monitoring, Interfaces, Rules, and More. See DEC-040.

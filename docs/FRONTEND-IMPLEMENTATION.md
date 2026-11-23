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
- **Application Settings:** retired November 23, 2026 (DEC-041). The Administration entry, the `/settings/application` route, and the preview cards were removed; `/settings/application` now redirects to `/settings/hub`.
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

## Application Settings retirement, November 23, 2026

The Hub-wide **Application Settings** page is retired by [DEC-041](DECISIONS.md#dec-041-retire-the-hub-wide-application-settings-page). It had no PRD requirement, and its five approved rows duplicated capabilities owned by Hub Settings (FR-13, DEC-025, DEC-033), the managed-site lifecycle (DEC-031), User Management and Audit Logs (DEC-028), or System Monitoring & Recovery (DEC-039), or described capabilities the project explicitly defers.

Removed from `apps/web/src/App.tsx`: the Administration navigation entry, the `app-settings` page identifier, the `page === "app-settings"` render branch, the `pageTitle` value that fed only that branch, the `/settings/application` route-map entry, the placeholder settings card component, and its local toggle state. Removed from `apps/web/src/style.css`: the page-specific `.app-settings-*` and `.app-setting-row` rules. The `.switch` rules stay because User Management uses them for account status. The generic `.settings-grid` and `.settings-row` helpers were used only by the retired screens, so they were deleted in a follow-up commit, together with the `.settings-grid` fragments inside the shared auth-form selectors and the mobile grid override.

The same placeholder block had also been reused inside Site Settings under a *Site preferences* heading, where it displayed Hub-wide values (application name, display timezone, a global confirmation switch) on a per-site page. It was removed with the page, so no fabricated preference switch remains anywhere in the interface. Site Settings keeps its Device profile panel and its existing edit, enable/disable, credentials/TLS, and archive actions.

`/settings/application` redirects to `/settings/hub` with a history replacement rather than silently resolving to the Hub overview, so an existing bookmark lands on a real page.

**Not implemented:** application name and display timezone are not persisted or editable anywhere. If a requirement ever needs them, they belong to the Hub configuration surface under FR-13 and need their own contract. Per-site polling stays with the managed-site lifecycle, notification delivery stays a deferred release requirement, and confirmation stays an enforced per-action policy (FR-9, DEC-031, DEC-039).

**Verification:** `npm run typecheck`, `npm test` (22 files, 275 tests), and `npm run build --workspace @pfsense-hub/web` all exit 0; the current bundle is `index-ee0p_jPM.js` with `index-Dde5v36r.css`, and the served files match it. The built bundle no longer contains the page's labels or identifiers, and the served CSS no longer contains the retired page's rules or the dead `.settings-grid`/`.settings-row` helpers. See [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) section 14.

## Platform boundary

Windows 11 with VS Code and Docker Desktop is the local development platform. It runs the frontend and API but does not run the production Linux systemd Host Agent. Automatic host access deployment is Linux-only. A Windows host deployment adapter is not implemented.

## Historical implementation notes

Earlier sections of this document described the frontend-first preview phase and the pre-onboarding `main` baseline. Those were accurate when written but are superseded by the current implementation status above. Retain those historical decisions only where they explain why some screens remain preview-only.

## Application Settings page redesign, November 22, 2026 (superseded)

The November 22 design specification for the two-card page is superseded by DEC-041 and retained in [Application Settings page redesign](APPLICATION-SETTINGS-REDESIGN.md) as history. The General and Preferences cards no longer exist in the interface, so their layout, labels, switch behavior, and acceptance criteria are not implementation requirements.


## System Monitoring & Recovery

**Status:** Implemented and live-verified (DEC-039); the implemented scope is locked in [System Monitoring & Recovery](SYSTEM-MONITORING-RECOVERY.md) section 10.

The page is a separate Administration destination at `/settings/system-recovery`. It must not be folded into Hub Settings or confused with per-firewall/site Monitoring. It is also the target of the fifth Hub mobile bottom-bar tab, **System monitoring** (DEC-040).

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

The previous fifth tab was labelled *Settings* and matched no page, so tapping it moved the highlight without navigating. Hub Settings, User Management, and Audit Logs remain reachable from the slide-in navigation menu instead; the former Application Settings entry was retired by DEC-041. Site-context tabs are unchanged: Overview, Monitoring, Interfaces, Rules, and More. See DEC-040.

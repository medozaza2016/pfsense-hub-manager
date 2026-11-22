# Frontend implementation and coverage

**Last reconciled:** November 22, 2026  
**Active branch:** `feature/multi-site-onboarding`

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
- **Application Settings:** application preference/security UI; do not assume all settings imply external integrations or infrastructure provisioning.

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

## Platform boundary

Windows 11 with VS Code and Docker Desktop is the local development platform. It runs the frontend and API but does not run the production Linux systemd Host Agent. Automatic host access deployment is Linux-only. A Windows host deployment adapter is not implemented.

## Historical implementation notes

Earlier sections of this document described the frontend-first preview phase and the pre-onboarding `main` baseline. Those were accurate when written but are superseded by the current implementation status above. Retain those historical decisions only where they explain why some screens remain preview-only.

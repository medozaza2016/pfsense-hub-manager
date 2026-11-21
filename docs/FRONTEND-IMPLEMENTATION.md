# Frontend implementation plan and coverage

## Visual authority

The approved source is the original **pfSense Hub Manager Redesign Mockup**, preserved in the project reference files at:

`/Projects/pfSense Hub Manager/mockups/pfsense-hub-manager-approved.png`

The image is the binding visual specification. Desktop Hub Overview, Site Overview, and the supplied mobile arrangements must be reproduced one-to-one. See the root `AGENTS.md` for mandatory rules. Do not substitute generic styling or treat the reference as inspiration.

## Delivery boundary

This milestone is frontend-first. All pages, navigation, layouts, responsive behavior, preview states, and local interactions are built before additional API wiring.

- Preview fixtures are demonstration data only and are labeled as such in the UI.
- Preview actions modify local UI state only. They do not register devices, change firewall configuration, or claim that a live operation succeeded.
- The existing Fastify API, PostgreSQL schema, provider, security boundary, and existing backend tests remain untouched by this frontend increment.
- Backend integration will be resumed later, incrementally, against existing contracts and verified capabilities. Do not invent endpoints or broaden the read-only firewall permission scope.

## Current frontend coverage

### Hub workspace
- Hub Overview
- Sites, including local search, status filtering, and preview-only Add Site
- Connectivity
- Alerts
- Hub Settings
- User Management
- Audit Logs
- Application Settings

### Site workspace
- Overview
- Monitoring
- Interfaces
- Firewall Rules
- Aliases
- NAT
- Routing
- Gateways
- DHCP
- DNS
- Services
- Certificates
- VPN
- Compatibility
- Site Settings

### Interaction foundation
- Contextual Hub/Site navigation and Back to Hub
- Responsive desktop sidebar and mobile drawer
- Mobile bottom navigation
- Search and status filters
- Preview-only Add Site dialog
- Local preference toggles
- Page-level tables and row actions
- Visible preview/demo boundary and feedback notices

## Validation still required

This source update has not been run through the local Windows/Docker build or browser. Before treating the frontend milestone as complete:

1. Run `npm run typecheck --workspace @pfsense-hub/web`.
2. Run `npm run build --workspace @pfsense-hub/web`.
3. Run the application through the existing Docker Compose workflow.
4. Compare desktop and mobile screenshots directly against the approved image.
5. Exercise every navigation item, dialog, filter, toggle, and row action.
6. Correct any visual or functional differences, then repeat the checks.

This document records implementation coverage, not a claim that visual acceptance or frontend completion has already passed.


## Data integration status, November 21, 2026

The current redesigned frontend is a presentation and interaction shell. It is **not yet connected to the real device inventory or live database data**.

Confirmed implementation details:

- Hub and Site pages are populated with local demonstration fixtures in `apps/web/src/App.tsx`.
- Site search, status filters, Add Site, preference toggles, and preview refresh operate on browser-local React state.
- The Online/Offline badges and dashboard metrics in this frontend are illustrative. They must not be interpreted as verified firewall reachability or live telemetry.
- The Fastify API and PostgreSQL implementation on `main` remain the backend foundation. They are not changed by the frontend presentation branch.
- The current API/provider is configured for one firewall through environment variables and a Docker-mounted API-key secret. The database currently has a basic `managed_devices` table and poll-run history. It does not yet provide a complete multi-site registration and per-device credential lifecycle.
- The manager API currently exposes read-only device inventory, capabilities, and overview collection for the configured device. It does not expose Add Site, Edit Site, Remove Site, credential management, or arbitrary firewall API proxy routes.

Do not connect the frontend to a mock endpoint or create fake persistence to make the screens appear live. The next integration work must extend the actual backend and database contracts, then bind the UI to those contracts.

## Next implementation sequence, real data

1. **Preserve and baseline the merged foundation.** Keep the approved visual design and the existing eight-route read-only pfSense provider intact.
2. **Define the Site domain and database lifecycle.** Design stable site IDs, display name, location, edition, API origin/connection profile, enabled state, compatibility state, last-contact metadata, and a server-side credential reference. Add migrations and repository tests. Do not store API keys in ordinary site rows.
3. **Choose and document secret handling before multi-site credentials.** The current single-device Docker secret is not a multi-device secret store. Select a protected per-site credential mechanism, including encryption/key management, rotation, deletion, backup, and recovery. Do not send secrets to the browser.
4. **Implement safe site onboarding.** Add a server-side create-site workflow with strict input validation and destination restrictions, securely store the credential, test verified TLS and API-key authentication, identify edition/release/API package where available, and report classified connection outcomes. Failed tests must not create a falsely Online site.
5. **Implement real inventory and site detail APIs.** Replace environment-only single-device lookup with database-backed multi-site repositories and device-scoped provider instances. Keep the fixed read-only upstream route allowlist, per-site isolation, timeouts, and secret redaction.
6. **Wire the frontend in small vertical slices.** First Hub Overview and Sites list, then Add Site, then Site Overview and its read-only sections. Remove demonstration fixtures only when each corresponding API path is implemented and tested. Add loading, empty, partial, offline, unsupported, and error states.
7. **Verify on the Windows 11 / Docker Desktop development environment.** Run type checks, tests, builds, Compose validation, and manual browser checks at desktop and mobile breakpoints. Then verify the same approved read-only integration against the real Plus firewall. Do not connect the CE firewall until the user explicitly schedules that work.

### Security and scope gates

- Keep the application read-only. Site registration is a manager-side inventory operation, not permission to change firewall configuration.
- Never place firewall credentials in React state, browser storage, frontend bundles, URL query strings, logs, or API responses.
- Never accept an arbitrary caller-supplied upstream URL/path/method and forward it to a firewall. Validate and constrain destinations to prevent SSRF.
- Enforce TLS certificate and hostname verification. A self-signed certificate requires explicit trust configuration, not a verification bypass.
- Do not label a site Online merely because its record exists. Online status requires a recent successful, verified connection result.
- Do not enable write endpoints or broaden the existing eight firewall GET privileges as part of onboarding.
- Manager-user authentication and authorization remain an unresolved prerequisite for exposing administrative site/credential management beyond a trusted local development boundary.


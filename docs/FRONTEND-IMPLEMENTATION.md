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

The Windows validation run on November 21, 2026 passed the web TypeScript check and production Vite build as part of the root commands. Browser-based visual acceptance remains pending. Before treating the frontend milestone as complete:

1. Run the application through the existing Docker Compose workflow.
2. Compare desktop and mobile screenshots directly against the approved image.
3. Exercise every navigation item, dialog, filter, toggle, and row action.
4. Correct any visual or functional differences, then repeat the checks.

This document records implementation coverage, not a claim that visual acceptance or frontend completion has already passed.


## Data integration status, November 21, 2026

The Hub Overview, Sites, and Connectivity pages now load the managed-device inventory from the authenticated `GET /api/v1/devices` API. The frontend no longer initializes the Sites page from the old three hardcoded device cards.

- The API exposes `isDemo`, `enabled`, and an explicit `connectionState`.
- Demo records are disabled, use reserved `.demo.invalid` endpoints, and remain `unknown`. They cannot be opened as live firewall workspaces and the device overview endpoint only accepts the configured real device ID.
- The Hub Overview counts online, offline, and unknown records separately. It does not infer reachability from a database row.
- The inventory refresh action reloads the API inventory. It does not contact a firewall.
- Add Site remains a local preview action. Secure multi-site onboarding and credential storage are not implemented.
- Per-site live polling, verified connection state for additional sites, and real telemetry remain unimplemented.

### Development demo-site seed

Migration `006_development_demo_sites.sql` adds `managed_devices.is_demo` and a site count to the development seed-run ledger. The seed runner adds seven stable demo records under a separate seed key. This separate key is intentional: if the older development seed has already been run, the next seed invocation can add the seven demo sites without duplicating users, alerts, or audit events.

The seed is additive and idempotent. It uses fixed UUIDs and `ON CONFLICT DO NOTHING`; it does not update or delete existing device rows, reset the database, or delete volumes. The demo records are disabled and use reserved `.invalid` endpoints. They are not real firewall devices.

After local code is updated, build the API before running the seed because the package script executes the compiled file:

```powershell
docker compose up -d --build api
docker compose exec -e NODE_ENV=development api npm run db:seed:dev
```

Run only in the local development environment. The script requires `NODE_ENV=development` and `DATABASE_URL`, runs pending migrations, and refuses to seed without an active administrator. Do not run this against production.

## Reusable UI framework increment

Branch: `feature/development-seed-data`

The shared components in `apps/web/src/components/` provide the common listing experience:

- `DataTable<T>`: typed columns, sorting, client-side search integration, pagination, 10/25/50/100 page sizes, loading and empty states, and optional row actions.
- `ListToolbar`: consistent wide search, expandable filter section, active-filter count, removable filter chips, and clear-all behavior.
- `SearchField`, `PageHeader`, `EmptyState`, and `Feedback`: reusable presentation primitives.
- `ui.css`: shared layout, typography, table, search, filter, pagination, loading, and responsive styles.

Adoption includes Sites, Connectivity, Alerts, User Management, Audit Logs, and the firewall data preview lists. Sites now uses a sortable table rather than a separate card-grid listing. Alerts uses the shared table instead of bespoke table markup. Domain-specific filters and row actions remain on their respective pages.

### Pagination and filtering boundary

Sorting and pagination are functional in the browser over the rows returned to each page. They are not server-side pagination. The current API list endpoints return arrays, and Audit Logs is capped by its request limit. Server-side pagination, validated sort/filter query contracts, URL-persisted filters, and larger-dataset performance remain future work.

### Validation still required

The changes are committed to the feature branch, but have not been built or tested in the user's Windows/Docker environment. Before merging:

1. Fetch and switch to `feature/development-seed-data`.
2. Run root API/web type checks, tests, and production build.
3. Start the existing Docker Compose stack without deleting volumes.
4. Run the development seed once, then run it again to confirm the second run inserts no duplicate records.
5. Confirm the seven demo sites appear as Unknown, disabled demo records, while the configured real device and the existing `ahmed` administrator remain unchanged.
6. Test search, expandable filters, filter chips, sorting, pagination, page-size selection, row actions, and responsive behavior on each listing page.
7. Compare desktop and mobile screenshots with the approved visual reference.

Do not merge to `main` until the local verification and visual acceptance pass and the user approves the merge.


## Responsive record cards and bulk alert actions

- The shared `DataTable` accepts an optional `mobileCard` renderer. At mobile breakpoints, opted-in lists render stacked record cards with the same page-level pagination and search results as the desktop table.
- Sites, User Management, and Alerts use the card renderer on narrow screens. Other tables retain their existing responsive behavior until they are explicitly migrated.
- Desktop keeps the sortable table layout. Mobile cards expose the key fields and page actions without requiring horizontal table scrolling.
- Alerts supports selecting unresolved records, selecting all matching unresolved records, clearing selection, and confirming bulk acknowledge or resolve actions. Each selected alert is updated through the existing per-alert API endpoint, so each lifecycle change continues to be audited. Partial failures are reported rather than silently treated as success.
- Selection is cleared when the alert search or filters change, preventing actions from unintentionally applying to records outside the current view.
- The existing API endpoints are used, no bulk endpoint or database migration is introduced.
- Local verification and browser testing at desktop, tablet, and phone widths remain required before merge.


## Mobile review refinements

- User cards use a fixed-size status switch in a dedicated access-control column. The switch must not inherit flexible action-button sizing on narrow screens.
- Audit Logs now use mobile event cards with event name, UTC timestamp, outcome, actor, target, and summary. The desktop audit table remains unchanged.
- Alert selection is presented in a dedicated leading selection column on desktop and at the leading edge of each mobile card.
- The alert list has a persistent Select all control and a grouped bulk-action area. Acknowledge and Resolve are disabled when no eligible selected records exist. Individual desktop row actions remain grouped together at the trailing edge.

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

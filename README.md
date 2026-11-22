# pfSense Hub Manager

A centralized management and monitoring platform for multiple pfSense firewalls, designed to support mixed **pfSense Plus** and **pfSense CE** environments.

> **Project status (November 21, 2026):** The active development branch contains the responsive Hub/Site UI, shared search/filter/table components, API-backed User Management, Audit Logs and Alerts, development-only seed data, and a four-service local Compose environment. The local Windows Docker web container was serving a stale image; rebuilding the web service loaded the current source and restored the expected search/filter and mobile-card UI. The feature branch is synchronized with origin. Merge to `main` is pending documentation closeout and pull-request review.

## Why this project exists

The initial use case is to manage firewalls at multiple locations from one place:
- One location runs pfSense Plus, currently verified on a Netgate 2100.
- One location runs pfSense CE, connection and compatibility validation deferred until the user is ready.
- The architecture must support more than two devices.

The goal is a unified operational view without making the product dependent on Netgate Nexus.

## Verified progress

The Proxmox LXC named pfsense-hub-manager can reach the first firewall at 172.10.50.1:10443 and authenticate using an API key belonging to the dedicated regular pfSense account pfsense_hub.

All eight initial read-only endpoints returned HTTP 200:
- System status
- Gateway status
- Interface status
- Service status
- pfSense version
- ARP table
- Firewall states
- Firewall state table size

The tested firewall reported pfSense Plus 26.07.2-RELEASE. The API key is not stored in this repository.

**Important:** The test used a self-signed certificate and temporarily bypassed certificate verification with curl -k. This is diagnostic only. Verified TLS must be completed before production use.

See [Integration Status](docs/INTEGRATION-STATUS.md) for the exact test record and limitations.

## Product direction

The long-term product goal is a full-featured, centralized pfSense management platform, not a read-only monitoring tool. It is intended to grow to support firewall rules, aliases, NAT, interfaces, routing, services, and other supported configuration areas, subject to per-device API capabilities and security controls. Development will proceed in stages: read-only monitoring first, then carefully governed write capabilities. Remote command execution is not assumed to be required.

The connection method between the hub and each firewall is intentionally undecided. The architecture must support multiple firewalls and allow the transport mechanism to be selected later without rewriting management features.

The integration must account for differences by pfSense edition, release, API package version, and hardware architecture. The community pfSense REST API is unofficial and is not a Netgate-supported API.

## Deployment and development environment

Docker Compose runs the React/Vite web application, Fastify API, PostgreSQL, and code-server. code-server provides VS Code in a browser at http://127.0.0.1:8443 on the LXC, with password authentication and persistent workspace, settings, and extension storage. The pfSense Hub application remains at http://127.0.0.1:8080. Both ports are loopback-bound by default, use SSH tunnels for workstation access, and do not expose either service directly to the internet.

The editor workspace is ./workspace. The code-server container is isolated from the application backend network and does not mount the Docker socket. See [Deployment](docs/DEPLOYMENT.md) for setup, SSH forwarding, secrets, and security details.

## Repository guide

- [Agent instructions](AGENTS.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [API specification](docs/API-SPECIFICATION.md)
- [Integration status and verified tests](docs/INTEGRATION-STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Decision log](docs/DECISIONS.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Hub access configuration](docs/HUB-ACCESS-CONFIGURATION.md)
- [Metrics](docs/METRICS.md)
- [Monitoring](docs/MONITORING.md)

## Security

Never commit firewall credentials, API keys, tokens, private keys, configuration backups, or real customer/network data. Keep credentials server-side, use least privilege, prefer private connectivity, and validate TLS certificates. Do not expose a firewall management API directly to the public internet by default.

## Development

See [Deployment](docs/DEPLOYMENT.md). Copy .env.example to .env, create the local API key and code-server password files described there, and configure a trusted CA if required. Run docker compose config, then docker compose up -d --build. The initial application UI and VS Code editor are exposed only on localhost ports 8080 and 8443 respectively. The eight upstream GET operations are implemented behind a fixed allowlist; no write routes or arbitrary proxy exist. Manager-user session authentication, `admin`/`user` roles, administrator user management, audit events, and persisted operational alerts are implemented. Multi-device onboarding and a fully live multi-site dashboard remain future work.

## License

Not yet selected. Do not assume this project is open source until a license is explicitly chosen.


## Current development baseline, November 21, 2026

- **Development workstation:** Windows 11, VS Code, Docker Desktop, local development.
- **Branch:** `feature/development-seed-data`, synchronized with `origin/feature/development-seed-data` at commit `06e8d0f49433654d37b7d9c8c8135ab96da17283`. The branch contains 91 commits ahead of `main` at the recorded comparison point.
- **Frontend:** Shared UI primitives provide searchable data tables, list toolbars, expandable filters, pagination, and responsive mobile record cards. The recent local issue was a stale running Docker web image, not missing source files or a broken Git branch. Rebuilding the web service resolved the visible UI discrepancy.
- **Administration:** User Management, Audit Logs, and Alerts use backend APIs. Role enforcement is server-side. Development seed data is guarded to development mode and is transactional/idempotent.
- **Verification:** The recent development session recorded 52 passing API tests. The current local Docker rebuild resolved the stale-frontend symptom. Re-run typecheck, tests, production build, Compose validation, and a clean container rebuild on the final PR head before merge.
- **Not complete:** The wider Hub/Site dashboard still contains preview data, alert generation is tied to the device overview request rather than a background scheduler, live CE integration is deferred, and production TLS trust, backup/restore, retention, and release hardening remain open.

Use `docs/ROADMAP.md` as the authoritative next-step sequence and `docs/FRONTEND-IMPLEMENTATION.md` for UI implementation boundaries.

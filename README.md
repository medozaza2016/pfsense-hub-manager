# pfSense Hub Manager

A centralized management and monitoring platform for multiple pfSense firewalls, designed to support mixed **pfSense Plus** and **pfSense CE** environments.

> **Project status (November 21, 2026):** PR #5 and its implementation are merged into `main`. The repository now has a responsive Hub/Site UI, shared search/filter/table components, API-backed User Management, Audit Logs and Alerts, and development-only seed support. This is an intermediate development baseline, not a production-ready multi-firewall manager. The current next milestone is secure multi-site onboarding. See the current baseline and implementation plan below.

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

Docker Compose runs the React/Vite web application, Fastify API, and PostgreSQL. The pfSense Hub application binds to `127.0.0.1:8080) by default. Use Tailscale Serve or an SSH tunnel for private workstation access. Do not expose the application directly to the public internet.

### New Linux machine installation

For a clean Debian 13 host, follow the [Fresh Linux Host Setup](docs/DEPLOYMENT.md#fresh-linux-host-setup) procedure. It covers host prerequisites, Docker Engine and Compose installation, cloning the required branch into `/opt/pfsense-hub`, and running the one-command Linux installer:

```bash
sudo bash /opt/pfsense-hub/scripts/install-linux.sh
```

The Linux host does not need Node.js or npm. The installer provisions the Hub and its standard Host Agent, validates their connection, and enables GUI-managed access deployment after health checks pass. Read the full [Deployment guide](docs/DEPLOYMENT.md) before installing on a new machine or updating an existing installation.

## Repository guide

- [Agent instructions](AGENTS.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [API specification](docs/API-SPECIFICATION.md)
- [Integration status and verified tests](docs/INTEGRATION-STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Multi-site onboarding implementation plan](docs/MULTI-SITE-ONBOARDING-PLAN.md)
- [Decision log](docs/DECISIONS.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Hub installation and first-run bootstrap target](docs/INSTALLATION-BOOTSTRAP.md)
- [Hub access configuration](docs/HUB-ACCESS-CONFIGURATION.md)
- [Metrics](docs/METRICS.md)
- [Monitoring](docs/MONITORING.md)

## Security

Never commit firewall credentials, API keys, tokens, private keys, configuration backups, or real customer/network data. Keep credentials server-side, use least privilege, prefer private connectivity, and validate TLS certificates. Do not expose a firewall management API directly to the public internet by default.

## Development and installation status

See [Deployment](docs/DEPLOYMENT.md) for current implementation details and [Hub Installation and First-Run Bootstrap](docs/INSTALLATION-BOOTSTRAP.md) for installation behavior and remaining acceptance work. The current feature branch supports a Hub-only start with no preconfigured firewall and GUI-based site registration. On Linux, `sudo bash scripts/install-linux.sh` installs both the Hub application and its standard Host Agent, verifies their connection, and enables GUI-managed access deployment only after health checks pass. The eight upstream GET operations remain behind a fixed allowlist; no firewall write routes or arbitrary proxy exist. Full production acceptance still requires a fresh-install/reboot drill and Windows/Linux parity verification.

## License

Not yet selected. Do not assume this project is open source until a license is explicitly chosen.


## Current development baseline, November 21, 2026

- **Repository branch:** `main`.
- **Code baseline before this documentation pass:** `fa2d524d746213972b1c085f8737d427b134b012`, synchronized with `origin/main` in the user's Windows working copy. This documentation pass adds six commits to `main`; the user's local checkout must pull those documentation commits before development.
- **Development workstation:** Windows 11, VS Code, Docker Desktop, local development.
- **Production direction:** Linux deployment on the existing Proxmox LXC remains the intended target. Local Windows development and Linux deployment are separate environments.
- **Merged implementation:** PR #5 is merged. It includes the shared frontend listing components, API-backed User Management, Audit Logs and Alerts, and development-only seed support.
- **Current data boundary:** Managed-device inventory is returned by the Hub API, but the configured live firewall remains environment-driven. Demo inventory records are not connected devices. Per-device onboarding, credential lifecycle, and independent multi-device collection are not implemented.
- **Frontend boundary:** Hub Overview, Sites, and Connectivity use the inventory API. Other firewall configuration pages still show explicitly labeled preview fixtures and do not read or write firewall configuration.
- **Administration boundary:** User Management, Audit Logs, and Alerts are API-backed. Alert production is associated with a requested device overview, not an independent background polling scheduler.
- **Verification boundary:** Earlier development sessions recorded 52 passing API tests, but that result is not a fresh verification of the current `main` commit. Run the complete local validation sequence before beginning feature implementation.
- **Next milestone:** Secure multi-site onboarding and per-device connection management. The implementation plan is [Multi-site Onboarding](docs/MULTI-SITE-ONBOARDING-PLAN.md).
- **Branch workflow:** This documentation-only update is being prepared on `docs/hub-bootstrap-and-installation-flow`. Review and merge its pull request into `main` first. Create a fresh implementation branch from updated `main` only after explicit authorization. Do not reuse existing branches without reviewing their state.

Use `docs/ROADMAP.md` for milestone order, `docs/MULTI-SITE-ONBOARDING-PLAN.md` for the next implementation scope, and `docs/INTEGRATION-STATUS.md` for verified integration facts.

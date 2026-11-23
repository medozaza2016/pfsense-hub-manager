# pfSense Hub Manager

A centralized Hub for registering and monitoring multiple pfSense firewalls across locations, with support intended for both pfSense Plus and pfSense CE.

> **Project status, November 23, 2026:** The active implementation is on `main` (`14e3c2f`). Multi-site onboarding, per-device encrypted API credentials and TLS trust, authenticated manager administration, audit logs and alerts, System Monitoring & Recovery, and Linux GUI-managed Hub access deployment through a restricted systemd Host Agent are merged here (DEC-029, DEC-039). The clean Debian 13 installation and Tailscale access path have been tested. This remains a development-stage product, not a production-ready firewall management release.

## Product direction

The goal is a centralized operational view and, after separate security and product approval, a broader pfSense management application. The product must support more than two devices and account for edition, release, API package version, and architecture differences.

The first integration milestone is read-only. The application currently exposes a fixed allowlist of eight pfSense GET operations. No firewall configuration-changing operation, arbitrary upstream API proxy, or remote command execution is implemented.

The first Netgate 2100 running pfSense Plus was historically tested for eight read-only REST API calls. The second pfSense CE firewall remains intentionally deferred until the user is ready to connect it. The community pfSense REST API is unofficial and is not a Netgate-supported API.

## Current implementation

- **Hub application:** React, TypeScript, Vite, Fastify, PostgreSQL, and Docker Compose.
- **Managed sites:** GUI registration, profile updates, enable/disable, connection testing, credential rotation, custom CA trust, and archival through administrator-only API routes.
- **Credential protection:** Per-device API credentials and custom TLS trust are encrypted at rest using AES-256-GCM and a separately provisioned application encryption key.
- **Manager administration:** Database-backed login and sessions, `admin` and `user` roles, user management, audit records, and operational alerts.
- **Site telemetry:** Overview, Monitoring, Interfaces, Gateways, Services, and Compatibility read one sanitized snapshot collected from the eight approved read-only GET operations. Values the firewall does not report are shown as unknown; no CPU/memory history, REST API package version, or CPU architecture is invented (DEC-042).
- **Background polling:** An opt-in scheduler (`PFSENSE_POLLING_ENABLED=false` by default) collects every enabled firewall on a 60 s interval with jitter, bounded backoff, per-device isolation, and 30-day poll-history retention, reusing the same eight-operation path, health recorder, and metrics as a page-triggered collection. Enabled in the local Docker Compose deployment on November 23, 2026, where consecutive scheduled cycles were observed (DEC-043).
- **Hub access:** Administration → Hub Settings supports Local, Tailscale MagicDNS, and Custom endpoint configuration. On Linux, a restricted systemd Host Agent applies and verifies supported host changes. It does not expose the Docker socket to the application containers.
- **Linux installation:** One entry point, `scripts/install-linux.sh`, has two explicit modes. The default production mode provisions both the Hub and its standard Host Agent from a root-owned `/opt/pfsense-hub` checkout and enables GUI-managed access deployment only after service health and the API-to-agent authentication handshake succeed. The unprivileged `--local` mode builds and starts the Hub with Docker Compose from any checkout path without the Host Agent and keeps the deployment gate false; adding `--with-agent` runs the same restricted agent unprivileged against that checkout for development.

The following are still incomplete: a second live firewall/CE validation, a live poll failure/recovery cycle and a cache-hit confirmation from a page load inside the poll interval, live data for the remaining preview pages (Rules, Aliases, NAT, Routing, DHCP, DNS, Certificates, and VPN have no approved endpoint), database backup/restore drills and retention policy, application key rotation, a Windows host deployment agent, and any firewall configuration write workflow. The authenticated end-to-end site snapshot against a real firewall is no longer outstanding: it succeeded on November 23, 2026 over a TLS-validating connection, and it exposed the compatibility-query defect recorded in [Verification and Documentation Closeout](docs/VERIFICATION-AND-CLOSEOUT.md) section 15.1.

## Deployment

### Prepared Debian 13 Proxmox LXC

The standard Linux target is a prepared Debian 13 Proxmox LXC template with an administrator account, systemd, Docker Engine, Docker Compose, Git, and the required base utilities already installed. Tailscale may already be present and connected. Hub Manager does not reinstall Docker, create another administrator, or reset/re-enroll the host's Tailscale identity.

On a clean restore of that prepared template, install from the repository's `main` branch. The tested installer is present on `main`; the earlier feature-branch acceptance run is recorded in [Verification and Documentation Closeout](docs/VERIFICATION-AND-CLOSEOUT.md).

Run:

```bash
sudo install -d -o root -g root -m 0755 /opt
sudo git clone --branch main --single-branch https://github.com/medozaza2016/pfsense-hub-manager.git /opt/pfsense-hub
sudo bash /opt/pfsense-hub/scripts/install-linux.sh
```

`feature/multi-site-onboarding` is merged and is retained only to reproduce the historical acceptance run; it is not an active development branch (DEC-029, DEC-034).

The installer generates protected secrets, displays a one-time application encryption recovery key, installs and enables the Host Agent, builds the web/API images, starts PostgreSQL, waits for all services to become healthy, verifies the API-to-agent socket and bearer-authenticated handshake, and enables GUI-managed access deployment. Save the recovery key in a password manager. Never paste it into chat, source control, or logs.

The Linux production host does not need Node.js or npm. The application builds inside Docker.

This privileged procedure is intentionally pinned to `/opt/pfsense-hub`. The Host Agent runs as root and executes `docker compose` against this checkout's `compose.yaml` and `.env`, so a user-writable project directory would let an unprivileged account influence root-owned host configuration. Do not work around the path requirement by loosening ownership or permissions.

### Linux local development (any checkout path)

For development on a Linux workstation with Docker Engine and Docker Compose v2, from any checkout path, run without `sudo`:

```bash
bash scripts/install-linux.sh --local
```

`--dev` is accepted as an alias. Local mode installs no systemd Host Agent, needs no root access, creates no root-owned files, and leaves `HUB_ACCESS_DEPLOYMENT_ENABLED=false`, so Hub access deployment requests keep returning `503 HUB_ACCESS_DEPLOYMENT_DISABLED`. It generates the PostgreSQL password and application encryption key, writes `.env` with an empty agent token and socket, validates the Compose configuration, builds and starts the stack, waits for PostgreSQL, API, and web health, and prints the local UI address.

Add `--with-agent` to also run the restricted Host Agent as your own unprivileged account against this checkout, which makes GUI-managed Hub access deployment testable without `sudo`:

```bash
bash scripts/install-linux.sh --local --with-agent
```

That flag writes `~/.config/pfsense-hub/deployment-agent.json`, enables the deployment gate in the local `.env`, starts the agent through `scripts/dev-host-agent.sh` (no systemd unit and nothing written to `/etc` or `/opt`), and verifies the socket and bearer-authenticated API handshake. The agent still trusts only files owned by the account running it, and Tailscale Serve additionally needs `sudo tailscale set --operator="$USER"`. See the [Deployment guide](docs/DEPLOYMENT.md#unprivileged-development-host-agent).

The installer refuses to overwrite an existing `.env`, key files, the `pfsense-hub_postgres_data` volume, or running containers for this Compose project, and it refuses a checkout owned by another account. Stop the stack with `docker compose down`, never `docker compose down -v`. Linux local mode cannot exercise Tailscale or Custom Hub access auto-deployment; use the production procedure to test those. See the [Deployment guide](docs/DEPLOYMENT.md#linux-local-development-install-non-root-any-checkout-path).

### Plain Debian host

For a plain Debian 13 machine that does not already have Docker installed, follow the full [Fresh Linux Host Setup](docs/DEPLOYMENT.md#fresh-linux-host-setup) procedure. It includes Docker Engine and Compose installation, repository checkout, and first install.

### Windows 11 local setup and development

The supported Windows workflow is local development with Docker Desktop, not an automated production installer. There is currently no `install-windows.ps1`. The existing `scripts/setup-encryption-key.ps1` provisions only the protected application encryption key and one-time recovery copy; it does not configure the complete environment or start Docker Compose.

From PowerShell at the repository root, on a clean local development checkout:

```powershell
if (Test-Path .env) { throw "An .env file already exists. Preserve it and inspect the current setup before proceeding." }
Copy-Item .env.example .env
New-Item -ItemType Directory -Force .\secrets\runtime, .\certs, .\run\host-agent | Out-Null
if (-not (Test-Path .\secrets\pfsense_api_key)) {
  New-Item -ItemType File .\secrets\pfsense_api_key | Out-Null
}
notepad .env
.\scripts\setup-encryption-key.ps1
```

In `.env`, replace the PostgreSQL password placeholder with a strong, unique alphanumeric value. Leave the legacy `PFSENSE_DEVICE_ID`, `PFSENSE_DEVICE_NAME`, and `PFSENSE_API_BASE_URL` blank for a new Hub with no registered firewall. Keep `HUB_DEPLOYMENT_AGENT_TOKEN` and `HUB_DEPLOYMENT_AGENT_SOCKET` blank and `HUB_ACCESS_DEPLOYMENT_ENABLED=false` on Windows. Do not reuse a production application's encryption key. The PowerShell key script refuses to overwrite an existing key, prints the recovery key once, and prompts you to confirm that you saved it. Run it only when PowerShell transcription and screen recording are off.

Then validate and start the local stack:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Open `http://127.0.0.1:8080`. Docker Compose builds and runs the web, API, and PostgreSQL containers. Windows Docker Desktop does not run the production Linux systemd Host Agent, so automatic host access deployment remains disabled. Do not set the feature gate to true on Windows.

### Local code validation (Windows or Linux)

Node.js 22 and npm are needed for local source checks, not for the Linux production host. From the repository root:

```
npm ci
npm test
npm run typecheck
npm run build
```

These commands validate API/web source tests, TypeScript, and production builds. They are separate from the Docker Compose start commands above. The Linux Host Agent Python tests require a Linux environment for the Unix-socket integration cases; Windows skips the platform-specific Unix-socket tests.

The same commands work from any Linux checkout path. The committed lockfile records the native Rollup and esbuild binaries for Windows x64 and Linux x64 (glibc and musl), so `npm ci` resolves the matching platform binary on either host. If `npm test` reports `Cannot find module @rollup/rollup-linux-x64-gnu`, the lockfile has been regenerated on a single platform; regenerate it with the platform overrides recorded in DEC-037 instead of patching `node_modules`.

## Verification and current limits

See [Verification and Documentation Closeout](docs/VERIFICATION-AND-CLOSEOUT.md) for exact test counts, the clean Linux installation record, Tailscale browser verification, skipped checks, and remaining acceptance gaps.

The Windows run recorded 177 tests passed and 4 intentionally skipped, with API/web typechecks and production builds successful. The Linux Host Agent suite recorded 23 passing tests. The clean Debian 13 installer completed all six phases, with PostgreSQL, API, web, and the API-to-agent handshake verified. Hub Settings then reported Tailscale endpoint revision 2 as applied and verified in the browser.

Do not describe the product as production-ready. The first Plus firewall's historical diagnostic test used a temporary TLS verification bypass; the manager now connects to that firewall with certificate validation enabled, a device-scoped CA bundle, and a pinned server name, so that item is closed for the manager path, while the exact REST API package version remains unrecorded. A second real firewall, the poll-failure alert and page-load cache-hit paths under background polling, backup/restore recovery, and firewall configuration writes have not been accepted.

## Repository guide

- [Agent instructions](AGENTS.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [API specification](docs/API-SPECIFICATION.md)
- [Integration status](docs/INTEGRATION-STATUS.md)
- [API compatibility](docs/API-COMPATIBILITY.md)
- [API coverage matrix](docs/API-MATRIX.md)
- [Roadmap](docs/ROADMAP.md)
- [Multi-site onboarding plan](docs/MULTI-SITE-ONBOARDING-PLAN.md)
- [Decision log](docs/DECISIONS.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Installation and first-run bootstrap](docs/INSTALLATION-BOOTSTRAP.md)
- [Hub access configuration](docs/HUB-ACCESS-CONFIGURATION.md)
- [Automatic Hub access deployment](docs/AUTOMATIC-HUB-ACCESS-DEPLOYMENT.md)
- [Frontend implementation](docs/FRONTEND-IMPLEMENTATION.md)
- [Monitoring](docs/MONITORING.md)
- [Runtime settings proposal (not approved)](docs/RUNTIME-SETTINGS-PROPOSAL.md)
- [Verification and documentation closeout](docs/VERIFICATION-AND-CLOSEOUT.md)

## Security

Never commit firewall credentials, API keys, passwords, tokens, private keys, certificates containing private key material, configuration backups, or real customer/network data. Keep secrets server-side, use least privilege, prefer private connectivity, and validate TLS certificates. Do not expose a firewall management API or the Hub UI directly to the public internet by default.

The application encryption key is installation-specific. A fresh installation generates a new key, but restart, rebuild, and upgrade do not rotate it. Back up the encrypted database and its matching key separately. Never replace the key while encrypted credentials or TLS trust material exist. Key rotation is not implemented.

## License

Not yet selected. Do not assume this project is open source until a license is explicitly chosen.

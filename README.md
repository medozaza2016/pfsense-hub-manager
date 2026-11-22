# pfSense Hub Manager

A centralized Hub for registering and monitoring multiple pfSense firewalls across locations, with support intended for both pfSense Plus and pfSense CE.

> **Project status, November 22, 2026:** The active implementation is on `feature/multi-site-onboarding`. This branch includes GUI-managed site registration and lifecycle, per-device encrypted API credentials and TLS trust, authenticated manager administration, audit logs and alerts, and Linux GUI-managed Hub access deployment through a restricted systemd Host Agent. The clean Debian 13 installation and Tailscale access path have been tested. This remains a development-stage product, not a production-ready firewall management release. The work has not been merged into `main`.

## Product direction

The goal is a centralized operational view and, after separate security and product approval, a broader pfSense management application. The product must support more than two devices and account for edition, release, API package version, and architecture differences.

The first integration milestone is read-only. The application currently exposes a fixed allowlist of eight pfSense GET operations. No firewall configuration-changing operation, arbitrary upstream API proxy, or remote command execution is implemented.

The first Netgate 2100 running pfSense Plus was historically tested for eight read-only REST API calls. The second pfSense CE firewall remains intentionally deferred until the user is ready to connect it. The community pfSense REST API is unofficial and is not a Netgate-supported API.

## Current implementation

- **Hub application:** React, TypeScript, Vite, Fastify, PostgreSQL, and Docker Compose.
- **Managed sites:** GUI registration, profile updates, enable/disable, connection testing, credential rotation, custom CA trust, and archival through administrator-only API routes.
- **Credential protection:** Per-device API credentials and custom TLS trust are encrypted at rest using AES-256-GCM and a separately provisioned application encryption key.
- **Manager administration:** Database-backed login and sessions, `admin` and `user` roles, user management, audit records, and operational alerts.
- **Hub access:** Administration → Hub Settings supports Local, Tailscale MagicDNS, and Custom endpoint configuration. On Linux, a restricted systemd Host Agent applies and verifies supported host changes. It does not expose the Docker socket to the application containers.
- **Linux installation:** One entry point, `scripts/install-linux.sh`, provisions both the Hub and its standard Host Agent. It enables GUI-managed access deployment only after service health and the API-to-agent authentication handshake succeed.

The following are still incomplete: a second live firewall/CE validation, continuous background polling and retry scheduling, full live data for all preview pages, database backup/restore drills and retention policy, application key rotation, a Windows host deployment agent, and any firewall configuration write workflow.

## Deployment

### Prepared Debian 13 Proxmox LXC

The standard Linux target is a prepared Debian 13 Proxmox LXC template with an administrator account, systemd, Docker Engine, Docker Compose, Git, and the required base utilities already installed. Tailscale may already be present and connected. Hub Manager does not reinstall Docker, create another administrator, or reset/re-enroll the host's Tailscale identity.

On a clean restore of that prepared template, the **release install command will use the repository's `main` branch after this feature is merged**. The installer is currently present on `feature/multi-site-onboarding` and has not yet been merged into `main`; the clean-install acceptance test was run from that feature branch. Do not expect the `main` command to work until the merge is complete.

After the merge, run:

```bash
sudo install -d -o root -g root -m 0755 /opt
sudo git clone --branch main --single-branch https://github.com/medozaza2016/pfsense-hub-manager.git /opt/pfsense-hub
sudo bash /opt/pfsense-hub/scripts/install-linux.sh
```

For a repeat of the current feature-branch acceptance test before merge, use `--branch feature/multi-site-onboarding` instead of `--branch main`.

The installer generates protected secrets, displays a one-time application encryption recovery key, installs and enables the Host Agent, builds the web/API images, starts PostgreSQL, waits for all services to become healthy, verifies the API-to-agent socket and bearer-authenticated handshake, and enables GUI-managed access deployment. Save the recovery key in a password manager. Never paste it into chat, source control, or logs.

The Linux production host does not need Node.js or npm. The application builds inside Docker.

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

### Windows local code validation

Node.js 22 and npm are needed for local source checks, not for the Linux production host. From the repository root:

```powershell
npm ci
npm test
npm run typecheck
npm run build
```

These commands validate API/web source tests, TypeScript, and production builds. They are separate from the Docker Compose start commands above. The Linux Host Agent Python tests require a Linux environment for the Unix-socket integration cases; Windows skips the platform-specific Unix-socket tests.

## Verification and current limits

See [Verification and Documentation Closeout](docs/VERIFICATION-AND-CLOSEOUT.md) for exact test counts, the clean Linux installation record, Tailscale browser verification, skipped checks, and remaining acceptance gaps.

The Windows run recorded 177 tests passed and 4 intentionally skipped, with API/web typechecks and production builds successful. The Linux Host Agent suite recorded 23 passing tests. The clean Debian 13 installer completed all six phases, with PostgreSQL, API, web, and the API-to-agent handshake verified. Hub Settings then reported Tailscale endpoint revision 2 as applied and verified in the browser.

Do not describe the product as production-ready. The first Plus firewall's historical diagnostic test used a temporary TLS verification bypass; successful trusted TLS validation against that firewall and exact REST API package version remain outstanding. A second real firewall, continuous scheduled polling, backup/restore recovery, and firewall configuration writes have not been accepted.

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
- [Verification and documentation closeout](docs/VERIFICATION-AND-CLOSEOUT.md)

## Security

Never commit firewall credentials, API keys, passwords, tokens, private keys, certificates containing private key material, configuration backups, or real customer/network data. Keep secrets server-side, use least privilege, prefer private connectivity, and validate TLS certificates. Do not expose a firewall management API or the Hub UI directly to the public internet by default.

The application encryption key is installation-specific. A fresh installation generates a new key, but restart, rebuild, and upgrade do not rotate it. Back up the encrypted database and its matching key separately. Never replace the key while encrypted credentials or TLS trust material exist. Key rotation is not implemented.

## License

Not yet selected. Do not assume this project is open source until a license is explicitly chosen.

# Local and Proxmox Deployment

## Current deployment shape
Docker Compose runs the React/Vite web application served by Nginx, the Fastify API, and PostgreSQL. PostgreSQL is not published to the LXC host. The API has a loopback-only host publication on port 3001 for the local deployment agent; it is not reachable from LAN or public interfaces. The application UI binds to 127.0.0.1 by default. On Linux production, Tailscale Serve can provide tailnet-only HTTPS in front of this loopback service. Do not bind the UI directly to a Tailscale IP or use 0.0.0.0, and do not publish the application UI or API directly to the public internet.

## Prerequisites
- Debian 13 (Trixie) or another supported systemd-based Linux host. Debian 13 is the documented clean-install baseline.
- Docker Engine and the Docker Compose v2 plugin.
- Git, OpenSSL, Python 3.10 or newer, iproute2, and standard system account utilities (including `groupadd` and `getent`).
- A secure location outside the server for the application encryption recovery key.
- A pfSense API key is needed only when you register a firewall through Administration → Add Site.
- Node.js and npm are **not** required on the Linux production host. The application runs inside Docker containers.
- For Linux local development only, `scripts/install-linux.sh --local` needs Docker Engine, Docker Compose v2, OpenSSL, and coreutils; systemd, Python, and iproute2 are not required.

## Fresh Linux host setup

Use this procedure on a **new, empty Linux machine**. Debian 13 is the clean-install baseline. After this feature is merged, the standard release command uses `main`; before merge, the installer is available only on `feature/multi-site-onboarding` for acceptance testing. Do not use this procedure to overwrite an existing Hub installation. The installer deliberately refuses to replace existing secrets, agent configuration, containers, or the PostgreSQL volume.

### Prepared Proxmox LXC quick start (recommended)

The standard Proxmox template is already prepared with Debian 13, an administrator account, Docker Engine, Docker Compose, Git, OpenSSL, Python, iproute2, systemd, and Tailscale. This is the operator's normal prepared starting point. When the same CT is restored from its own clean snapshot, retain its existing Tailscale identity and configuration. The Hub installer does not reinstall or reset Tailscale, and it does not require a second Tailscale enrollment. Do not run two concurrently active copies with the same Tailscale state.

**Release branch:** After `feature/multi-site-onboarding` is merged, new installations must clone `main`. The tested installer is currently on the feature branch and is not yet present on `main`; the command below using `main` becomes executable only after that merge. To repeat the current acceptance test before merge, use `--branch feature/multi-site-onboarding` instead.

From SSH, run only these two commands:

```bash
sudo git clone --branch main --single-branch https://github.com/medozaza2016/pfsense-hub-manager.git /opt/pfsense-hub
sudo bash /opt/pfsense-hub/scripts/install-linux.sh
```

The clone is run with `sudo` intentionally, so the repository and privileged Host Agent source files are owned by `root:root`, as required by the installer. The installer then handles application secrets, Host Agent installation and enablement, Compose startup, health checks, and the authenticated agent handshake. Save the one-time application encryption recovery key in your password manager and confirm the prompt. Node.js and npm are not required on the Linux host. The tested prepared template already has `/opt`; if using a different base image, create `/opt` first with root ownership and mode 0755.

This quick start assumes `/opt/pfsense-hub` does not already exist. If it exists, stop and inspect it. Do not delete an existing checkout or installation to force the clone.

### 1. Install host prerequisites

Connect over SSH using an account with sudo access:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl python3 iproute2 passwd
```

The `passwd` package supplies the `groupadd` utility on a standard Debian installation. Run the preflight as root so the root command search path includes administrative tools under `/usr/sbin`. This avoids a misleading `groupadd` missing result when checking from a restricted non-root PATH:

```bash
sudo bash -lc '
set -e
for cmd in git docker openssl python3 systemctl ip groupadd getent stat install; do
  command -v "$cmd" >/dev/null || { echo "MISSING: $cmd"; exit 1; }
done
python3 -c "import sys; assert sys.version_info >= (3, 10)"
docker compose version
docker info >/dev/null
echo "Linux host prerequisites: ready"
'
```

### 2. Install Docker Engine and Compose (only if not already installed)

If `sudo docker info` and `sudo docker compose version` already work, skip this section. Otherwise, install Docker Engine from Docker's official Debian apt repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

Use Docker's [official Debian installation guide](https://docs.docker.com/engine/install/debian/) for supported architectures, package conflicts, and troubleshooting. Do not add the operator account to the `docker` group just to avoid `sudo`, membership in that group grants root-equivalent control over the host.

### 3. Clone the project into the required protected location

The production installer and systemd Host Agent are pinned to `/opt/pfsense-hub`. Clone the repository as root so the project directory and trusted Host Agent files are root-owned. If you only need a development stack from a personal checkout, skip this production path and use [Linux local development install](#linux-local-development-install-non-root-any-checkout-path) instead of moving or re-owning the checkout:

```bash
sudo install -d -o root -g root -m 0755 /opt
sudo git clone --branch main --single-branch https://github.com/medozaza2016/pfsense-hub-manager.git /opt/pfsense-hub
sudo git -c safe.directory=/opt/pfsense-hub -C /opt/pfsense-hub status --short --branch
```

Confirm that the reported branch is `main` after the installer has been merged. During the current pre-merge acceptance test, confirm `feature/multi-site-onboarding` instead. Do not clone into a home directory and do not change the project ownership to the SSH user. If `/opt/pfsense-hub` already exists, stop and inspect it instead of deleting it to force the clone.

### 4. Run the single Hub installer

```bash
sudo bash /opt/pfsense-hub/scripts/install-linux.sh
```

The installer will display the one-time application encryption recovery key. Save it in a password manager and confirm the prompt. Do not paste this key into chat, email, source control, or a support log. The installer then creates protected configuration, installs and enables the Host Agent service, builds the application, waits for PostgreSQL/API/web health checks, verifies the API-to-agent socket and authentication handshake, and enables GUI-managed Hub access only after those checks pass.

Tailscale is optional and is not installed or authenticated by this command. The Hub initially binds to `127.0.0.1:8080`. From an administrator workstation, an SSH tunnel can provide private access:

```bash
ssh -L 8080:127.0.0.1:8080 ahmed@<linux-host-address>
```

Then open `http://127.0.0.1:8080` on that workstation. Replace `ahmed` and the host address with the account and address used for SSH. Do not publish the Hub UI or API directly to the internet.

## First-time setup
For Linux production, use one installation command from the repository checkout at /opt/pfsense-hub:

```bash
sudo bash scripts/install-linux.sh
```

This is the single supported Linux installation entry point. It generates the PostgreSQL password, application encryption key, and Host Agent bearer token; writes protected secret/configuration files; installs and starts the Linux systemd Host Agent; validates Compose; builds and starts the web, API, and PostgreSQL services; waits for all three services to become healthy; and verifies the API-to-agent Unix-socket connection and bearer-authenticated configuration retrieval. Only after those checks pass does it enable GUI-managed Hub access deployment. The Host Agent is a standard Linux Hub component, not a separate normal installation step.

The installer does not install or authenticate Tailscale, enable tailnet HTTPS, configure ACLs, or create a Funnel. Tailscale remains optional. When installed later, the Host Agent discovers the Tailscale CLI from its service PATH. To use Tailscale, connect the host to the tailnet and enable HTTPS certificates in the tailnet administration console, then select the MagicDNS hostname in Administration → Hub Settings.

The installer prints the one-time application encryption recovery key before creating installation files and requires confirmation that it was saved. Store it in a password manager. Do not paste it into chat, source control, or .env. The runtime key is stored at secrets/runtime/app_encryption_key. The installer refuses to overwrite an existing .env, runtime key, API-key placeholder, Host Agent configuration/service, Compose project containers, or the named PostgreSQL volume pfsense-hub_postgres_data. It never deletes volumes. If existing state is detected, the installer stops, changes nothing, and prints two procedures: resume the existing installation (`docker compose up -d`, then `docker compose ps` until db, api, and web report healthy) or, only if all existing Hub data may be destroyed, replace it (`docker compose down -v`, remove `.env`, `secrets/`, `certs/`, and `run/`, and for a production host also disable and remove the Host Agent service and configuration before rerunning the installer). Prefer inspecting or restoring the existing installation over removing files to force a fresh install.

### Verify the first installation

The installer performs the important local acceptance checks itself. On successful completion, the expected state is:

- `pfsense-hub-db-1`, `pfsense-hub-api-1`, and `pfsense-hub-web-1` are healthy.
- `pfsense-hub-deployment-agent.service` is enabled and active.
- `HUB_ACCESS_DEPLOYMENT_ENABLED=true` is present in the protected `.env`.
- The installer reports the API-to-agent socket, supplementary-group, and bearer-authenticated handshake as verified.

The operator can confirm the final state with this short check:

```bash
cd /opt/pfsense-hub
sudo docker compose ps
sudo systemctl is-enabled pfsense-hub-deployment-agent.service
sudo systemctl is-active pfsense-hub-deployment-agent.service
sudo grep '^HUB_ACCESS_DEPLOYMENT_ENABLED=' .env
```

### First browser access and Tailscale

The web service binds to `127.0.0.1:8080` initially. From the administrator workstation, open an SSH tunnel:

```bash
ssh -L 8080:127.0.0.1:8080 <linux-admin>@<linux-host-address>
```

Keep the SSH session open and browse to `http://127.0.0.1:8080`. Complete the first administrator setup or sign in.

If the prepared CT is already connected to Tailscale, do not reinstall or re-enroll it. Confirm that the host is connected and that HTTPS certificates are enabled for the tailnet. In **Administration → Hub Settings**, select **Tailscale**, choose **Tailscale MagicDNS hostname**, enter the CT's MagicDNS name, keep HTTPS port 443, and save. The page must report **Endpoint verified** and matching desired/applied revisions before using the HTTPS MagicDNS address directly from another tailnet device. Saving a setting alone is not proof of browser reachability.

For Windows 11 development, run the existing key-provisioning script from the repository root in PowerShell:

```powershell
.\scripts\setup-encryption-key.ps1
```

Save the recovery value in a password manager. Create the Compose secret directories and files locally as required. Do not commit any secret files.

For Windows local development, set POSTGRES_PASSWORD in .env to a strong random value. Keep it alphanumeric so it can be safely embedded in the Compose connection URL. The Linux installer generates this value automatically.

For Linux deployments, restrict secret file permissions to the API container's runtime user. For Windows Docker Desktop, the key file is protected by the Windows ACL created by the provisioning script, but verify that Docker Desktop can mount and read it before relying on it in operation.

For each firewall, import its CA certificate in Administration → Add Site when required. TLS trust is stored encrypted per device. The API client always verifies TLS and hostname identity. Never disable verification.

## Start and access
```powershell
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

For Windows local development, the pfSense Hub application UI is available at http://127.0.0.1:8080. On Linux, the application is initially bound to loopback and can be reached through the Tailscale Serve hostname after Tailscale is configured in Hub Settings, or through an SSH tunnel such as `ssh -L 8080:127.0.0.1:8080 ahmed@<LXC-Tailscale-IP>`. Do not expose the application directly to the public internet.

The API container reads the application encryption key from /run/secrets/app_encryption_key. Missing or malformed key material prevents API startup. Do not delete or replace the key file while encrypted credentials exist.

## Updates and backup
Back up PostgreSQL and the runtime encryption key separately. Protect the recovery copy independently. A database backup without its corresponding encryption key cannot restore firewall credentials. Also back up .env and any other deployment configuration required for recovery. Firewall API credentials and imported CA bundles are encrypted per device in PostgreSQL.

## Security and operational status

- Manager-user authentication, administrator/user roles, session authorization, and administrator-only Hub access mutations are implemented. Tailscale ACLs/grants remain an additional network control, not a replacement for application authorization.
- New deployments can start with no firewall configured. Administrators register all firewalls through Administration → Add Site. The legacy environment bootstrap remains available for existing deployments when its complete settings are supplied.
- Firewall API credentials and optional CA trust are encrypted per device using the application encryption key.
- Linux application-key provisioning and Host Agent installation are included in the standard Linux installer. Application encryption-key rotation remains outstanding and must not be attempted by replacing the runtime key.
- Docker Compose file secrets are not encrypted at rest.
- Windows host ACLs do not by themselves prove container-side access restrictions.
- The eight upstream firewall routes remain a fixed read-only allowlist. No arbitrary proxy, command execution, or firewall configuration write operation exists.

## GUI-managed Hub access settings and Linux host agent

Administration → Hub Settings stores Local, Tailscale, and Hostname/IP endpoint preferences in PostgreSQL. Saving a selection creates a desired configuration revision and queues a deployment. The API communicates with a separate Linux host agent over a private Unix socket. The API container receives only the socket directory as a read-only mount, never the Docker socket.

The sample .env and Windows local-development configuration default HUB_ACCESS_DEPLOYMENT_ENABLED=false. The Linux installer keeps the gate false during setup and enables it only after the Host Agent service, socket permissions, API bearer-authenticated handshake, and all three container health checks pass. A fresh Linux installation therefore finishes with GUI-managed access deployment enabled.

The Linux agent supports:

- **LAN and Custom:** the selected hostname/IP must resolve to a private address assigned to the Hub host. Publicly routable addresses are rejected. A trusted HTTPS reverse proxy must already be configured to terminate TLS and forward to the selected host address on port 8080. The agent changes only HUB_BIND_ADDRESS in the fixed project .env file, validates the fixed Compose configuration, recreates only the web service, and verifies the HTTPS endpoint. If verification fails, it restores the previous bind address, recreates only web, and verifies the previous successful origin before reporting rollback success.
- **Tailscale MagicDNS:** Tailscale HTTPS certificates must already be enabled and the host must be connected. The agent verifies the local MagicDNS identity and CertDomains, then creates the fixed private Serve proxy to http://127.0.0.1:8080 when selected in Hub Settings. It refuses conflicting routes and never configures Funnel, ACLs, DNS, or tailnet HTTPS.

Tailscale IP addresses are rejected for HTTPS because the automatically provisioned Tailscale certificate is issued for the MagicDNS name, not the IP address. Tailscale notes that device certificate names are published in the public Certificate Transparency ledger, so review the machine name before enabling HTTPS. See the [Tailscale Serve documentation](https://tailscale.com/docs/features/tailscale-serve) and [Serve CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

### Linux Host Agent provisioning and maintenance

The Host Agent is installed automatically by `scripts/install-linux.sh` on a supported Linux production host. The main installer generates its URL-safe bearer token, sets the socket path and GID, invokes `host-agent/install-linux.sh`, and then starts the application with the read-only socket-directory mount and supplementary group applied. It verifies the service and socket before enabling the GUI deployment feature. Administrators do not run a second installer during normal first-time setup.

The Host Agent requires Linux, systemd, Python 3.10 or newer, Docker Engine with the Compose plugin, and iproute2. Tailscale CLI is optional at install time. If Tailscale is installed later, the agent discovers it from its service PATH. The project directory, Host Agent source files, and compose.yaml must be root:root owned and not group/world writable. The .env file must be root:root with mode 0600 because it contains the bearer token. An unmanaged compose.override.yaml is rejected. The agent writes a root-only configuration, installs a systemd service, and creates a group-restricted Unix socket. The API container receives that socket directory read-only and never receives the Docker socket.

The standalone `host-agent/install-linux.sh` remains available for deliberate Host Agent repair or maintenance. It is not part of the normal installation procedure. After a maintenance reinstall, recreate only the API container so its socket mount and supplementary group are reapplied:

```bash
cd /opt/pfsense-hub
sudo bash /opt/pfsense-hub/host-agent/install-linux.sh
sudo docker compose up -d --no-deps api
```

Check the agent with `sudo systemctl status pfsense-hub-deployment-agent --no-pager` and inspect its logs with `sudo journalctl -u pfsense-hub-deployment-agent -n 80 --no-pager`. The agent uses fixed Docker Compose arguments to validate the project and recreate only the web service. It does not build images, restart the API or database during a deployment, delete volumes, or accept commands/paths/Compose arguments from the API. Do not expose the API port beyond loopback or mount the Docker socket into the API or web containers.

### Local development and production boundary

Windows 11 / Docker Desktop development and Linux `--local` development do not run this Linux systemd Host Agent. Leave HUB_DEPLOYMENT_AGENT_TOKEN and HUB_DEPLOYMENT_AGENT_SOCKET empty and keep HUB_ACCESS_DEPLOYMENT_ENABLED=false in local development. Automatic host deployment is a Linux production capability; local development continues to exercise the frontend and API without applying host settings, and Hub access deployment requests return `503 HUB_ACCESS_DEPLOYMENT_DISABLED`. Ordinary local development and the existing loopback web endpoint remain available.

LAN and Custom require an already configured TLS termination layer. Hub Manager does not provision certificates, DNS, or reverse proxies. For Tailscale, the host agent can configure the single fixed Serve route after the administrator selects Tailscale in Hub Settings. Tailnet HTTPS must be enabled in the Tailscale administration console first.

## Linux local development install (non-root, any checkout path)

The production procedure above is deliberately pinned to `/opt/pfsense-hub` because the privileged Host Agent executes `docker compose` against that checkout as root. Do not relocate or re-own a personal checkout to satisfy the production path. For Linux development from any checkout path, run the same installer in local mode without `sudo`:

```bash
cd ~/GitHub/pfsense-hub-manager
bash scripts/install-linux.sh --local
```

`--dev` is an accepted alias. `--help` prints usage, and an unknown argument fails with a usage error instead of being ignored. Local mode:

- Requires Docker Engine, Docker Compose v2, OpenSSL, and standard coreutils only. systemd, Python, iproute2, and group management utilities are not required.
- Refuses to run as root. Running it through `sudo` is allowed only when `SUDO_USER`, `SUDO_UID`, and `SUDO_GID` resolve, and created files are then returned to that account; a checkout owned by a different account is rejected.
- Creates no Host Agent service, no systemd unit, and no root-owned files.
- Writes `.env` with empty `HUB_DEPLOYMENT_AGENT_TOKEN` and `HUB_DEPLOYMENT_AGENT_SOCKET` and keeps `HUB_ACCESS_DEPLOYMENT_ENABLED=false`, so Hub access deployment requests return `503 HUB_ACCESS_DEPLOYMENT_DISABLED`.
- Generates `POSTGRES_PASSWORD` and the application encryption key, displays the one-time recovery key, and requires confirmation before creating files.
- Applies `0700` to `secrets/` and `secrets/runtime/`, `0400` to key files, and `0600` to `.env`.
- Validates Compose, builds and starts web, API, and PostgreSQL, and waits for all three services to become healthy before printing `http://127.0.0.1:8080`.
- Refuses an existing `.env` or key files, the `pfsense-hub_postgres_data` volume, or running containers for the `pfsense-hub` Compose project.

Stop a local stack with `docker compose down`. Never use `docker compose down -v`; it deletes the generated database and the encryption state required to decrypt stored firewall credentials. Tailscale and Custom access auto-deployment require the production Host Agent and cannot be exercised in local mode. Local mode is not a production installation.

## Windows 11 local setup and development workflow

Windows 11 with VS Code and Docker Desktop is the supported local development environment. It is not the Linux production installation path.

**PowerShell installer status:** There is currently no full `install-windows.ps1`. The existing `scripts/setup-encryption-key.ps1` is a key-provisioning script only. It creates the protected runtime application encryption key, displays the one-time recovery copy, and refuses to overwrite an existing key. It does not create the complete Windows environment or start the Compose stack.

### 1. Prepare a clean local checkout

Run these commands from PowerShell at the repository root:

```powershell
if (Test-Path .env) { throw "An .env file already exists. Preserve it and inspect the current setup before proceeding." }
Copy-Item .env.example .env
New-Item -ItemType Directory -Force .\secrets\runtime, .\certs, .\run\host-agent | Out-Null
if (-not (Test-Path .\secrets\pfsense_api_key)) {
  New-Item -ItemType File .\secrets\pfsense_api_key | Out-Null
}
notepad .env
```

In `.env`:
- Set `POSTGRES_PASSWORD` to a strong, unique alphanumeric password.
- Leave `PFSENSE_DEVICE_ID`, `PFSENSE_DEVICE_NAME`, and `PFSENSE_API_BASE_URL` blank for a new Hub that starts without a registered firewall.
- Keep `HUB_DEPLOYMENT_AGENT_TOKEN` and `HUB_DEPLOYMENT_AGENT_SOCKET` blank.
- Keep `HUB_ACCESS_DEPLOYMENT_ENABLED=false`. Windows Docker Desktop does not run the production Linux systemd Host Agent.

Create an empty `secrets/pfsense_api_key` file only to satisfy the Compose file-secret mount for a Hub-only local environment. The API does not load that file unless the legacy firewall bootstrap is configured. Do not place a real firewall API key there for the new GUI registration workflow.

### 2. Provision the Windows application encryption key

From the repository root, run the existing PowerShell key script:

```powershell
.\scripts\setup-encryption-key.ps1
```

The script:
- Generates a 32-byte key using the Windows cryptographic random-number generator.
- Writes the runtime key to `secrets/runtime/app_encryption_key`.
- Applies a protected Windows ACL to the runtime directory and file.
- Displays the one-time recovery key and asks you to type `SAVED`.

Save the recovery key in a password manager. Do not run with PowerShell transcription, screen recording, or session capture enabled. The script refuses to overwrite an existing key. If the runtime key already exists, preserve it and do not rerun the provisioning script.

### 3. Validate and start Docker Compose

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Open `http://127.0.0.1:8080` in the local browser and complete the first administrator setup or sign in. The stack contains web, API, and PostgreSQL. The Windows environment does not install or run the Linux systemd Host Agent and must keep GUI-managed host deployment disabled.

### 4. Run local source validation

Node.js 22 and npm are needed for source tests, typechecks, and local builds. They are not needed on the Linux production host because Docker builds the app images.

```powershell
npm ci
npm test
npm run typecheck
npm run build
```

These commands are distinct from Compose startup. Run them from the repository root after dependencies are installed. The Python Host Agent suite should be run on Linux for full socket-related coverage; four Unix-domain-socket tests are intentionally skipped when the test suite runs on Windows. The same commands validate a Linux checkout: the committed lockfile records the Rollup and esbuild native packages for Windows x64 and Linux x64 (glibc and musl), so `npm ci` resolves the matching binary on either host (DEC-037).

### 5. Rebuild when source and browser behavior differ

A running Docker container may still serve an older web image even when Git is current. After pulling source changes, rebuild the affected service:

```powershell
docker compose up -d --build --no-deps web
```

Refresh the browser and confirm the changed behavior. Do not delete PostgreSQL volumes to resolve a stale frontend image.

Do not run development seed commands against production data. Use only a local development database and the explicit development guard documented in [Phase 01](PHASE-01-USER-MANAGEMENT-AUDIT-ALERTS.md).

For the exact November 22, 2026 results, see [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md).
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

## Fresh Linux host setup

Use this procedure on a **new, empty Linux machine**. The commands below use Debian 13 and the current `feature/multi-site-onboarding` branch for the clean-install acceptance test. Do not use this procedure to overwrite an existing Hub installation. The installer deliberately refuses to replace existing secrets, agent configuration, containers, or the PostgreSQL volume.

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

The production installer and systemd Host Agent are pinned to `/opt/pfsense-hub`. Clone the repository as root so the project directory and trusted Host Agent files are root-owned:

```bash
sudo install -d -o root -g root -m 0755 /opt
sudo git clone --branch feature/multi-site-onboarding --single-branch https://github.com/medozaza2016/pfsense-hub-manager.git /opt/pfsense-hub
sudo git -c safe.directory=/opt/pfsense-hub -C /opt/pfsense-hub status --short --branch
```

Confirm that the reported branch is `feature/multi-site-onboarding`. Do not clone into a home directory and do not change the project ownership to the SSH user. If `/opt/pfsense-hub` already exists, stop and inspect it instead of deleting it to force the clone.

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

The installer prints the one-time application encryption recovery key before creating installation files and requires confirmation that it was saved. Store it in a password manager. Do not paste it into chat, source control, or .env. The runtime key is stored at secrets/runtime/app_encryption_key. The installer refuses to overwrite an existing .env, runtime key, API-key placeholder, Host Agent configuration/service, Compose project containers, or the named PostgreSQL volume pfsense-hub_postgres_data. It never deletes volumes. If existing state is detected, stop and inspect or restore that installation instead of removing files to force a fresh install.

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

Windows 11 / Docker Desktop development does not run this Linux systemd Host Agent. Leave HUB_DEPLOYMENT_AGENT_TOKEN and HUB_DEPLOYMENT_AGENT_SOCKET empty and keep HUB_ACCESS_DEPLOYMENT_ENABLED=false in local development. Automatic host deployment is a Linux production capability; Windows local development continues to exercise the frontend and API without applying host settings. Ordinary local development and the existing loopback web endpoint remain available.

LAN and Custom require an already configured TLS termination layer. Hub Manager does not provision certificates, DNS, or reverse proxies. For Tailscale, the host agent can configure the single fixed Serve route after the administrator selects Tailscale in Hub Settings. Tailnet HTTPS must be enabled in the Tailscale administration console first.

## Windows 11 local development workflow, current baseline

The supported current development workstation is Windows 11 with VS Code and Docker Desktop. Run the repository locally from PowerShell. Docker Compose is the reproducible local runtime for the web, API, and PostgreSQL services. Production remains a Linux deployment target; the existing Proxmox LXC is the intended target unless a later decision changes it.

Recommended closeout sequence from the repository root:

```powershell
git status --short --branch
git fetch origin
npm ci
npm run typecheck
npm test
py -3 -m unittest discover -s host-agent -p "test_*.py"
npm run build
docker compose config
docker compose up -d --build
docker compose ps
```

Use the exact scripts available in the current root `package.json`; if a command is not defined, run its workspace equivalent and record that fact. Confirm the application in a browser after the rebuild. A running container can retain an older image even when the local source and Git branch are current. When UI behavior appears inconsistent with source, inspect the running image/container and rebuild the relevant service before changing application code.

Do not run development seed commands against production data. Use only a local development database and the explicit development guard documented in [Phase 01](PHASE-01-USER-MANAGEMENT-AUDIT-ALERTS.md).

# Local and Proxmox Deployment

## Current deployment shape
Docker Compose runs the React/Vite web application served by Nginx, the Fastify API, PostgreSQL, and code-server. PostgreSQL is not published to the LXC host. The API has a loopback-only host publication on port 3001 for the local deployment agent; it is not reachable from LAN or public interfaces. The application UI binds to 127.0.0.1 by default. On Linux production, Tailscale Serve can provide tailnet-only HTTPS in front of this loopback service. Do not bind the UI directly to a Tailscale IP or use 0.0.0.0. Code-server remains bound to 127.0.0.1. Do not publish either service directly to the public internet.

The code-server container has a persistent project workspace and persistent editor configuration. It is isolated from the application backend network and does not receive the Docker socket.

## Prerequisites
- Docker Engine and Docker Compose plugin.
- Node.js 22 only if running application development scripts outside containers.
- A trusted CA certificate for the firewall API, if required.
- The dedicated read-only pfSense API key.
- A strong, unique code-server password.
- The application encryption key provisioned by scripts/setup-encryption-key.ps1 on Windows.

## First-time setup
On Windows 11, run the provisioning script from the repository root in PowerShell:

```powershell
.\scripts\setup-encryption-key.ps1
```

Save the one-time recovery value in a password manager. Do not copy it into chat, source control, .env, or a terminal transcript. The runtime file is created at secrets/runtime/app_encryption_key. The script refuses to overwrite an existing key. If the script reports that a key already exists, preserve it and do not regenerate it.

On Linux, create the runtime key once using a cryptographically secure random generator, then store the recovery copy in an approved password manager without printing it into shell history or logs. The Linux application-key provisioning workflow still requires a dedicated implementation and review.

For the existing Compose secrets, create the pfSense API key and code-server password files as described below. Do not commit any secret files.

```powershell
New-Item -ItemType Directory -Force .\secrets, .\certs, .\workspace | Out-Null
```

Set POSTGRES_PASSWORD in .env to a strong random value. Keep it alphanumeric as generated so it can be safely embedded in the Compose connection URL.

For Linux deployments, restrict secret file permissions to the API container's runtime user. For Windows Docker Desktop, the key file is protected by the Windows ACL created by the provisioning script, but verify that Docker Desktop can mount and read it before relying on it in operation.

If the firewall uses a private CA, place the CA certificate at certs/pfsense-ca.pem and set PFSENSE_CA_FILE=/run/certs/pfsense-ca.pem in .env. The API client always verifies TLS and hostname identity. Never disable verification.

## Start and access
```powershell
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

For Windows local development, the pfSense Hub application UI is available at http://127.0.0.1:8080. On Linux production, use the Tailscale MagicDNS HTTPS endpoint configured through the restricted host agent. Do not use direct HTTP access over the tailnet. The browser-based VS Code editor remains available at http://127.0.0.1:8443 and requires a local connection or SSH forwarding. Do not expose code-server or the application directly to the public internet.

The API container reads the application encryption key from /run/secrets/app_encryption_key. Missing or malformed key material prevents API startup. Do not delete or replace the key file while encrypted credentials exist.

## Updates and backup
Back up PostgreSQL and the runtime encryption key separately. Protect the recovery copy independently. A database backup without its corresponding encryption key cannot restore credentials. Also back up .env, the pfSense API key, code-server password, CA certificate, and any persistent workspace or editor volumes that need preservation.

## Security and operational status

- Manager-user authentication, administrator/user roles, session authorization, and administrator-only Hub access mutations are implemented. Tailscale ACLs/grants remain an additional network control, not a replacement for application authorization.
- The first firewall still uses the legacy environment-configured bootstrap. Multi-device registration and credential lifecycle are implemented on the current development branch, but production rollout and Linux deployment are not yet verified.
- Key rotation and Linux key provisioning remain outstanding.
- Docker Compose file secrets are not encrypted at rest.
- Windows host ACLs do not by themselves prove container-side access restrictions.
- The eight upstream firewall routes remain a fixed read-only allowlist. No arbitrary proxy, command execution, or firewall configuration write operation exists.

## GUI-managed Hub access settings and Linux host agent

Administration → Hub Settings stores Local, Tailscale, and Hostname/IP endpoint preferences in PostgreSQL. Saving a selection creates a desired configuration revision and queues a deployment. The API communicates with a separate Linux host agent over a private Unix socket. The API container receives only the socket directory as a read-only mount, never the Docker socket.

The automatic access deployment feature is disabled by default with HUB_ACCESS_DEPLOYMENT_ENABLED=false. Do not enable it until the supported Linux host integration tests have passed.

The Linux agent supports:

- **LAN and Custom:** the selected hostname/IP must resolve to a private address assigned to the Hub host. Publicly routable addresses are rejected. A trusted HTTPS reverse proxy must already be configured to terminate TLS and forward to the selected host address on port 8080. The agent changes only HUB_BIND_ADDRESS in the fixed project .env file, validates the fixed Compose configuration, recreates only the web service, and verifies the HTTPS endpoint. If verification fails, it restores the previous bind address, recreates only web, and verifies the previous successful origin before reporting rollback success.
- **Tailscale MagicDNS:** Tailscale HTTPS must already be enabled and an operator-managed private Serve route must already proxy the selected MagicDNS name to http://127.0.0.1:8080. The agent verifies host identity, CertDomains, Serve target, Funnel state, TLS, and application health. It does not configure or modify Tailscale Serve, Funnel, ACLs, DNS, or tailnet HTTPS.

Tailscale IP addresses are rejected for HTTPS because the automatically provisioned Tailscale certificate is issued for the MagicDNS name, not the IP address. Tailscale notes that device certificate names are published in the public Certificate Transparency ledger, so review the machine name before enabling HTTPS. See the [Tailscale Serve documentation](https://tailscale.com/docs/features/tailscale-serve) and [Serve CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

### Linux host-agent installation

The production project directory is /opt/pfsense-hub. The installer requires Linux, systemd, Python 3.10 or newer, Docker Engine with the Compose plugin, and iproute2. Tailscale CLI is optional unless Tailscale access is selected. The project directory, compose.yaml, and .env file must be root:root owned and not group/world writable. The privileged agent refuses to install against a project or Compose definition that a non-root user can modify. An unmanaged compose.override.yaml is also rejected so the agent's fixed Compose configuration cannot diverge from the running project. The installer reads the deployment token without sourcing or executing .env, writes a root-only agent configuration, installs a systemd service, and creates a group-restricted Unix socket.

Before running the installer:

1. Generate a URL-safe token with openssl rand -hex 32, then set HUB_DEPLOYMENT_AGENT_TOKEN in the production .env file to that value. Do not paste the token into chat or source control.
2. Set HUB_AGENT_API_PORT=3001, HUB_AGENT_GID=2000, and HUB_DEPLOYMENT_AGENT_SOCKET=/run/pfsense-hub/agent.sock in .env.
3. Keep HUB_BIND_ADDRESS=127.0.0.1 and WEB_PORT=8080 as the initial safe binding.
4. Ensure the project is checked out at /opt/pfsense-hub.

Then run:

```bash
sudo bash /opt/pfsense-hub/host-agent/install-linux.sh
```

After installation, recreate only the API container so its Unix-socket mount and supplementary group are applied:

```bash
cd /opt/pfsense-hub
docker compose up -d --no-deps api
```

Check the agent with systemctl status pfsense-hub-deployment-agent and inspect its logs with journalctl -u pfsense-hub-deployment-agent. The agent uses fixed Docker Compose arguments to validate the project and recreate only the web service. It does not build images, restart the API/database/code-server, delete volumes, or accept commands/paths/Compose arguments from the API. Do not expose the API port beyond loopback or mount the Docker socket into the API or web containers.

### Local development and production boundary

Windows 11 / Docker Desktop development does not run this Linux host agent. Leave HUB_DEPLOYMENT_AGENT_TOKEN and HUB_DEPLOYMENT_AGENT_SOCKET empty in local development. Keep HUB_ACCESS_DEPLOYMENT_ENABLED=false. The UI and API feature gate remain disabled until Linux host integration tests pass. Ordinary local development and the existing loopback web endpoint remain available.

LAN and Custom require an already configured TLS termination layer. Hub Manager does not provision certificates, DNS, or reverse proxies. Tailscale Serve must also be configured outside Hub Manager. The host agent applies only the fixed web bind address and verifies the resulting HTTPS endpoint.

## Windows 11 local development workflow, current baseline

The supported current development workstation is Windows 11 with VS Code and Docker Desktop. Run the repository locally from PowerShell. Docker Compose is the reproducible local runtime for the web, API, PostgreSQL, and code-server services. Production remains a Linux deployment target; the existing Proxmox LXC is the intended target unless a later decision changes it.

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

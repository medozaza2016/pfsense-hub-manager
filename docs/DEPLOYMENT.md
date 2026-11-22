# Local and Proxmox Deployment

## Current deployment shape
Docker Compose runs the React/Vite web application served by Nginx, the Fastify API, PostgreSQL, and code-server. PostgreSQL and the API are not published to the LXC host. The application UI binds to 127.0.0.1 by default. You can instead bind it to the host's Tailscale IPv4 address by setting HUB_BIND_ADDRESS in .env. This publishes the UI only on that selected interface, not on the host's LAN or public interfaces. Do not use 0.0.0.0. Code-server remains bound to 127.0.0.1. Do not publish either service directly to the public internet.

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

On Linux, create the runtime key once using a cryptographically secure random generator, then store the recovery copy in an approved password manager without printing it into shell history or logs. The Linux installer/provisioning workflow still requires a dedicated implementation and review.

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

The pfSense Hub application UI is available at http://127.0.0.1:8080 when HUB_BIND_ADDRESS is left at its default. For Tailscale access, set HUB_BIND_ADDRESS to the Tailscale IPv4 address assigned to the machine running Docker, then access http://TAILSCALE-IP:8080 from an authorized tailnet device. The browser-based VS Code editor remains available at http://127.0.0.1:8443 and requires a local connection or SSH forwarding. Do not expose code-server or the application directly to the public internet.

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

Administration → Hub Settings stores Local, Tailscale, and Hostname/IP endpoint preferences in PostgreSQL. Saving a selection creates a desired configuration revision and queues a deployment. The API communicates with a separate Linux host agent over a private Unix socket. The API container does not receive the Docker socket and does not execute host commands.

The first Linux agent implementation supports **Tailscale MagicDNS only**. It verifies that the selected MagicDNS name belongs to the connected host, refuses to overwrite any existing Tailscale Serve or Funnel configuration, configures Tailscale Serve to proxy HTTPS to the loopback-only web service, and verifies the endpoint using normal certificate-chain and hostname validation plus the application health endpoint. It never enables Funnel. If verification fails, it removes only the Serve endpoint it just created and reports whether rollback succeeded.

**LAN and Custom endpoints are not yet deployable.** They require an explicitly provisioned certificate and private-key lifecycle, including renewal and rollback. The agent rejects these methods rather than claiming HTTPS success or exposing the web service over plain HTTP. Tailscale IP addresses are also rejected for HTTPS because the automatically provisioned Tailscale certificate is issued for the MagicDNS name, not the IP address.

Tailscale Serve requires HTTPS certificates to be enabled for the tailnet. The first Serve operation can return an interactive consent URL if this is not already enabled. The agent does not follow that URL or change tailnet-wide settings. Complete the Tailscale HTTPS prerequisite administratively before relying on automated deployment. See the [Tailscale Serve documentation](https://tailscale.com/docs/features/tailscale-serve) and [Serve CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

### Linux host-agent installation

The production project directory is /opt/pfsense-hub. The installer requires Linux, systemd, Python 3, Docker Compose, and the Tailscale CLI. It reads the deployment token from the project .env file without sourcing or executing that file, writes a root-only agent configuration, installs a systemd service, and creates a group-restricted Unix socket.

Before running the installer:

1. Set HUB_DEPLOYMENT_AGENT_TOKEN in the production .env file to a random secret of at least 32 characters.
2. Keep HUB_AGENT_API_PORT=3001, HUB_AGENT_GID=2000, and HUB_DEPLOYMENT_AGENT_SOCKET=/run/pfsense-hub/agent.sock in that file.
3. Ensure the project is checked out at /opt/pfsense-hub.

Then run:

```bash
sudo /opt/pfsense-hub/host-agent/install-linux.sh
```

The installer does not enable Tailscale HTTPS, modify ACLs, configure Funnel, or change the currently running web binding. After installation, recreate only the API container so its Unix-socket mount and supplementary group are applied:

```bash
cd /opt/pfsense-hub
docker compose up -d --no-deps api
```

Check the agent with systemctl status pfsense-hub-deployment-agent and inspect its logs with journalctl -u pfsense-hub-deployment-agent. Do not expose the API port beyond loopback. Do not mount the Docker socket into the API or web containers.

### Local development and production boundary

Windows 11 / Docker Desktop development does not run this Linux host agent. Leave HUB_DEPLOYMENT_AGENT_TOKEN and HUB_DEPLOYMENT_AGENT_SOCKET empty in local development. The API then fails a deployment request closed with HOST_AGENT_NOT_CONFIGURED; ordinary local development and the existing loopback web endpoint remain available.

The automatic deployment workflow is not complete for all three access methods yet. LAN and Custom certificate provisioning, a safe TLS termination path for those methods, and their corresponding rollback tests remain outstanding. Do not use an HTTP URL as a substitute for verified HTTPS.

## Windows 11 local development workflow, current baseline

The supported current development workstation is Windows 11 with VS Code and Docker Desktop. Run the repository locally from PowerShell. Docker Compose is the reproducible local runtime for the web, API, PostgreSQL, and code-server services. Production remains a Linux deployment target; the existing Proxmox LXC is the intended target unless a later decision changes it.

Recommended closeout sequence from the repository root:

```powershell
git status --short --branch
git fetch origin
npm ci
npm run typecheck
npm test
npm run build
docker compose config
docker compose up -d --build
docker compose ps
```

Use the exact scripts available in the current root `package.json`; if a command is not defined, run its workspace equivalent and record that fact. Confirm the application in a browser after the rebuild. A running container can retain an older image even when the local source and Git branch are current. When UI behavior appears inconsistent with source, inspect the running image/container and rebuild the relevant service before changing application code.

Do not run development seed commands against production data. Use only a local development database and the explicit development guard documented in [Phase 01](PHASE-01-USER-MANAGEMENT-AUDIT-ALERTS.md).

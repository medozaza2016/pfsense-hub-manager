# Local and Proxmox Deployment

> **Workflow status:** This guide contains legacy setup instructions matching the current single-firewall implementation. The approved target is a Hub-only installation that starts with zero registered firewalls. Read [Hub Installation and First-Run Bootstrap](INSTALLATION-BOOTSTRAP.md). That target is not implemented yet. Do not remove existing firewall configuration or run assumed new installer steps until the application, Compose configuration, PowerShell installer, Bash installer, and migration path are implemented and verified together.

## Current deployment shape
Docker Compose runs the React/Vite web application served by Nginx, the Fastify API, PostgreSQL, and code-server. PostgreSQL and the API are not published to the LXC host. The application UI binds to 127.0.0.1 by default. You can instead bind it to the host's Tailscale IPv4 address by setting HUB_BIND_ADDRESS in .env. This publishes the UI only on that selected interface, not on the host's LAN or public interfaces. Do not use 0.0.0.0. Code-server remains bound to 127.0.0.1. Do not publish either service directly to the public internet.

The code-server container has a persistent project workspace and persistent editor configuration. It is isolated from the application backend network and does not receive the Docker socket.

## Current implementation prerequisites (legacy single-firewall bootstrap)

These prerequisites describe the current repository, not the target first-run experience. The current API and Compose configuration still require a preconfigured firewall. This dependency is scheduled for removal during the multi-site onboarding implementation.
- Docker Engine and Docker Compose plugin.
- Node.js 22 only if running application development scripts outside containers.
- A trusted CA certificate for the firewall API, if required.
- The dedicated read-only pfSense API key.
- A strong, unique code-server password.
- The application encryption key provisioned by scripts/setup-encryption-key.ps1 on Windows.

## Current legacy setup procedure

**This is not the approved clean-install target.** It documents the existing environment-driven bootstrap so the current deployment can be preserved and migrated safely. Once implemented, a fresh Hub-only installation must not ask for firewall information.
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

## Security limitations before production
- No manager-user authentication or role-based authorization is implemented. Keep the web UI bound to localhost or the host's Tailscale interface only. Restrict tailnet access with Tailscale ACLs or grants. Tailscale network access is not a substitute for manager-user authentication and authorization.
- The first firewall is still configured from environment variables. Multi-device CRUD and credential lifecycle APIs are not implemented. This is legacy behavior, not a requirement for the target Hub installation.
- Key rotation and Linux key provisioning remain outstanding.
- Docker Compose file secrets are not encrypted at rest.
- Windows host ACLs do not by themselves prove container-side access restrictions.
- The eight upstream routes are fixed in code. No arbitrary proxy, command execution, or write operation exists.


## GUI-managed Hub access settings, planned behavior

The initial installation remains bound to `127.0.0.1`. The future Administration → Hub Settings page will store optional Tailscale IPv4 and later hostname/proxy settings in PostgreSQL. Entering an address does not install Tailscale, configure DNS, create a proxy, change Docker's host-port publication, or prove remote reachability.

Do not change `HUB_BIND_ADDRESS` or enable a remote binding until manager authentication/authorization and a reviewed apply workflow exist. Docker host-port publication is controlled outside the application container. A future apply mechanism must be narrowly scoped, validate that the address belongs to a host interface, preserve rollback to the previous binding, and report applied state separately from reachability. Do not mount the Docker socket into the web or API container. See `HUB-ACCESS-CONFIGURATION.md` and DEC-025.


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

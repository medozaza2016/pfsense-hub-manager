# Local and Proxmox Deployment

## Current deployment shape
Docker Compose runs the React/Vite web application served by Nginx, the Fastify API, PostgreSQL, and code-server. PostgreSQL and the API are not published to the LXC host. The application UI and code-server are bound to 127.0.0.1 by default. Use SSH tunnels for workstation access. Do not publish either service directly to the internet.

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

The pfSense Hub application UI is available at http://127.0.0.1:8080. The browser-based VS Code editor is available at http://127.0.0.1:8443. Use SSH forwarding for remote workstation access. Do not expose code-server or the application directly to the public internet.

The API container reads the application encryption key from /run/secrets/app_encryption_key. Missing or malformed key material prevents API startup. Do not delete or replace the key file while encrypted credentials exist.

## Updates and backup
Back up PostgreSQL and the runtime encryption key separately. Protect the recovery copy independently. A database backup without its corresponding encryption key cannot restore credentials. Also back up .env, the pfSense API key, code-server password, CA certificate, and any persistent workspace or editor volumes that need preservation.

## Security limitations before production
- No manager-user authentication or role-based authorization is implemented. Keep the web UI bound to localhost.
- The first firewall is still configured from environment variables. Multi-device CRUD and credential lifecycle APIs are not implemented.
- Key rotation and Linux key provisioning remain outstanding.
- Docker Compose file secrets are not encrypted at rest.
- Windows host ACLs do not by themselves prove container-side access restrictions.
- The eight upstream routes are fixed in code. No arbitrary proxy, command execution, or write operation exists.

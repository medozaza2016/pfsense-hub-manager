# Local and Proxmox Deployment

## Current deployment shape

Docker Compose runs four services: the React/Vite web application served by Nginx, the Fastify API, PostgreSQL, and code-server (VS Code in the browser). PostgreSQL and the API are not published to the LXC host. The application UI and code-server are both bound to 127.0.0.1 on the LXC host by default. Use SSH tunnels for workstation access. Do not publish either service directly to the internet.

The code-server container has a persistent project workspace at ./workspace, persistent editor configuration and extension data in named volumes, and password authentication using a Docker secret. It is intentionally isolated from the application backend network and does not receive the Docker socket. This prevents the editor terminal from automatically gaining control of the host Docker daemon.

The Docker Compose configuration and application images were previously built successfully in GitHub Actions. The updated four-service stack must be validated in CI and then deployed on the target Proxmox LXC. Live deployment and firewall connectivity validation remain pending. Manager-user authentication for the pfSense Hub web application has not been implemented. Do not place that application behind a public reverse proxy until authentication and authorization are implemented and reviewed.

## Prerequisites

- Docker Engine and Docker Compose plugin.
- Node.js 22 only if running the application development scripts outside containers.
- A trusted CA certificate for the firewall API, if it is not signed by a CA already trusted by the API container.
- The dedicated read-only pfSense API key.
- A strong, unique code-server password.

## First-time setup

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
```

Set the generated random value as POSTGRES_PASSWORD in .env. Keep the password alphanumeric as generated so it can be safely embedded in the Compose connection URL.

Create both Docker secret files:

```bash
mkdir -p secrets certs workspace
umask 077
printf '%s' 'YOUR_PFSENSE_API_KEY' > secrets/pfsense_api_key
printf '%s' 'A_LONG_UNIQUE_CODE_SERVER_PASSWORD' > secrets/code_server_password
chown 1000:1000 secrets/pfsense_api_key
chmod 400 secrets/pfsense_api_key secrets/code_server_password
```

The API container runs as UID 1000. The code-server image runs as its non-root coder user. Keep the code-server password separate from the pfSense API key and PostgreSQL password. Do not commit either secret file.

If the firewall uses a private/self-signed CA, place the CA certificate at certs/pfsense-ca.pem. Set PFSENSE_CA_FILE=/run/certs/pfsense-ca.pem in .env. The API client always verifies TLS and hostname identity. Never disable verification. The certificate must contain a SAN matching the configured API URL host.

Set the device name, edition, base URL, and UUID in .env. The sample address is the previously tested LAN endpoint. Confirm it is still the intended route from the manager LXC.

## Start and access

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

The pfSense Hub application UI is available on the LXC at http://127.0.0.1:8080. The browser-based VS Code editor is available on the LXC at http://127.0.0.1:8443. The editor prompts for the password stored in secrets/code_server_password.

For access from an administrator workstation, create SSH tunnels from that workstation:

```bash
ssh -N \
  -L 8080:127.0.0.1:8080 \
  -L 8443:127.0.0.1:8443 \
  USER@PFSENSE_HUB_LXC_IP
```

Then open http://127.0.0.1:8080 for the application and http://127.0.0.1:8443 for VS Code in the browser. Replace the SSH username and LXC address with the actual values for your environment.

The code-server workspace is the host-side ./workspace directory. Clone repositories into that directory from the integrated terminal. Editor settings and installed extensions persist across container recreation.

Do not expose code-server directly to the public internet. The password is an additional control, not a substitute for HTTPS and a protected access layer. If remote browser access without SSH is needed, put it behind a properly configured HTTPS reverse proxy and an access-control layer such as Cloudflare Access. Preserve WebSocket support. Do not disable code-server password authentication unless an upstream access layer has been fully configured and tested.

The code-server container does not mount /var/run/docker.sock. That is deliberate: Docker socket access effectively grants root-level control over the LXC's Docker host. If container orchestration from the editor is later required, design and review that privilege boundary explicitly rather than mounting the socket by default.

Run the API overview check from the application UI. It calls only the eight fixed GET routes recorded in the integration reference. ARP rows and individual firewall states are not returned or persisted; only aggregate counts are returned. Poll outcomes and duration metadata are written to PostgreSQL.

## Updates and backup

```bash
docker compose pull
docker compose up -d --build
```

Back up PostgreSQL with pg_dump before upgrades. Back up ./workspace and the code_server_config and code_server_data named volumes if you want to preserve projects, editor settings, and extensions. Docker volumes persist across container recreation, but they are not backups. Protect .env, both secret files, the CA certificate, and database backups separately.

## Development mode

```bash
npm install
npm run dev
```

The Vite development server proxies /api and /health to the API. Run PostgreSQL separately and provide the same validated environment variables to the API. For browser-based editing, use the code-server service described above.

## Security limitations before production

- No manager-user authentication or role-based authorization is implemented for the pfSense Hub application. Its web UI is deliberately bound to localhost only.
- code-server has password authentication and is also bound to localhost only. Use SSH forwarding, or add HTTPS and an access-control layer before enabling remote network exposure.
- The code-server terminal does not have Docker daemon access by default.
- The first firewall is configured from environment variables. Multi-device CRUD and secret lifecycle management are not implemented.
- TLS verification is enforced. A private CA can be mounted as described above.
- The eight upstream routes are fixed in code. No arbitrary proxy, command execution, or write operation exists in the pfSense Hub API.
- Define retention, database backup/restore testing, authentication, and credential rotation before production use.

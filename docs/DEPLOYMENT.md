# Local and Proxmox Deployment

## Current deployment shape

Docker Compose runs three services: the React/Vite web application served by Nginx, the Fastify API, and PostgreSQL. PostgreSQL and the API are not published to the LXC host. The web UI is bound to 127.0.0.1 on the LXC host by default. Use an SSH tunnel for initial remote access; do not publish it directly to the internet.

This is an initial development deployment. Manager-user authentication has not been selected or implemented. Do not place the application behind a public reverse proxy until authentication and authorization are implemented and reviewed.

## Prerequisites

- Docker Engine and Docker Compose plugin.
- Node.js 22 only if running the development scripts outside containers.
- A trusted CA certificate for the firewall API, if it is not signed by a CA already trusted by the API container.
- The dedicated read-only pfSense API key.

## First-time setup

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
```

Set the generated random value as POSTGRES_PASSWORD in .env. Keep the password alphanumeric as generated so it can be safely embedded in the Compose connection URL.

Create the API secret file:

```bash
mkdir -p secrets certs
umask 077
printf '%s' 'YOUR_PFSENSE_API_KEY' > secrets/pfsense_api_key
chown 1000:1000 secrets/pfsense_api_key
chmod 400 secrets/pfsense_api_key
```

If the firewall uses a private/self-signed CA, place the CA certificate at certs/pfsense-ca.pem. Set PFSENSE_CA_FILE=/run/certs/pfsense-ca.pem in .env. The API client always verifies TLS and hostname identity. Never disable verification. The certificate must contain a SAN matching the configured API URL host.

Set the device name, edition, base URL, and UUID in .env. The sample address is the previously tested LAN endpoint. Confirm it is still the intended route from the manager LXC.

## Start and operate

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

Open the web UI on the LXC itself at http://127.0.0.1:8080. For access from an administrator workstation, create an SSH tunnel to the LXC and browse to the local forwarded port. Do not expose port 8080 publicly.

Run the API overview check from the UI. It calls only the eight fixed GET routes recorded in the integration reference. ARP rows and individual firewall states are not returned or persisted; only aggregate counts are returned. Poll outcomes and duration metadata are written to PostgreSQL.

## Updates and backup

```bash
docker compose pull
docker compose up -d --build
```

Back up PostgreSQL with pg_dump before upgrades. The named volume persists across container recreation, but a Docker volume is not a backup. Protect the .env file, API secret, CA certificate, and database backups separately.

## Development mode

```bash
npm install
npm run dev
```

The Vite development server proxies /api and /health to the API. Run PostgreSQL separately and provide the same validated environment variables to the API.

## Security limitations before production

- No manager-user authentication or role-based authorization is implemented yet. The web UI is deliberately bound to localhost only.
- The first device is configured from environment variables. Multi-device CRUD and secret lifecycle management are not implemented.
- TLS verification is enforced. A private CA can be mounted as described above.
- The eight upstream routes are fixed in code. No arbitrary proxy, command execution, or write operation exists.
- Define retention, database backup/restore testing, authentication, and credential rotation before production use.

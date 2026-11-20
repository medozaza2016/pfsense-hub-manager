# pfSense Hub Manager

A centralized management and monitoring platform for multiple pfSense firewalls, designed to support mixed **pfSense Plus** and **pfSense CE** environments.

 > **Project status:** Initial application foundation scaffolded. Runtime build and firewall connectivity validation are pending on the Proxmox LXC.

## Why this project exists

The initial use case is to manage firewalls at multiple locations from one place:
- One location runs pfSense Plus, currently verified on a Netgate 2100.
- One location runs pfSense CE, connection and compatibility validation deferred until the user is ready.
- The architecture must support more than two devices.

The goal is a unified operational view without making the product dependent on Netgate Nexus.

## Verified progress

The Proxmox LXC named pfsense-hub-manager can reach the first firewall at 172.10.50.1:10443 and authenticate using an API key belonging to the dedicated regular pfSense account pfsense_hub.

All eight initial read-only endpoints returned HTTP 200:
- System status
- Gateway status
- Interface status
- Service status
- pfSense version
- ARP table
- Firewall states
- Firewall state table size

The tested firewall reported pfSense Plus 26.07.2-RELEASE. The API key is not stored in this repository.

**Important:** The test used a self-signed certificate and temporarily bypassed certificate verification with curl -k. This is diagnostic only. Verified TLS must be completed before production use.

See [Integration Status](docs/INTEGRATION-STATUS.md) for the exact test record and limitations.

## Product direction

The long-term product goal is a full-featured, centralized pfSense management platform, not a read-only monitoring tool. It is intended to grow to support firewall rules, aliases, NAT, interfaces, routing, services, and other supported configuration areas, subject to per-device API capabilities and security controls. Development will proceed in stages: read-only monitoring first, then carefully governed write capabilities. Remote command execution is not assumed to be required.

The connection method between the hub and each firewall is intentionally undecided. The architecture must support multiple firewalls and allow the transport mechanism to be selected later without rewriting management features.

The integration must account for differences by pfSense edition, release, API package version, and hardware architecture. The community pfSense REST API is unofficial and is not a Netgate-supported API.

## Deployment

The application runs on the existing Proxmox LXC `pfsense-hub-manager` using Docker Compose. The initial stack contains a React/Vite web frontend, a Fastify/TypeScript API, and PostgreSQL. The API key is mounted as a Docker secret, TLS verification is enforced, and the web port is bound to 127.0.0.1. Manager-user authentication is not implemented yet, so do not expose the UI publicly. The firewall-to-hub transport beyond the current tested LAN path remains deferred. See [Architecture](docs/ARCHITECTURE.md) and [Decision Log](docs/DECISIONS.md).

## Repository guide

- [Agent instructions](AGENTS.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [API specification](docs/API-SPECIFICATION.md)
- [Integration status and verified tests](docs/INTEGRATION-STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Decision log](docs/DECISIONS.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Metrics](docs/METRICS.md)
- [Monitoring](docs/MONITORING.md)

## Security

Never commit firewall credentials, API keys, tokens, private keys, configuration backups, or real customer/network data. Keep credentials server-side, use least privilege, prefer private connectivity, and validate TLS certificates. Do not expose a firewall management API directly to the public internet by default.

## Development

See [Deployment](docs/DEPLOYMENT.md). Copy .env.example to .env, create the local API key file described in secrets/README.md, and configure a trusted CA if required. Run docker compose config, then docker compose up -d --build. The initial UI is available on the LXC at http://127.0.0.1:8080. The eight upstream GET operations are implemented behind a fixed allowlist; no write routes or arbitrary proxy exist. Manager-user authentication and multi-device administration remain future work.

## License

Not yet selected. Do not assume this project is open source until a license is explicitly chosen.

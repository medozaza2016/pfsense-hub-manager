# pfSense Hub Manager

A centralized management and monitoring platform for multiple pfSense firewalls, designed to support mixed **pfSense Plus** and **pfSense CE** environments.

> **Project status:** Foundation and requirements phase. The application has not yet been implemented.

## Why this project exists

The initial use case is to manage firewalls at two locations from one place:
- One location runs pfSense Plus.
- One location runs pfSense CE.

The goal is a unified operational view without making the product dependent on Netgate Nexus.

## Planned direction

The initial technology direction discussed is:
- **Frontend:** React + TypeScript
- **Management/API layer:** Cloudflare Workers
- **Firewall integration:** pfSense REST API, subject to release and platform compatibility verification

These are planning decisions, not a completed implementation. Database, identity/authentication provider, deployment topology, and private connectivity design remain to be finalized.

## Initial scope

The first milestone should establish secure, read-only connectivity and visibility:
- Register and identify managed firewall instances.
- Report device reachability and basic system status.
- Retrieve supported information through the REST API.
- Show per-device connection and API compatibility status.
- Handle unavailable devices and partial failures without taking down the whole dashboard.

Configuration changes, remote command execution, and other write operations are out of the initial scope until separately specified and secured.

## Important integration note

The community pfSense REST API is unofficial and is not a Netgate-supported API. Compatibility depends on the pfSense edition, release, API package version, and platform architecture. Verify the compatibility matrix and endpoint documentation before installing or calling it. Do not assume every operation is available on both CE and Plus.

## Repository guide

- [Agent instructions](AGENTS.md)
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md) (planned)
- [Security](docs/SECURITY.md) (planned)
- [Roadmap](docs/ROADMAP.md) (planned)
- [Decision log](docs/DECISIONS.md) (planned)

## Development

No application scaffold or runnable development environment has been committed yet. Setup instructions will be added after the architecture and initial stack are approved.

## Security

Never commit firewall credentials, API keys, tokens, private keys, configuration backups, or sensitive network information. Use private connectivity or a VPN for firewall management access wherever possible. See [AGENTS.md](AGENTS.md) for mandatory engineering and security constraints.

## License

Not yet selected. Do not assume this project is open source until a license is explicitly chosen.

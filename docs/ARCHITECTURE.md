# Architecture

## Purpose

pfSense Hub Manager is a centralized application for monitoring and, only after separate approval, managing multiple pfSense firewalls across locations. It is an independent management layer, not a firewall replacement and not a Netgate Nexus client.

## Current verified deployment

A Proxmox LXC named pfsense-hub-manager has Docker and Docker Compose installed and Tailscale connected, according to the project setup record. It can reach one Netgate 2100 running pfSense Plus through 172.10.50.1:10443 and successfully call eight read-only REST API endpoints using an API key.

The second firewall, running pfSense CE, is not yet connected. Its integration is intentionally deferred until the user is ready to attach it.

## Target logical components

The application should be structured around these logical boundaries, independent of the final hosting choice:

1. Web client: device inventory, health overview, device details, and administrative controls.
2. Application API: authenticated manager-facing API, authorization, validation, and orchestration.
3. Transport/connection abstraction: provides a replaceable path between the manager and each firewall. The concrete choice (for example, site-to-site VPN, overlay network, private connector, or another controlled route) is deliberately deferred.
4. Firewall provider/adapter: isolates REST API package, edition, release, and endpoint differences, and exposes per-device capabilities for both read and write operations.
5. Management services: implement domain workflows for rules, aliases, NAT, interfaces, routing, services, and other supported configuration areas without embedding transport details.
6. Polling and health service: per-device collection, timeouts, bounded retries, last-success timestamps, and partial-failure handling.
7. Persistence layer: device inventory, normalized observations, configuration/change metadata, and audit events under an approved retention policy.
8. Secret boundary: server-side storage and injection of per-device credentials.
9. Change safety service: validation, change previews, confirmation, backup/recovery coordination, apply orchestration, and post-change verification.
10. Observability: structured logs and metrics with secret and sensitive-payload redaction.

## Multi-device model

Do not hard-code exactly two firewalls. A managed device should have an application-generated ID, display name, location label, edition, release, API package version, architecture, connection configuration, credential reference, compatibility status, and last successful contact time.

Keep credentials separate from ordinary device metadata. Never use serial numbers or Netgate IDs as public device identifiers.

## Adapter boundary

All firewall communication must go through a provider interface. The UI and general application services must not contain edition-specific endpoint assumptions.

The adapter should:
- Identify firewall edition, release, architecture, and API package version where available.
- Expose explicit capabilities per device.
- Validate responses at runtime.
- Normalize supported data into application-owned types.
- Return unsupported capability distinctly from network or authentication failure.
- Handle pagination if required by the endpoint.
- Avoid retaining sensitive raw payloads unless explicitly required.

## Technology status

React + TypeScript was discussed as an initial frontend direction, with Cloudflare Workers as an initially discussed management/API layer. Later planning also considered a separately hosted frontend and a self-hosted Node.js/TypeScript backend on Proxmox. Next.js has been mentioned as a possible development framework in the latest discussion, but it has not yet been recorded as an approved choice.

No framework, database, identity provider, deployment topology, or final network path should be treated as settled until recorded in DECISIONS.md.

## Network architecture

The exact firewall-to-hub connection method is an open decision and is intentionally not selected at this stage. The logical design must not depend on a specific VPN, tunnel, agent, public endpoint, or LAN route. Keep transport behind a connection abstraction so the chosen method can be changed without changing firewall management domain logic.

Candidate approaches to evaluate later include a hub-initiated private VPN/overlay connection, a site-to-site tunnel, or a site-local connector that establishes outbound connectivity. The decision should account for NAT, firewall rules, site count, operational complexity, key rotation, availability, and whether inbound access to a site is prohibited.

The manager must reach each firewall through a controlled private management path. Do not expose the pfSense management API directly to the public internet by default. The Plus test currently uses the direct LAN address 172.10.50.1 and port 10443.

The manager could not reach the public hostname on port 443 in the captured test, while the user's XPS-13 could. Investigate only if the final design requires that route. The user has explicitly chosen to leave the 172.10.x.x addressing unchanged for now.

## Resilience

A firewall outage must not make the whole manager unavailable. Poll each device independently. Record connection state, last attempt, last successful poll, and classified error. Use bounded timeouts and retries with backoff. Avoid synchronized polling spikes across devices.

## Open architecture decisions

- Final frontend framework, including whether to use Next.js.
- Backend runtime and hosting topology.
- Firewall-to-hub transport: VPN/overlay, site-to-site tunnel, private connector/agent, or another private path. This decision is explicitly deferred.
- Whether a private connector/agent is needed for remote sites.
- Database and retention policy.
- Administrator authentication and role model.
- Secret storage and rotation mechanism.
- Polling frequency and concurrency.
- Exact initial dashboard metrics.
- Support matrix for Plus and CE versions and package releases.

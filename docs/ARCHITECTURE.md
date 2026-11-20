# Architecture

## Purpose

pfSense Hub Manager is a centralized application for monitoring and, only after separate approval, managing multiple pfSense firewalls across locations. It is an independent management layer, not a firewall replacement and not a Netgate Nexus client.

## Current verified deployment

A Proxmox LXC named pfsense-hub-manager has Docker and Docker Compose installed and Tailscale connected, according to the project setup record. It can reach one Netgate 2100 running pfSense Plus through 172.10.50.1:10443 and successfully call eight read-only REST API endpoints using an API key.

The second firewall, running pfSense CE, is not yet connected. Its integration is intentionally deferred until the user is ready to attach it.

## Target logical components

The application should be structured around these logical boundaries, within the approved Proxmox LXC and Docker Compose deployment:

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

## Approved deployment

The application will be deployed on the existing Proxmox LXC named `pfsense-hub-manager`. Docker Compose will manage the application containers. Cloudflare Workers and Cloudflare hosting are not part of this project.

The approved frontend is React with TypeScript and Vite. The backend is a separate Node.js and TypeScript service exposing a REST API. PostgreSQL is approved as the application database and will run as a dedicated Docker Compose service. Fastify is the selected backend HTTP framework. The administrator identity provider and secret storage mechanism remain undecided. See `DECISIONS.md` for the authoritative decision record.

## Network architecture

The exact firewall-to-hub connection method is an open decision and is intentionally not selected at this stage. The logical design must not depend on a specific VPN, tunnel, agent, public endpoint, or LAN route. Keep transport behind a connection abstraction so the chosen method can be changed without changing firewall management domain logic.

Candidate approaches to evaluate later include a hub-initiated private VPN/overlay connection, a site-to-site tunnel, or a site-local connector that establishes outbound connectivity. The decision should account for NAT, firewall rules, site count, operational complexity, key rotation, availability, and whether inbound access to a site is prohibited.

The manager must reach each firewall through a controlled private management path. Do not expose the pfSense management API directly to the public internet by default. The Plus test currently uses the direct LAN address 172.10.50.1 and port 10443.

The manager could not reach the public hostname on port 443 in the captured test, while the user's XPS-13 could. Investigate only if the final design requires that route. The user has explicitly chosen to leave the 172.10.x.x addressing unchanged for now.

## Resilience

A firewall outage must not make the whole manager unavailable. Poll each device independently. Record connection state, last attempt, last successful poll, and classified error. Use bounded timeouts and retries with backoff. Avoid synchronized polling spikes across devices.

## Open architecture decisions

- Administrator authentication and secret storage.
- Firewall-to-hub transport: VPN/overlay, site-to-site tunnel, private connector/agent, or another private path. This decision is explicitly deferred.
- Whether a private connector/agent is needed for remote sites.
- Polling frequency and concurrency.
- Exact initial dashboard metrics.
- Support matrix for Plus and CE versions and package releases.

## Runtime and container boundaries

The initial deployment is a Docker Compose application on the existing Proxmox LXC `pfsense-hub-manager`. Compose is the deployment and lifecycle boundary. The design should start with the smallest useful number of runtime services and avoid introducing infrastructure that has no approved requirement.

### Initial logical services

1. **Web frontend:** React application built with Vite and TypeScript. It presents the operator interface and calls only the manager's application API. It must not call pfSense directly or contain firewall credentials.
2. **Backend API:** Node.js and TypeScript service exposing the manager's REST API. It owns authentication and authorization enforcement once selected, input validation, device orchestration, firewall API calls, and safe response shaping.
3. **Polling execution:** Initially a backend module/process responsibility, not a separate distributed service. It performs scheduled per-device collection with independent timeouts, bounded concurrency, and backoff. A separate worker container may be considered only if measured workload or operational isolation justifies it.

This is a logical starting topology, not a final Compose file or a decision about the backend HTTP framework. Do not add a cache, message broker, identity provider, reverse proxy, or secret-management product until its requirement and operational cost are documented and approved.

### Container communication and exposure

- Browser traffic terminates at the application's chosen ingress and reaches the web frontend.
- The frontend calls the backend through the manager's application API.
- Only the backend initiates connections to managed firewalls.
- The backend and any future persistence service should communicate over private Compose networking.
- Do not publish database or internal service ports to the LXC host or external networks unless a documented operational requirement requires it.
- The exact ingress/reverse-proxy component, host port mapping, DNS name, and TLS termination point remain open deployment details.
- The firewall management API must not be exposed publicly as a consequence of deploying the manager.

### Configuration and persistence boundaries

Non-secret runtime configuration (for example, listen addresses and log levels) must be validated at startup. Firewall API keys, passwords, private keys, and session-signing material must be injected only into server-side components through an approved protected mechanism. The mechanism is not selected yet. Do not place secrets in Vite-exposed variables, image layers, source control, browser storage, or logs.

PostgreSQL is the approved application database and will run as a dedicated Docker Compose service with a persistent volume and private Compose networking. The data model should distinguish stable device inventory and configuration metadata from time-series observations and sensitive diagnostic data. ARP entries and firewall state details should not be retained by default. Schema migrations, retention, backup, restore, and encryption requirements must be defined before production use. Database ports must not be published externally by default.

## Firewall integration architecture

The integration path is deliberately layered so that management features do not depend on a specific network route or pfSense API implementation.

```text
React web client
      |
      | Manager REST API
      v
Node.js application API
      |
      v
Management/domain services
      |
      v
Firewall provider interface
      |
      +---- pfSense REST API adapter
      |          |
      |          v
      |     Transport interface
      |          |
      |          v
      |     Selected private connection (not yet decided)
      |
      +---- Per-device capability and compatibility profile
```

### Responsibilities

- **Application API:** Accepts manager-facing requests, validates inputs, applies manager-user authorization, and returns normalized application responses. It does not expose raw firewall credentials or blindly proxy arbitrary API paths.
- **Management/domain services:** Express product operations such as reading system health, gateway status, interface status, and service status. They should not know whether a firewall is Plus or CE, or how packets reach it.
- **Provider interface:** Defines the application-owned operations available for a managed firewall and returns typed results and classified failures. It is the stable boundary used by domain services.
- **pfSense REST API adapter:** Implements provider operations using the community REST API. It owns endpoint paths, HTTP methods, authentication-header construction, response-envelope parsing, runtime schema validation, and package/release-specific behavior.
- **Transport interface:** Supplies a secure connection to the configured firewall API origin. The implementation may later use a site-to-site VPN, overlay network, private connector, or another approved route. The transport choice must not leak into domain services or frontend code.
- **Capability profile:** Records what is actually supported for each device based on edition, release, architecture, and installed API package version. Unknown capability is reported as unknown or unsupported, never assumed to work.

### Device connection lifecycle

For each device, the backend should:
1. Load non-secret connection metadata and resolve the credential reference through the approved secret mechanism.
2. Establish a connection using verified TLS and the configured transport.
3. Authenticate using the device's configured API-key mechanism.
4. Call only operations enabled for that device's current capability profile.
5. Validate the response at runtime and map it into application-owned types.
6. Record poll time, duration, success state, and a classified error without recording credentials or unrestricted raw payloads.
7. Release secret material and request resources as soon as practical.

The initial implementation must use read-only operations only. The first verified Plus device has eight GET endpoints recorded in `INTEGRATION-STATUS.md`. Those results do not establish CE compatibility, schema compatibility across releases, or support for any write operation.

### Failure model

Keep these outcomes distinguishable in application state and logs:
- DNS or route failure, connection refusal, or timeout.
- TLS trust or hostname validation failure.
- Authentication failure.
- Authorization failure.
- Unsupported endpoint or capability.
- Rate limiting or remote service failure.
- Invalid JSON or response-schema mismatch.

A failure on one firewall must not block polling or viewing other devices. Use per-device timeouts, bounded retries with backoff, and concurrency limits. Do not retry authentication or authorization failures indefinitely.

### Future write-operation boundary

Write operations are outside the initial implementation scope. When they are considered, they must be added as explicit provider capabilities and protected by a separate change workflow: granular authorization, input validation, preview/diff, explicit target confirmation, pre-change backup or documented recovery path, durable audit event, controlled apply, and post-apply verification. A generic proxy to arbitrary pfSense write endpoints is not an acceptable implementation.

## Architecture decisions intentionally left open

The following remain unresolved and must not be inferred from this document:

- Database engine, schema, retention, and backup/restore policy.
- Manager administrator authentication, session model, and roles.
- Secret storage, injection, rotation, and revocation mechanism.
- Ingress/reverse proxy, public or private application URL, and TLS termination.
- Firewall-to-hub transport and whether a site-local connector is required.
- Polling intervals, concurrency limits, and initial dashboard metrics.
- Exact Plus/CE and API package compatibility matrix.

Record each approved choice in `DECISIONS.md` before implementation depends on it.



## Selected backend framework and API reference

**Fastify is the selected Node.js HTTP framework** (DEC-015). Implement the manager-facing REST API in TypeScript using Fastify. Keep the framework behind the backend application boundary so domain services and the pfSense provider interface do not depend on Fastify request/reply objects.

The supplied upstream pfSense OpenAPI 3.0 JSON specification is the source for endpoint discovery and schema references. Preserve it at `specs/pfsense-openapi.json` when committed. Its `info.version` is `unknown`, so record a source checksum and retrieval/receipt date separately, and do not treat it as the installed package version on any firewall.

Generate `docs/API-MATRIX.md` from the specification using `scripts/generate-api-matrix.mjs`. The generated matrix is an inventory, not a compatibility guarantee. Device compatibility must be recorded separately for each edition, release, architecture, and installed API package version. The eight successful GET calls on the first Plus device remain the only currently documented live endpoint verification.

## Metrics and monitoring boundary

Expose application metrics from the Fastify backend at a protected or network-restricted `/metrics` endpoint. Initial metrics are defined in `METRICS.md`. Keep collection and aggregation in the backend. Prometheus is a later optional deployment component, not an initial mandatory container. PostgreSQL stores application records and selected operational history; Prometheus, if introduced, stores time-series metrics. Do not persist every scrape sample in PostgreSQL.

Metrics labels must be bounded. Never label by arbitrary device IP, raw path with IDs, exception message, credential, or API key. Device labels should use stable application-generated device IDs.

## API specification maintenance

The OpenAPI JSON is the upstream contract reference. The application must use a controlled subset of operations through typed provider methods, not a generic pass-through proxy. Validate live responses at runtime. When the source specification changes, regenerate the matrix and review added, removed, and changed operations before changing application behavior.

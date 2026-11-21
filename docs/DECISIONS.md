# Decision Log

This document records confirmed architectural decisions. Proposals and open questions must not be presented as settled.

## Confirmed decisions and constraints

### DEC-001, Multi-firewall product
**Status:** Accepted  
**Decision:** Build a centralized manager for multiple pfSense firewalls and locations. Do not hard-code exactly two devices.

### DEC-002, Edition support
**Status:** Accepted  
**Decision:** Target both pfSense Plus and pfSense CE. Treat endpoint and package compatibility as version-dependent and verify it per device.

### DEC-003, No Netgate Nexus dependency
**Status:** Accepted  
**Decision:** The product must remain independent of Netgate Nexus.

### DEC-004, Read-only first
**Status:** Accepted  
**Decision:** Initial integration is read-only. No configuration-changing API methods are enabled for the application at this stage.

### DEC-005, Least-privilege API identity
**Status:** Verified for first Plus firewall  
**Decision:** Use a dedicated regular pfSense user named pfsense_hub, not an administrator account, for the initial API integration. The API key belongs to this user and the user has the nine approved GET privileges recorded in INTEGRATION-STATUS.md, eight core operational reads plus the REST API package-version probe.

### DEC-006, Keep current addressing for now
**Status:** Accepted  
**Decision:** Leave the existing 172.10.x.x addressing unchanged during current development.

### DEC-007, Defer second firewall connection
**Status:** Accepted  
**Decision:** Defer connecting the second pfSense CE firewall until the user is ready. Design the application for multiple devices now.

### DEC-008, Full management product direction
**Status:** Accepted  
**Decision:** The long-term product is a full pfSense management application, not a read-only monitoring dashboard. Delivery will be phased, with read-only first and write operations introduced only after security and recovery controls are implemented.

### DEC-009, Extensible firewall inventory
**Status:** Accepted  
**Decision:** The hub must support adding additional pfSense firewalls over time.

### DEC-010, Defer firewall connection method
**Status:** Deferred  
**Decision:** Do not select or implement the firewall-to-hub connection method yet. Keep the transport replaceable until a separate decision is made.

### DEC-011, Application deployment environment
**Status:** Accepted  
**Decision:** Deploy pfSense Hub Manager on the existing Proxmox LXC named `pfsense-hub-manager`, using Docker Compose to manage the application containers. Do not use Cloudflare Workers or Cloudflare hosting for this project.

### DEC-012, Frontend stack
**Status:** Accepted  
**Decision:** Use React with TypeScript and Vite for the web frontend.

### DEC-013, Backend separation
**Status:** Accepted  
**Decision:** Use a separate Node.js and TypeScript backend, exposing a REST API to the frontend. Keep firewall integration server-side and behind a provider/transport abstraction.

### DEC-014, Application database
**Status:** Accepted  
**Decision:** Use PostgreSQL as the application database, deployed as a dedicated service in the project's Docker Compose stack. Keep it on a private Compose network with a persistent data volume. Do not expose the database port publicly by default. Schema design, migrations, retention, backup/restore, and encryption requirements must be completed before production use.

## Open decisions

1. PostgreSQL schema, migrations, retention, and backup/restore policy.
3. Manager administrator authentication and roles.
4. Server-side secret storage and key rotation.
5. First dashboard metrics and polling frequency.
6. Supported Plus/CE and API package compatibility matrix.
7. Exact rollout order and supported scope of write capabilities.
8. Firewall-to-hub transport and whether a private connector/agent is required.


### DEC-015, Backend HTTP framework
**Status:** Accepted  
**Decision:** Use Fastify for the Node.js + TypeScript backend REST API. Keep domain services and the pfSense provider/adapter independent of Fastify-specific request and response types.

### DEC-016, Upstream pfSense API specification
**Status:** Accepted  
**Decision:** Treat the user-supplied pfSense REST API OpenAPI 3.0 JSON document as the upstream reference contract. Preserve the source unchanged at `docs/reference/pfsense-openapi.json` in the repository. This file is already committed; do not create a duplicate. Its metadata reports `info.version: unknown`; this is not the installed API package version for the tested firewall.

### DEC-017, Generated API coverage matrix
**Status:** Accepted  
**Decision:** Maintain `docs/API-MATRIX.md` as a generated inventory from the OpenAPI JSON, not as a manually curated endpoint list. Track specification presence, live-device verification, backend implementation, frontend exposure, and automated test status as separate fields. Presence in the upstream specification does not imply device compatibility or permission to enable a write operation.

### DEC-018, Application metrics
**Status:** Accepted  
**Decision:** Define application-level HTTP, polling, reachability, and process metrics in `docs/METRICS.md`. Initially expose metrics from the Fastify backend. Prometheus is optional for a later stage and is not a mandatory initial container.

### DEC-019, Initial read-only safety boundary
**Status:** Accepted  
**Decision:** Keep all pfSense configuration-changing operations disabled in the initial release, even when the OpenAPI specification documents them. Implement only explicitly approved read-only provider operations until the separate write-safety requirements are met.


### DEC-020, Local-only initial UI exposure
**Status:** Accepted as an implementation safety boundary
**Decision:** Until manager-user authentication and authorization are selected and implemented, publish the web UI only on the LXC loopback address (127.0.0.1). Do not expose the application through a public reverse proxy or public interface. Access it remotely through an authenticated administrative tunnel such as SSH. The API and database remain unpublished to the host network.

### DEC-021, Frontend routing
**Status:** Accepted  
**Decision:** Use React Router for all frontend page navigation. Every navigable page must have a stable URL using lowercase kebab-case path segments. Routes must support direct links, browser history navigation, bookmarks, and refresh/deep links. Keep route definitions centralized and enforce access authorization in the backend independently of frontend route guards.



### DEC-022, Persisted device connection lifecycle
**Status:** Accepted  
**Decision:** Track connection health independently from the operator-controlled enabled/disabled setting. Persist a bounded connection status (unknown, online, degraded, offline, authentication_failed, authorization_failed, tls_error, unsupported, or error), the latest check timestamp, the latest fully successful check timestamp, and the last classified error. A successful registration or credential revalidation records an online result; each read-only collection updates the persisted lifecycle status. Do not store raw upstream error messages or credentials in these fields. This status model does not select a firewall-to-manager transport. Transport-specific connection profiles remain deferred under DEC-010 until the user approves a transport decision.

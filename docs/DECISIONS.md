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
**Decision:** Use a dedicated regular pfSense user named pfsense_hub, not an administrator account, for the initial API integration. The API key belongs to this user and the user has the eight GET privileges recorded in INTEGRATION-STATUS.md.

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

## Open decisions

1. Backend HTTP framework.
2. Database, data model, retention, and backup policy.
3. Manager administrator authentication and roles.
4. Server-side secret storage and key rotation.
5. First dashboard metrics and polling frequency.
6. Supported Plus/CE and API package compatibility matrix.
7. Exact rollout order and supported scope of write capabilities.
8. Firewall-to-hub transport and whether a private connector/agent is required.

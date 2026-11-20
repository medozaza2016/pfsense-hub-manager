# Decision Log

This document distinguishes confirmed constraints from proposals and open questions. Update it when a decision is explicitly approved.

## Confirmed decisions and constraints

### DEC-001, Multi-firewall product

**Status:** Accepted  
**Decision:** Build a centralized manager for multiple pfSense firewalls and locations. Do not hard-code exactly two devices.  
**Rationale:** The initial environment has a Plus firewall and a CE firewall, with potential for additional devices.

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
**Decision:** Leave the existing 172.10.x.x addressing unchanged during current development. Do not make renumbering a prerequisite.

### DEC-007, Defer second firewall connection

**Status:** Accepted  
**Decision:** Defer connecting the second pfSense CE firewall until the user is ready. Design the application for multiple devices now.

## Proposals not yet approved

- React + TypeScript frontend.
- Next.js as a possible framework.
- Cloudflare Workers as management/API layer.
- Netlify frontend with self-hosted Node.js/TypeScript backend on Proxmox.
- A database or specific persistence product.
- A specific administrator identity provider.
- A specific secrets manager.
- A specific polling interval.

These remain options or discussions until the user explicitly selects one.

## Open decisions

1. Frontend framework and routing model.
2. Backend runtime and hosting location.
3. Whether to use a private connector/agent for remote firewalls.
4. Database, data model, retention, and backup policy.
5. Manager administrator authentication and roles.
6. Server-side secret storage and key rotation.
7. First dashboard metrics and polling frequency.
8. Supported Plus/CE and API package compatibility matrix.
9. Whether any write capabilities will ever be required.

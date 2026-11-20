# Roadmap

## Current status

**Discovery and first-device connectivity validation completed.** Application implementation has not yet been started.

## M0, Discovery and environment validation

- [x] Create private GitHub repository and documentation foundation.
- [x] Define multi-firewall product direction.
- [x] Record Plus and CE as target editions.
- [x] Keep Netgate Nexus out of the dependency model.
- [x] Deploy manager LXC and install Docker / Docker Compose.
- [x] Establish Tailscale connectivity on the manager host.
- [x] Create dedicated regular pfSense API user pfsense_hub.
- [x] Assign the initial eight GET privileges.
- [x] Create API key for pfsense_hub.
- [x] Authenticate from the manager LXC using X-API-Key.
- [x] Receive HTTP 200 from all eight initial read-only endpoints on the Plus firewall.
- [ ] Record exact REST API package version and compatibility evidence.
- [ ] Complete verified TLS trust from the manager.

## M1, Architecture and application foundation

- [ ] Approve frontend framework and application structure.
- [ ] Approve backend runtime and deployment topology.
- [ ] Approve database and retention policy.
- [ ] Approve administrator authentication and authorization model.
- [ ] Approve secret storage mechanism.
- [ ] Define normalized device, health, gateway, interface, service, and observation types.
- [ ] Scaffold application and establish lint, type-check, test, and build commands.
- [ ] Add secure configuration loading and validation.

## M2, Read-only integration

- [ ] Implement server-side pfSense API client.
- [ ] Implement certificate-verified TLS.
- [ ] Implement runtime response validation.
- [ ] Implement per-device provider/adapter and capability detection.
- [ ] Implement device reachability and classified errors.
- [ ] Implement polling with timeouts, bounded retries, and backoff.
- [ ] Test authentication failure, timeout, TLS failure, malformed responses, and unsupported endpoints.
- [ ] Keep write operations disabled.

## M3, Dashboard

- [ ] Device inventory and status overview.
- [ ] Per-device system health.
- [ ] Gateway and interface status.
- [ ] Service status.
- [ ] Firewall state count and other approved metrics.
- [ ] Last successful poll and error details.
- [ ] Partial outage behavior.

## M4, Multi-edition validation and hardening

- [ ] Connect the second pfSense CE firewall when the user is ready.
- [ ] Record its release, API package version, architecture, and reachable management path.
- [ ] Verify supported endpoints independently on CE.
- [ ] Complete security review, access controls, logging redaction, and backup/recovery planning.
- [ ] Establish operational documentation and release process.

## Later, only with explicit requirements

Potential configuration-changing features are not approved by this roadmap. Any such feature requires a separate product decision, fine-grained authorization, user confirmation, audit logging, tests, and recovery/rollback design.

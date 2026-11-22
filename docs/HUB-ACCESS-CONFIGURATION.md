# Hub access configuration

## User-facing location

The feature belongs in the existing **Administration → Hub Settings** page. Do not add a separate top-level navigation item or redesign the approved workspace.

## Initial and optional access modes

- **Local (default):** the Hub is published only on `127.0.0.1`. This is the supported first-install state.
- **Tailscale (optional):** the administrator may use a Tailscale MagicDNS hostname or the Tailscale IPv4 address assigned to the device. MagicDNS is a name that resolves to the device's Tailscale address, it is not a separate transport. The Hub must not require Tailscale for local operation.
- **Other hostname / IP (optional):** the administrator may record an existing hostname or IP managed outside Hub Manager. Do not treat an address entry as automatic DNS, certificate, proxy, or host-network provisioning.
- **Guidance only:** explain each option with a short example and allow all optional fields to remain empty. Do not ask for a Tailscale address during first-run setup.

The Hub must remain functional without any optional access provider.

## Configuration lifecycle

The settings workflow must distinguish these states, rather than showing one misleading enabled/connected flag:

1. **Desired:** validated configuration saved by the administrator.
2. **Pending apply:** desired configuration differs from the host's currently applied listener binding.
3. **Applied:** host deployment reports the exact binding currently published by Docker.
4. **Reachability verified:** a real probe from a relevant network path succeeded. A successful database write or host-side apply is not a reachability test.

The UI must show the currently applied binding separately from the desired binding. Invalid input must be rejected before it can become active. An apply failure must leave the previous working binding intact and report a recoverable error.

## Persistence

Persist non-secret configuration in PostgreSQL, with an explicit schema version and audit timestamps. Do not store secrets, authentication tokens, or private keys in this record. The API must validate IPv4 addresses and hostname syntax, enforce the supported mode, and return typed state. Do not trust browser-supplied status values.

## Host boundary and Docker constraint

The web application and API run inside containers. Docker's published host port is configured by the Docker host/Compose deployment. A setting written to PostgreSQL cannot, by itself, rebind that published port.

A future apply implementation must use one of these reviewed approaches:
- a narrowly scoped host-side deployment agent that accepts only validated access-binding operations and cannot execute arbitrary commands; or
- an explicit operator apply step that updates the deployment configuration and recreates only the required service.

Do not mount the Docker socket into the web or API container. Do not provide arbitrary shell execution. The apply mechanism must validate the requested address against an address actually assigned to an eligible host interface, reject wildcard binds, preserve the previous working configuration for rollback, and report applied state back to the application.

## Administrator authentication

- On first launch, show a one-time administrator account creation screen. Do not ship default credentials.
- Require a username and a password of at least 14 characters.
- Store password hashes using PBKDF2-HMAC-SHA-512 with a per-user random salt and at least 310,000 iterations. Never store plaintext passwords.
- Issue opaque, random, expiring session tokens in HttpOnly, SameSite=Strict cookies. Store only SHA-256 token hashes in PostgreSQL.
- Require a valid administrator session for device data and Hub Settings API routes. Keep only health checks, version discovery, and the authentication bootstrap routes public.
- Rate-limit failed login attempts and return generic invalid-credential errors.
- Sign-out must revoke the server-side session and clear the cookie.

## Security gates

- Keep the initial bind at `127.0.0.1`.
- Do not bind to `0.0.0.0` as a convenience fallback.
- Do not enable remote access until manager authentication and authorization are implemented and tested.
- Tailscale ACLs/grants are an additional network control, not a replacement for application authentication.
- Do not publish the API or PostgreSQL ports to the host network.
- Public reverse-proxy access requires a separate security design and is not part of the unauthenticated stage.
- Never report configured, applied, or reachable as interchangeable states.

## Delivery sequence

1. Implement authenticated administrator setup/login and authorization gates required for administration.
2. Implement the Hub Settings page in the existing navigation and a validated settings API.
3. Add a PostgreSQL migration and tests for validation, persistence, default behavior, and state transitions.
4. Implement and review the restricted host-side apply mechanism, including rollback and Windows Docker Desktop/Linux behavior.
5. Add reachability verification and integration tests from a tailnet client.
6. Add optional hostname/reverse-proxy support only after trusted-proxy and TLS requirements are approved.

## Acceptance criteria

- A fresh installation remains local-only without Tailscale.
- The settings page is located at Administration → Hub Settings.
- Optional Tailscale configuration can be saved without requiring the IP during initial installation.
- The GUI clearly distinguishes desired, applied, and reachability-verified state.
- No container receives unrestricted Docker socket access.
- A failed apply cannot silently remove the last working local access path.
- No API or database port is published externally.

## Current implementation status, November 21, 2026

The current branch includes the PostgreSQL endpoint schema and deployment-history migration, authenticated Hub Settings API, administrator-only endpoint replacement, desired/applied revision tracking, audit events, a deployment queue, strict API-to-agent protocol, loopback-only API publication for host configuration retrieval, and the Administration → Hub Settings interface.

The Hub Settings interface presents LAN, Tailscale, and Custom tabs. Exactly one method is selected as active, and each tab retains its own address type, address, and port. The API rejects wildcard addresses and rejects an active Tailscale IP endpoint because the verified HTTPS certificate identity is the MagicDNS hostname. The current UI disables automatic deployment for LAN and Custom because their certificate lifecycle and TLS termination are not implemented.

### Current automatic deployment scope

A restricted Linux systemd host agent now exists under host-agent/. It accepts only a versioned deployment UUID and desired revision over a group-restricted Unix socket. It retrieves the approved configuration from the loopback-only API using a root-owned bearer token. The API container receives only a read-only socket-directory mount, never the Docker socket. The agent runs with all Linux capabilities dropped and systemd filesystem restrictions.

The current agent supports **Tailscale MagicDNS verification only**. The API and UI feature gate defaults to disabled with HUB_ACCESS_DEPLOYMENT_ENABLED=false and must remain disabled until the supported Linux host integration tests pass. It verifies the selected name matches the connected Hub host and appears in Tailscale CertDomains, verifies that an operator has already configured the exact private Tailscale Serve route to the existing loopback web service, validates the TLS certificate and hostname, and probes the application health endpoint. It does not create, update, or remove Tailscale Serve or Funnel configuration, enable tailnet HTTPS, change ACLs, or restart Docker services.

Tailscale HTTPS certificates must already be enabled administratively for the tailnet. Tailscale publishes certificate names in the public Certificate Transparency ledger. See [Enabling HTTPS](https://tailscale.com/docs/how-to/set-up-https-certificates) and [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

LAN and Custom methods remain unsupported for automated deployment. They require a trusted certificate and a TLS termination/reverse-proxy lifecycle, including renewal and rollback. A port value or saved hostname is not evidence that TLS is available.

### Deployment and verification status

The API dispatcher serializes a deployment against the desired-revision row so a concurrent settings update cannot supersede an in-flight host verification. The UI polls deployment state, displays recent history, preserves the last verified origin as a recovery link, and redirects only to an HTTPS origin returned by a successful agent result.

The Linux installer is documented in DEPLOYMENT.md and requires the project at /opt/pfsense-hub. Windows 11 / Docker Desktop local development does not run this Linux agent. Keep the agent token and socket empty in local development. A deployment request without an installed agent fails closed with HOST_AGENT_NOT_CONFIGURED.

Unit tests have been added for endpoint validation, strict protocol parsing, socket-client responses, dispatcher revision locking, host-agent MagicDNS identity, certificate eligibility, existing Serve/Funnel preservation, and Serve rollback. These tests have **not yet been executed in this environment**. API/web typecheck, builds, Docker Compose validation, Linux host installation, live Tailscale TLS verification, and browser reachability from a second tailnet device remain unverified.

The feature is not complete for all three access methods. Do not treat a saved desired setting, a queued deployment, or a host-side probe as proof that the administrator's browser can reach the new endpoint.

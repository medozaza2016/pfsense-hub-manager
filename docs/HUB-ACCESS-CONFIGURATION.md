# Hub access configuration

## User-facing location

The feature belongs in the existing **Administration → Hub Settings** page. Do not add a separate top-level navigation item or redesign the approved workspace.

## Initial and optional access modes

- **Local (default):** the Hub is published only on `127.0.0.1`. This is the supported first-install state.
- **Tailscale (optional):** the administrator may use the Hub host's Tailscale MagicDNS hostname. Tailscale IPv4 addresses are not supported as HTTPS origins because the tailnet certificate is issued for the MagicDNS name. The Hub must not require Tailscale for local operation.
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

The implemented Linux apply path uses a narrowly scoped host-side deployment agent that accepts only validated access-binding operations and cannot execute arbitrary commands.

Do not mount the Docker socket into the web or API container. Do not provide arbitrary shell execution. The agent validates the requested address against an address actually assigned to an eligible host interface, rejects wildcard binds, preserves the previous working configuration for rollback, and reports verified applied state back to the application.

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

## Delivery and platform boundary

The Linux Tailscale path is implemented and verified. Windows Docker Desktop does not include a production-equivalent systemd Host Agent, and a Windows host deployment adapter is not implemented. LAN and Custom are supported only when an operator-managed trusted TLS reverse proxy already exists. Certificate issuance/renewal, DNS, reverse-proxy provisioning, Tailscale installation/authentication, tailnet HTTPS enablement, ACL changes, and Funnel configuration remain outside Hub Manager's responsibility.

## Acceptance criteria

- A fresh installation remains local-only without Tailscale.
- The settings page is located at Administration → Hub Settings.
- Optional Tailscale configuration can be saved without requiring the IP during initial installation.
- The GUI clearly distinguishes desired, applied, and reachability-verified state.
- No container receives unrestricted Docker socket access.
- A failed apply cannot silently remove the last working local access path.
- No API or database port is published externally.

## Current implementation status, November 22, 2026

The active branch contains the PostgreSQL endpoint schema and deployment-history migration, authenticated Hub Settings API, administrator-only endpoint replacement, desired/applied revision tracking, audit events, a deployment queue, strict API-to-agent protocol, loopback-only API publication for host configuration retrieval, and the Administration → Hub Settings interface.

The Hub Settings interface presents LAN, Tailscale, and Custom tabs. Exactly one method is selected as active, while each tab retains its own address type, address, and port. Tailscale HTTPS uses the local host's MagicDNS hostname; a Tailscale IPv4 endpoint is rejected. LAN and Custom require a trusted HTTPS reverse proxy that forwards to the selected private host address on port 8080.

### Automatic Linux deployment scope

A restricted Linux systemd Host Agent accepts only a versioned deployment UUID and desired revision over a group-restricted Unix socket. It retrieves the approved configuration from the loopback-only API using a root-owned bearer token. The API container receives only a read-only socket-directory mount, never the Docker socket. The agent runs with all Linux capabilities dropped and systemd filesystem restrictions.

The agent supports LAN/Custom host binding with operator-managed TLS termination, plus Tailscale MagicDNS verification and provisioning of the fixed private Serve route to `http://127.0.0.1:8080` when that route is missing. It validates assigned host addresses, validates the local MagicDNS identity and certificate eligibility, checks for Funnel/conflicting handlers, validates HTTPS and application health, and rolls back the previous web binding if verification fails. It does not install or authenticate Tailscale, enable tailnet HTTPS, change ACLs, configure DNS, issue certificates, configure external reverse proxies, or create Funnel.

The standard Linux installer keeps `HUB_ACCESS_DEPLOYMENT_ENABLED=false` during setup. It enables the feature only after the Host Agent service, socket permissions, supplementary group, bearer-authenticated API retrieval, and web/API/PostgreSQL health checks pass. A fresh Linux installation therefore finishes with GUI-managed access deployment enabled. Windows local development keeps the feature disabled and does not run the Linux Host Agent.

### Browser behavior and progress feedback

The save action persists the desired endpoint configuration and queues a revision-scoped deployment. The UI displays the deployment state, polls its authenticated status, and redirects only after the backend records a successful HTTPS origin from the Host Agent. It preserves the last verified origin as a recovery link.

While the save/deployment operation is active, the Save button shows an animated circular progress indicator and phase-specific text. The access-method tabs and endpoint fields are disabled until a terminal state is returned. Success and failure feedback are shown after the actual deployment result, not merely after the settings API accepts the request. The user manually confirmed this progress treatment in the browser.

### Verification record

- Windows local API tests: 177 passed, 4 skipped. The skipped tests are Unix-domain-socket client tests explicitly skipped on Windows.
- Windows API and web typechecks: passed.
- Windows API and web production builds: passed.
- Linux Host Agent unit tests: 23 passed.
- Linux installer Bash syntax checks and Docker Compose validation: passed.
- Clean Debian 13 installation: completed; PostgreSQL, API, and web containers healthy.
- Installer Host Agent handshake: passed, including supplementary-group, socket, and bearer-authenticated request validation.
- Tailscale browser test: Hub Settings reported **Endpoint verified**, desired revision 2 and applied revision 2; the HTTPS MagicDNS endpoint opened from the browser.

See [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) for the exact record, commands, commit baselines, skipped checks, and limitations.

### Remaining limits

- LAN and Custom still require an operator-managed trusted TLS reverse proxy. Hub Manager does not issue or renew certificates or configure that proxy.
- Tailscale host membership and tailnet HTTPS certificate eligibility remain prerequisites. The installer does not enroll or reset a host.
- No Windows host deployment adapter exists.
- Failure/rollback has unit-test coverage, but a real-tailnet failure drill has not been performed.
- A successful host-side HTTPS probe does not guarantee every administrator device has valid DNS, tailnet routing, or browser access. Preserve the previous verified recovery link while changing access methods.

The Linux Tailscale installation and access path has passed the recorded acceptance test. This does not constitute production-readiness approval for every access method or the overall product.

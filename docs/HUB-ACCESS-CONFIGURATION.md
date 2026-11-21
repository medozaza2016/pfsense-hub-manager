# Hub access configuration

## User-facing location

The feature belongs in the existing **Administration → Hub Settings** page. Do not add a separate top-level navigation item or redesign the approved workspace.

## Initial and optional access modes

- **Local (default):** the Hub is published only on `127.0.0.1`. This is the supported first-install state.
- **Tailscale (optional):** the administrator enters the Tailscale IPv4 address assigned to the machine hosting Docker. The address is stored as desired configuration. The administrator remains responsible for installing/configuring Tailscale and ensuring the host is reachable over the tailnet.
- **Hostname / reverse proxy (future optional mode):** store the hostname and proxy metadata only after the TLS, trusted-proxy, authentication, and ingress requirements have been designed. Do not treat a hostname entry as automatic DNS, certificate, or proxy provisioning.

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

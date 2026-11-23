# Security Design and Current Controls

## Current security posture
The first firewall integration is intentionally read-only. The manager authenticates using a dedicated pfSense local account and API key. The account is not an administrator and has only the eight GET endpoint privileges documented in INTEGRATION-STATUS.md.

This is a development-stage configuration, not a completed production security review.

## Credential handling
- Never commit API keys, passwords, tokens, private keys, firewall backups, or credential-bearing configuration.
- Never expose firewall credentials to browser-delivered JavaScript or client-side environment variables.
- Keep credentials server-side and inject them through a protected secret mechanism.
- Restrict access to secret files, for example owner-only read permissions where file-based secrets are used.
- Redact authorization headers and secrets from application logs, traces, exceptions, screenshots, and support bundles.
- Rotate or revoke a key if it is exposed or its ownership becomes uncertain.
- Never place real API key material in automated tests or fixtures.

## Least privilege
The pfsense_hub account is a regular local user, not an administrator. Its effective API access is limited to these GET endpoints:
- /api/v2/status/system
- /api/v2/status/gateways
- /api/v2/status/interfaces
- /api/v2/status/services
- /api/v2/system/version
- /api/v2/diagnostics/arp_table
- /api/v2/firewall/states
- /api/v2/firewall/states/size

Do not grant POST, PUT, PATCH, or DELETE privileges for the initial read-only milestone. Do not add broad WebConfigurator privileges merely to make the restricted account's GUI display pages.

## TLS
The current direct-IP endpoint presented a self-signed certificate. This is not acceptable for production. Install or issue a certificate whose identity matches the endpoint hostname, trust the issuing CA, verify hostname and certificate chain validation, and remove insecure TLS flags. Do not treat encryption without peer verification as sufficient server authentication.

## Network exposure
Prefer a private management path or VPN between the manager and each firewall. Do not expose the firewall API directly to the public internet by default. The 172.10.x.x address plan is retained for now at the user's explicit direction.

## Application security requirements
The current branch implements database-backed manager authentication, `admin`/`user` authorization, authenticated manager API routes, administrator-only site and Hub access mutations, strict request validation, bounded firewall API requests, secret redaction, audit events, and per-device connection profiles. Remaining release work includes a full security review, existing-data migration validation, backup/restore and retention drills, key rotation design, and two-real-device isolation testing. Keep the pfSense integration read-only. Any future write capability requires a separate approved design and explicit authorization.

## Encrypted credential storage and key lifecycle
DEC-024 selects per-site credential encryption in PostgreSQL, with AES-256-GCM. The installer generates one high-entropy application key, provides a recovery copy, and places a separate runtime copy in a protected host-side location. The backend loads it automatically. The key must never be stored in PostgreSQL, source control, browser storage, logs, or API responses.

Implementation now in this branch:
- The Windows provisioning script creates a 32-byte key represented as 64 hexadecimal characters.
- Docker Compose mounts the runtime file read-only at /run/secrets/app_encryption_key.
- API startup fails closed if the key file is missing or is not exactly 32 bytes encoded as 64 hexadecimal characters. It never regenerates the key.
- Credential encryption uses Node.js crypto AES-256-GCM, a fresh 12-byte nonce per encryption, a 16-byte authentication tag, and a versioned envelope. Decryption rejects malformed or unauthenticated data.
- Migration 002 adds a per-device credential table containing ciphertext, nonce, authentication tag, algorithm, and key version. Plaintext credentials are not stored.
- Database and encryption-key backups must be protected and restored separately. Losing the key makes encrypted credentials unrecoverable.
- Docker Compose file secrets are mounted as files, not encrypted at rest. Windows host ACLs and container access controls are separate security boundaries and both require validation.
- Linux production application-key provisioning and Host Agent installation are provided by the standard Linux installer. A clean Debian 13 install verified the root-owned configuration, API supplementary group, group-restricted socket, bearer-authenticated handshake, and service health before enabling the deployment feature. A broader container permission/security audit remains outstanding.
- Application-key rotation is not implemented. Database backup/restore with its exact matching key has not passed a recovery drill. Do not replace the runtime key while encrypted credentials or TLS trust material exist.

## Incident response
If a key or password is exposed, revoke or rotate it, update the protected secret store, review logs and repository history, assess other affected systems, and record remediation without copying the secret into the incident record.


## Manager roles and monitoring authorization (DEC-027)

The initial manager-user model for System Monitoring and Recovery has two roles: `admin` and `user`. Both roles may view authenticated monitoring status and bounded, sanitized service logs. Only `admin` may invoke service or stack operations and Compose validation. The frontend keeps those controls visible but disabled for `user`; this is usability behavior only. Fastify must derive the role from the database-backed authenticated session and enforce authorization on every privileged route. Requests without a valid session return 401; authenticated sessions without `admin` return 403. Never trust a role, user ID, or authorization claim supplied in a request body, query string, or browser storage. The initial administrator must remain an administrator; user provisioning and role changes must be admin-only, and the system must prevent demotion or deletion of the last administrator. Docker execution remains unavailable except through the restricted Host Agent's fixed project and service allowlists (DEC-039), and only when `HUB_HOST_OPERATIONS_ENABLED` is enabled on that host; the API never mounts the Docker socket, never accepts a caller-supplied command, project path, container name, or Compose argument, and returns 503 while the flag is off.


### Manager role implementation status, November 22, 2026

The current `main` branch includes manager authentication, database-backed roles and sessions, user administration, audit logging, and administrator enforcement on site and Hub access mutation routes:

- Migration `003_manager_roles_and_sessions.sql` creates the manager account/session tables when absent and adds a constrained `role` column. Existing rows receive the `admin` role by default; no account deletion or password reset is part of the migration.
- Session lookup reads the role from PostgreSQL. Setup and login responses include the role from the database.
- A Fastify pre-handler enforces administrator access on the reserved `/api/v1/system/operations` and `/api/v1/users` API namespaces. It returns 403 for authenticated non-admin users. The existing authentication hook returns 401 when there is no valid session.
- The Windows local API suite reported 177 passed and 4 skipped; API/web typechecks and production builds passed. The clean Debian 13 install executed the migration chain against a new PostgreSQL volume. Migration testing against a preserved existing-data copy remains outstanding.
- The Linux Host Agent is limited to GUI-managed Hub access deployment. It is not a general Docker operations endpoint and does not expose arbitrary container, Compose, or host commands.


## Current security acceptance status, November 22, 2026

The clean Debian 13 installation verified the Linux Host Agent systemd service, root-owned configuration, group-restricted Unix socket, API supplementary group, bearer-authenticated request, and health-gated enablement of GUI-managed Hub access. Hub Settings successfully applied and verified the tested Tailscale MagicDNS endpoint. The web and API containers do not receive the Docker socket.

The current release remains limited to the fixed read-only pfSense GET allowlist. The first Plus firewall's historical diagnostic test used a temporary TLS bypass; a trusted TLS test against that firewall remains required. A second real firewall has not been tested. Backup/restore, retention, key rotation, existing-data migration, full system security review, and Windows host deployment are not complete. See [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) for the exact evidence and remaining gaps.

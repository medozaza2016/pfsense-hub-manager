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
Before application release, implement authenticated administrative access, authorization checks on every manager API operation, input validation, bounded timeouts/retries/response sizes, redaction, audit events, and per-device isolation. Keep the initial pfSense integration read-only. Any future write capability requires a separate approved design and explicit authorization.

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
- Key rotation, Linux production provisioning, credential-management API, and end-to-end container permission tests remain outstanding.

## Incident response
If a key or password is exposed, revoke or rotate it, update the protected secret store, review logs and repository history, assess other affected systems, and record remediation without copying the secret into the incident record.

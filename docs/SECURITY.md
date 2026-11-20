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

The current direct-IP endpoint presented a self-signed certificate. curl rejected it under normal certificate validation. The diagnostic test used -k, which disables certificate verification.

This is not acceptable for production. Before production polling:
1. Install or issue a certificate whose identity matches the endpoint hostname.
2. Ensure the manager trusts the issuing CA.
3. Verify hostname and certificate chain validation from the manager.
4. Remove all insecure TLS flags from application code and operational scripts.

Do not treat encryption without peer verification as sufficient server authentication.

## Network exposure

Prefer a private management path or VPN between the manager and each firewall. Do not expose the firewall API directly to the public internet by default.

The current manager-to-Plus test used the direct address 172.10.50.1 on port 10443. The public hostname timed out from the manager LXC during the captured test, while it responded from the user's XPS-13. The final network architecture remains open.

The 172.10.x.x address plan is retained for now at the user's explicit direction. Do not change it as a prerequisite.

## Application security requirements

Before application release, implement:
- Server-side credential storage and retrieval.
- Authenticated administrative access to the manager.
- Authorization checks on every manager API operation.
- Input validation at all external boundaries.
- Timeouts, bounded retries, and rate controls for firewall polling.
- Redaction of secrets and sensitive firewall payloads.
- Audit events for security-relevant access.
- Per-device isolation so one compromised or unavailable device does not expose or disable all others.
- Tests for authentication failure, authorization denial, timeout, invalid responses, and unsupported capabilities.

If write operations are ever proposed, require a separate product decision, explicit user authorization, granular privileges, audit records, confirmation safeguards, tests, and recovery/rollback planning before implementation.

## Data minimization

Do not persist full firewall state tables or ARP tables by default without an explicit retention and privacy requirement. These may contain internal addresses, device identifiers, and traffic metadata. Define collection purpose, retention, access controls, and redaction before storing such data.

## Incident response

If a key or password is exposed:
1. Revoke or rotate it on the firewall.
2. Update the protected secret store.
3. Review logs and repository history for exposure.
4. Determine whether other credentials or systems were affected.
5. Record the incident and remediation without copying the secret into the incident record.


## OpenAPI and API-operation safety

The upstream OpenAPI JSON includes read and write operations. Its presence does not authorize implementation or invocation. The initial release is read-only. Do not create a generic arbitrary-path proxy to the firewall API. Any future write capability must meet the explicit preview, authorization, backup/recovery, audit, confirmation, and post-apply verification requirements above.

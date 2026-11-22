# Multi-site Onboarding and Connection Management

**Status:** In progress  
**Implementation branch:** `feature/multi-site-onboarding`  
**Last reconciled:** November 21, 2026  
**Scope:** Read-only firewall connectivity and managed-device lifecycle

## 1. Objective

Make each registered pfSense firewall an independently configured managed device. Administrators will register devices through the Hub, store credentials encrypted at rest, test connectivity, and inspect compatibility without editing application environment variables for each additional firewall.

The implementation is deliberately limited to secure, read-only pfSense API access. Firewall configuration changes, arbitrary upstream proxying, and remote command execution are out of scope.

## 2. Current implementation state

The following reflects the code on `feature/multi-site-onboarding`, not the earlier `main` baseline.

### 2.1 Implemented

- PostgreSQL-backed managed-device profiles with UUIDs, display name, location, edition, HTTPS API origin, enabled state, and demo marker.
- Separate `device_credentials` storage using AES-256-GCM encrypted envelopes.
- Device-bound credential encryption using versioned authenticated additional data.
- Device-bound custom TLS trust storage in migration `008_device_tls_trust.sql`, encrypted separately from API credentials.
- Custom CA bundle validation, including size and certificate-count limits, PEM/X.509 validation, and certificate validity checks.
- Repository methods for profile listing and retrieval, create, update, enable/disable, credential rotation, custom CA set/remove, and controlled decryption for backend connections.
- A per-device client factory that selects the device's own HTTPS origin, decrypted API key, and explicit system or custom-CA trust mode.
- Explicit TLS certificate and hostname verification, DNS destination validation and pinned resolution, redirect rejection, bounded response size, request timeout, and classified API errors.
- A fixed allowlist of eight pfSense GET operations. No write operations are exposed by the client.
- Multi-device provider collection, with per-operation poll history and isolated failure handling.
- Device inventory, detail, capabilities, and overview read routes.
- Existing admin authentication, audit infrastructure, and demo-device restrictions remain in place.
- Legacy environment-configured firewall bootstrap persists its profile and encrypted credential without overwriting an existing profile or a credential rotated through the manager.

### 2.2 Current API behavior and limitations

- All `/api/v1/` routes other than the explicitly public version and authentication routes require a valid session.
- Device inventory and detail are available to authenticated users. Device capability and overview routes also require authentication and reject demo devices. Overview rejects disabled devices.
- Administrator-only lifecycle routes have now been added for device creation, non-secret profile updates, enable/disable, credential rotation, custom CA set/remove, and explicit connection testing:
  - `POST /api/v1/devices`
  - `PATCH /api/v1/devices/:deviceId`
  - `PATCH /api/v1/devices/:deviceId/enabled`
  - `PUT /api/v1/devices/:deviceId/credential`
  - `PUT /api/v1/devices/:deviceId/tls-trust`
  - `POST /api/v1/devices/:deviceId/connection-test`
- Route tests have been added for administrator enforcement, credential non-disclosure, profile secret rejection, and successful/failed read-only connection tests. These new tests and the integrated server build are pending execution in the user's local checkout.
- The startup configuration still requires the legacy `PFSENSE_DEVICE_ID`, `PFSENSE_DEVICE_NAME`, `PFSENSE_API_BASE_URL`, and `PFSENSE_API_KEY_FILE` bootstrap settings. The first configured firewall is persisted at startup. Removing that requirement is a separate compatibility change and must preserve existing deployments.
- The capabilities response currently reports the fixed operation list as supported/tested. This is an implementation declaration, not proof that every endpoint has been verified against every pfSense edition or release. Do not interpret it as a live compatibility test.
- Connection state in the device inventory is currently `unknown`; inventory does not imply reachability.
- The frontend onboarding workflow is not yet wired to device lifecycle API routes. The Add Site experience remains to be connected to the backend.
- Migration 008 and the lifecycle have unit-test coverage, but migration execution against the user's actual PostgreSQL database and live firewall connectivity have not yet been confirmed.

## 3. Security invariants

These are non-negotiable throughout the remaining work:

1. Never return plaintext API credentials, private keys, CA contents, or encrypted credential envelopes to the browser.
2. Keep application encryption key material outside PostgreSQL and source control. Fail closed when it is unavailable or invalid.
3. Bind encrypted credentials and TLS trust material to the device identity and their distinct purposes.
4. Enforce HTTPS origins without URL credentials, paths, query strings, or fragments.
5. Preserve strict TLS verification. Custom CA trust must be explicit and device-scoped. Never add an insecure certificate-verification bypass.
6. Preserve DNS destination validation and pinned lookup. Validate every resolved address and do not weaken SSRF protections.
7. Use only the fixed eight-operation GET allowlist. Never accept caller-supplied upstream paths or arbitrary URLs.
8. Enforce administrator authorization server-side for device lifecycle mutations and connection tests.
9. Audit lifecycle actions without recording credentials, CA material, or other secrets.
10. Keep demo devices clearly identified and incapable of obtaining live clients.
11. Keep firewall configuration writes, apply/reboot actions, arbitrary shell execution, and Docker socket access out of scope.

## 4. Remaining implementation sequence

### Phase A: Admin-only device lifecycle API

- [ ] Add strict API request schemas and normalized response DTOs.
- [ ] Add administrator-only routes to create a device, update its non-secret profile, enable/disable it, rotate its credential, and set/remove its custom CA bundle.
- [ ] Keep credential and CA inputs write-only. Never include them in response bodies, logs, or audit metadata.
- [ ] Validate UUIDs, request bodies, HTTPS origins, and CA material. Return consistent validation and not-found errors.
- [ ] Audit successful and rejected lifecycle actions with safe metadata.
- [ ] Add route-level tests for authentication, authorization, demo-device protection, duplicate/invalid input, and secret redaction.

### Phase B: Explicit connection test

- [ ] Add an administrator-only connection-test endpoint using the selected device's own client factory.
- [ ] Use only the fixed read-only operation allowlist. A minimal identity/version request may establish basic connectivity; do not claim full compatibility from a single successful request.
- [ ] Return a normalized result with a classified outcome and timestamp. Do not expose raw upstream responses, credentials, internal exception details, or arbitrary headers.
- [ ] Distinguish reachable/authenticated, DNS/network failure, timeout, TLS failure, authentication failure, authorization failure, unsupported endpoint, rate limiting, remote server failure, and invalid response where the client can reliably identify them.
- [ ] Ensure disabled and demo devices cannot be tested.
- [ ] Audit test outcomes without recording secret material.

### Phase C: Frontend integration

- [ ] Replace the preview-only Add Site action with the API-backed registration workflow.
- [ ] Collect name, optional location, edition, HTTPS API origin, API credential, and optional custom CA trust material.
- [ ] Keep secret inputs write-only and clear them after submission.
- [ ] Add separate Test Connection behavior and display the classified outcome and timestamp.
- [ ] Add edit, enable/disable, and credential rotation controls for administrators.
- [ ] Distinguish configured, enabled, reachable, and compatible states. Do not treat these as interchangeable.
- [ ] Clearly label demo devices and prevent demo actions from being presented as live firewall operations.
- [ ] Preserve the existing visual system and responsive behavior while adding loading, validation, permission, TLS, timeout, and partial-failure states.

### Phase D: Deployment and operational verification

- [ ] Apply migration 008 in a controlled development database and verify the resulting schema.
- [ ] Verify encrypted credential and custom CA persistence, decryption, wrong-key failure, and tamper rejection.
- [ ] Verify the legacy bootstrap path preserves an existing manager-rotated credential and profile.
- [ ] Verify independent device behavior with two test devices when the user is ready to connect the second firewall.
- [ ] Verify Docker Compose configuration, production build, and Linux deployment.
- [ ] Document encryption-key backup/recovery requirements before production rollout. Never rotate or replace the key without a separately tested data migration plan.

## 5. Deferred decisions and scope

- Transport choice and network path for the second pfSense CE firewall. The user has explicitly deferred this decision.
- Connecting the second firewall until the user is ready.
- Background polling scheduler, retries/backoff, and concurrency controls.
- Continuous alert generation and notification delivery beyond the existing request-triggered polling behavior.
- Replacing all preview pages with live data.
- Firewall configuration changes, apply/reboot, and any non-GET operation.
- Device deletion and destructive history-retention behavior.
- Production backup/restore and disaster-recovery completion.

## 6. Acceptance criteria

The onboarding milestone is complete only when:

1. An administrator can register multiple real-device profiles through the GUI without adding environment variables for each additional firewall.
2. Each device uses its own encrypted credential, HTTPS origin, and TLS trust configuration.
3. No secret material is returned to the browser or recorded in logs/audit metadata.
4. Lifecycle mutations and connection tests are administrator-only and covered by automated tests.
5. Connection tests return accurate, classified outcomes without exposing raw upstream errors.
6. One device's failure does not prevent another device's inventory or test.
7. Disabled and demo devices cannot obtain live clients or be tested.
8. TLS verification, DNS validation, pinned lookup, and the fixed GET allowlist remain enforced.
9. The legacy first-firewall bootstrap remains compatible until an intentional migration away from it is implemented.
10. Migration execution, API tests, typecheck, production build, Compose validation, and browser acceptance are verified and recorded.
11. The second firewall can be added when the user chooses the transport and is ready to connect it.
12. No firewall configuration-changing operation is introduced.

## 7. Branch and delivery workflow

Continue on `feature/multi-site-onboarding`. Do not switch to, commit to, or merge into `main` without explicit user approval. Keep changes incremental, inspect the current code before editing, run the relevant tests, and report exact verification results. A pull request or merge requires separate user approval.

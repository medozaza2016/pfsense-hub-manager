# Multi-site Onboarding and Connection Management

**Status:** Planned milestone, documentation baseline only  
**Baseline:** `main`, November 21, 2026  
**Implementation branch:** Not created  
**Scope:** Read-only firewall connectivity and managed-device lifecycle

## 1. Objective

Make each registered pfSense firewall an independently configured managed device. An administrator must be able to register a firewall through the GUI, store its API credential securely, test its connection, and view its compatibility and connection state without editing application environment variables.

The current application is not yet a true multi-firewall manager. The inventory API can return multiple database records, but the active provider's capabilities and overview collection are still tied to the single environment-configured device ID. This milestone closes that gap.

## 2. Current verified starting point

The current `main` implementation includes:

- React, TypeScript, and Vite frontend.
- Fastify and TypeScript manager API.
- PostgreSQL with a `managed_devices` table and poll-run persistence.
- A `device_credentials` table with fields for AES-256-GCM envelope metadata.
- An AES-256-GCM credential encryption/decryption helper.
- Application encryption-key file loading and validation.
- A fixed pfSense API client allowlist containing eight GET operations.
- Device inventory, detail, capability, and overview API routes.
- API-backed user management, audit logs, and persisted alerts.
- Development-only demo devices marked with `is_demo`.

These are foundations, not a completed multi-device lifecycle. Credential encryption is not yet integrated into registration and provider selection. Capability and overview routes currently accept only the environment-configured device ID.

## 3. Functional scope

### 3.1 Managed-device profile

A real managed-device record should include:

- Application-generated UUID.
- Display name.
- Optional location label.
- Edition: `plus`, `ce`, or `unknown`.
- HTTPS API origin and port.
- Enabled/disabled state.
- Connection state: `unknown`, `reachable`, or `unreachable`.
- Last connection-test time and last successful contact.
- Detected firewall release, API package version, and architecture when available.
- Capability/compatibility status with an explanation.
- Credential reference and key version, never plaintext credential material.

Do not use a firewall serial number, Netgate account ID, or API key as the application's device identifier.

### 3.2 Administrator workflows

The Hub Sites area should support:

1. Add a site with name, location, edition, HTTPS API origin, and API credential.
2. Validate inputs before submission.
3. Save the profile and encrypted credential through the manager API.
4. Test the connection explicitly.
5. Show the classified connection result and timestamp.
6. Edit non-secret profile fields.
7. Rotate a credential by submitting a new value. Existing credentials must never be returned to the browser.
8. Enable or disable a device without deleting its history.
9. Show compatibility and capability status independently from basic network reachability.

Deletion, credential recovery, and destructive history retention behavior require separate review before they are added.

### 3.3 Connection test

A connection test must use the selected device's own URL, credential, TLS trust configuration, and provider instance. It must use only approved read-only operations.

The result must distinguish at least:

- Reachable and authenticated.
- DNS or network failure.
- Connection timeout.
- TLS certificate or hostname validation failure.
- Authentication failure.
- Authorization failure.
- Unsupported endpoint or API package.
- Rate limit or remote server error.
- Invalid response or schema mismatch.
- Disabled device or invalid configuration.

A saved profile is not proof of reachability. A successful test is not proof that all API operations or write capabilities are supported.

## 4. Backend implementation sequence

### Phase A, schema and service boundary

- [ ] Review the current migrations and device/provider types before changing schema.
- [ ] Define validated create/update input schemas and response DTOs.
- [ ] Define explicit service methods for register, update, enable/disable, rotate credential, get profile, and test connection.
- [ ] Add migration changes only where existing columns cannot represent the required state. Preserve existing device IDs, poll history, audit records, and credentials.
- [ ] Add repository/service tests for validation, authorization, duplicate handling, demo-device restrictions, and transaction behavior.

### Phase B, credential lifecycle

- [ ] Integrate the existing AES-256-GCM helper into credential registration and rotation.
- [ ] Persist only nonce, authentication tag, ciphertext, algorithm, format version, and key version.
- [ ] Bind ciphertext to the intended device and purpose using authenticated additional data, with a reviewed versioning/migration strategy.
- [ ] Decrypt only inside the backend connection boundary, only when a request requires it.
- [ ] Avoid returning credential metadata that exposes secrets or encryption internals unnecessarily.
- [ ] Ensure decryption/key failures fail closed and produce sanitized operational errors.
- [ ] Test wrong key, tampered ciphertext, malformed envelope, and missing key behavior.
- [ ] Define key provisioning, permissions, recovery, and rotation requirements consistently with DEC-024.

### Phase C, per-device provider

- [ ] Replace the single environment-configured provider assumption with a provider factory or equivalent per-device adapter boundary.
- [ ] Resolve device metadata and its encrypted credential server-side.
- [ ] Construct a client for the selected device using an HTTPS origin and verified TLS.
- [ ] Support private CA trust only through protected server-side configuration. Never disable certificate verification.
- [ ] Keep the eight existing GET operations as an explicit allowlist.
- [ ] Preserve per-operation timeouts, classified failures, response limits, and runtime validation.
- [ ] Ensure one device's failure cannot prevent requests to another device.
- [ ] Keep environment-based configuration available only as a documented bootstrap/migration path until the existing first firewall has been safely represented in the database.

### Phase D, manager API

The following are proposed manager-facing API capabilities. Final route names and contracts must be checked against the existing API specification and code before implementation.

- [ ] List and retrieve managed-device profiles with secrets omitted.
- [ ] Create a managed-device profile and encrypted credential, administrator only.
- [ ] Update non-secret profile fields, administrator only.
- [ ] Enable or disable a device, administrator only.
- [ ] Rotate a device credential, administrator only.
- [ ] Test a device connection using the selected device's own provider, administrator only unless a later read-only permission is explicitly approved.
- [ ] Return normalized connection and compatibility status, never raw credentials.
- [ ] Audit profile creation, edits, enable/disable, credential rotation, and connection-test outcomes without recording secret material.
- [ ] Return consistent validation and classified operational errors.

Do not implement a generic arbitrary pfSense proxy or accept caller-supplied upstream endpoint paths.

## 5. Frontend implementation sequence

- [ ] Replace the current preview-only Add Site action with a real API-backed form.
- [ ] Validate required name, edition, HTTPS origin, and credential fields.
- [ ] Keep credential fields write-only. Clear secret input state after submission and never prefill it from the server.
- [ ] Add a separate Test Connection action and display the returned classified result and timestamp.
- [ ] Show profile state separately from reachability and compatibility.
- [ ] Add edit, enable/disable, and credential rotation controls for administrators.
- [ ] Keep regular-user controls hidden or disabled according to the final authorization contract, while relying on backend authorization as the actual security boundary.
- [ ] Keep seeded demo sites clearly labeled and non-actionable as live devices.
- [ ] Ensure loading, validation, empty, permission, timeout, TLS, authentication, and partial-failure states are accessible and responsive.

## 6. Security requirements

- No plaintext credentials in PostgreSQL, source control, browser storage, URLs, logs, audit metadata, or API responses.
- Encryption key remains outside PostgreSQL and outside the repository. The backend must fail closed if the key is unavailable or invalid.
- Enforce HTTPS origins, reject URL credentials, paths, query strings, fragments, and non-HTTPS protocols.
- Verify TLS certificates and hostnames. Do not introduce an insecure bypass.
- Enforce administrator authorization server-side for profile and credential mutations.
- Use fixed upstream operation allowlists and bounded request/response sizes and timeouts.
- Never mount the Docker socket into web or API containers.
- Never add arbitrary shell execution or arbitrary host operations.
- Keep all firewall configuration-changing operations disabled.
- Audit administrative lifecycle actions with sanitized metadata.

## 7. Explicitly deferred

- Selection of the firewall-to-hub transport method.
- Connecting the second pfSense CE firewall until the user is ready.
- Background polling scheduler, retry/backoff, and concurrency controls.
- Continuous alert generation and notification delivery.
- Replacing all firewall preview pages with live data.
- Any firewall configuration write, apply, reboot, or arbitrary upstream API operation.
- Production backup/restore, retention, and disaster-recovery completion.

## 8. Acceptance criteria

The milestone is complete only when all of the following are demonstrated:

1. An administrator registers at least two real-device profiles without changing environment variables.
2. Each device uses its own credential and HTTPS origin.
3. Credentials are encrypted at rest and never returned to the browser.
4. Connection tests report accurate, classified results.
5. A failure on one device does not affect the other device's inventory or connection test.
6. Disabled devices are not polled or tested unless explicitly re-enabled.
7. Demo devices cannot be treated as real devices.
8. Authorization and audit behavior are covered by automated tests.
9. TLS verification remains enabled, including private CA trust tests.
10. Existing first-firewall integration behavior is preserved or migrated safely.
11. API tests, typechecks, production builds, migration tests, Compose validation, and browser acceptance pass.
12. Documentation records the exact verification results and all remaining limitations.

## 9. Branch and delivery workflow

This document is being established on `main` before implementation begins. Once the documentation baseline is reviewed and the user authorizes development, create a dedicated feature branch from the then-current `main`. Implement and verify the milestone on that branch, review the diff, and merge through a pull request only after the user approves the merge.

Do not create, switch, or delete branches as part of this documentation-only step.

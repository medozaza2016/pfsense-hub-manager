# Phase 1: User Management, Audit Logs, and Alerts

**Status:** Approved scope, implementation not started  
**Planning date:** November 21, 2026

## Objective

Deliver User Management, Audit Logs, and Alerts together as one coherent Hub administration phase. Identity and permissions determine who may act, audit records establish what happened, and alerts surface events that warrant attention.

## Existing authentication and roles

The working branch already contains first-run administrator setup, password hashing, login/logout, database-backed sessions, and two roles: `admin` and `user`. Preserve this implementation. Do not create a second authentication system or redefine roles.

The current authentication code does not, by itself, establish that user administration is complete. Inspect and reuse its `admin_users` and `admin_sessions` schema, session lifecycle, and existing authorization hooks. Server-side authorization is mandatory.

## Scope A: User Management

- List persisted users with username, role, status, and timestamps.
- Search and filter users.
- Create users and assign only the existing supported roles (`admin`, `user`).
- Edit permitted attributes and role assignments.
- Activate/deactivate accounts with safeguards.
- Prevent disabling or demoting the last active administrator.
- Never display, retrieve, or log password hashes, salts, or plaintext passwords.
- Revoke affected sessions when an account is disabled or its security-sensitive access changes.
- Audit each administrative action, including failed attempts where relevant.
- Enforce authorization in the API, not only in the UI.

## Scope B: Audit Logs

Audit is a cross-cutting service and durable record, not just a page. Initial coverage:

- Authentication success/failure, logout, session expiration, and access denied.
- User creation, edits, role changes, activation/deactivation, and password reset/invitation events.
- Administrative configuration changes.
- Site registration, connection profile/credential changes, and site removal when implemented.
- Security-sensitive actions and relevant system jobs/integration failures.

Each event should capture UTC timestamp, actor identity/type, event/action, outcome, target resource, safe summary, request/correlation ID, and sanitized metadata where available.

Audit events must be append-only through application interfaces. Do not expose update/delete endpoints. Never record passwords, hashes, salts, API keys, tokens, cookies, private keys, or sensitive request bodies. Restrict access and audit exports. Define retention and backup behavior before production.

## Scope C: Alerts

Alerts are a filtered attention layer, not a copy of every audit event.

- Severity: Critical, Warning, Info.
- Persist stable alert ID, severity, title/message, source, affected resource, first/last seen, occurrence count, and status.
- Display active and resolved alerts separately.
- Support acknowledge and resolve, recording actor and timestamps.
- Deduplicate repeated occurrences to avoid notification floods.
- Filter by severity, status, source, and date.
- Preserve alert history after resolution.
- Keep notification delivery separate and retry-safe. Delivery failure must not erase an alert or audit event.
- Audit acknowledge, resolve, mute, and notification-setting changes.

## Event flow

1. Authenticate and authorize a user-initiated action.
2. Execute the operation.
3. Persist an audit event with actor, target, action, outcome, and safe metadata.
4. Apply alert rules only to qualifying events/conditions.
5. Create or update a deduplicated alert.
6. Dispatch optional notifications independently through a durable outbox or equivalent retry-safe mechanism.

Audit and alert writes should be transactional when they belong to the same database operation. External notification delivery must not run as an unreliable in-memory-only task.

## Delivery sequence

1. Baseline existing authentication, database migrations, role checks, and tests. Preserve behavior.
2. Define audit and alert schemas, indexes, retention, and safe metadata rules.
3. Implement a centralized audit service and cover authentication and administrative events.
4. Implement user-management API workflows and last-admin/session safeguards.
5. Implement alert rules, deduplication, lifecycle, and notification boundary.
6. Replace User Management, Audit Logs, and Alerts demo fixtures with real API data. Add loading, empty, error, and permission-denied states.
7. Validate migrations, authorization, audit coverage/immutability, alert lifecycle, and browser behavior.

## Acceptance criteria

- Existing login, first-run setup, and `admin`/`user` roles continue to work.
- An administrator can manage users through the GUI using persisted data.
- Non-admin users cannot call administrative endpoints directly.
- Last active administrator cannot be disabled or demoted.
- Sensitive user changes revoke sessions as appropriate.
- Consequential actions produce durable audit events with actor, action, target, outcome, and timestamp.
- Secrets and password material never appear in audit records or alert messages.
- Audit records cannot be modified/deleted through application APIs.
- Qualifying events produce correctly classified, deduplicated alerts.
- Alerts can be filtered, acknowledged, and resolved with history preserved.
- Notification failures do not lose alerts or audit events.
- No UI reports success before the server confirms it.
- No production-facing demo records remain in these three screens.

## Explicit non-goals

- No pfSense firewall configuration changes or firewall-side user management.
- No replacement of the existing authentication implementation.
- No custom role builder, SSO provider, or MFA redesign in this phase.
- No notification channel is claimed as operational until configured and tested.
- No unrelated Hub or Site workspace pages are included.

## Implementation facts to verify

The branch contains authentication routes and an `AdminUser` type with roles `admin` and `user`. The existing server applies authentication to protected API routes and administrator-only checks to selected namespaces. Verify exact migration names/schema and authorization coverage before adding migrations or routes. Do not infer that a full user-management API already exists.

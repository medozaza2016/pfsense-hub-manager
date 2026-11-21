# Phase 1: User Management, Audit Logs, and Alerts

**Status:** Implemented on feature branch, automated and local verification pending  
**Planning date:** November 21, 2026  
**Target:** Deliver User Management, Audit Logs, and Alerts together as one coherent phase.

## Objective

Complete the Hub administration and accountability foundation before moving to the next Hub workspace area. User Management, Audit Logs, and Alerts are one integrated phase because identity and permissions determine who can act, audit records establish what happened, and alerts surface events that require attention.

## Existing identity and role model

- Reuse the existing authentication, login flow, user records, and role model already established in the project.
- The current signed-in administrator is the starting administrative context.
- Do not create a second authentication system, duplicate users, or silently redefine roles.
- First implementation task is to inspect and document the existing role names, permission checks, session handling, and user persistence. Preserve established behavior.
- Administrative UI and API operations must enforce authorization on the server. Hiding a button in the browser is not authorization.
- Any role or permission change must itself be audited.

## Scope A: User Management

Deliver a working administrative user-management screen using persisted application data, not demonstration fixtures.

Required capabilities:
- List users with identity, assigned role, account status, and relevant timestamps.
- Search and filter users.
- Create a user and assign only an existing supported role.
- Edit permitted user attributes and role assignments.
- Enable, disable, and reactivate accounts with safeguards.
- Support the existing password or invitation/reset workflow. Never display or retrieve stored passwords.
- Prevent accidental lockout of the last active administrator.
- Enforce role-based access in API handlers and UI.
- Record the acting administrator, target account, change, outcome, and timestamp for each administrative operation.

Out of scope unless already supported by the existing identity implementation: new SSO provider, MFA redesign, custom role builder, external directory synchronization, and password storage redesign.

## Scope B: Audit Logs

Audit logging is a cross-cutting requirement, not merely a page. Every consequential application action must generate a durable audit event, including successful and failed attempts where applicable.

Initial event coverage:
- Authentication success and failure, logout, session expiration, and access denied.
- User creation, edits, role changes, activation, deactivation, and password/invitation reset initiation.
- Administrative configuration changes.
- Site registration, connection profile/credential changes, and site removal.
- Security-sensitive actions and operational actions that change Hub-managed state.
- Relevant system jobs and integration failures, with the system recorded as the actor.

Each record should capture, where available:
- UTC timestamp.
- Actor identity and actor type (user or system).
- Action/event type and outcome.
- Target resource type and identifier.
- A concise human-readable summary.
- Request/correlation ID and source context where safe.
- Sanitized structured metadata sufficient for investigation.

Security and integrity requirements:
- Audit records are append-only through application behavior. No ordinary UI/API edit or delete operation.
- Never record passwords, API keys, access tokens, session cookies, private keys, or other secrets.
- Do not store full credential payloads or sensitive request bodies in metadata.
- Restrict audit-log access by the existing authorization model.
- Support filtering by date range, actor, event, resource, and outcome.
- Make records exportable only through an authorized, audited action.
- Define retention and backup behavior before production release.

## Scope C: Alerts and notifications

Alerts are the operational and security attention layer. They should be generated from qualifying audit events and system conditions, then displayed in the Hub Alerts area.

Initial severity levels:
- **Critical:** immediate security or service-impacting condition requiring urgent action.
- **Warning:** degraded state, repeated failure, or condition needing investigation.
- **Info:** meaningful event or state change that does not currently require intervention.

Initial alert behavior:
- Each alert has a stable event/alert identifier, severity, title, message, source, affected user/site/resource when relevant, first-seen time, and current status.
- Show active and resolved alerts separately.
- Support acknowledge and resolve actions with actor and timestamps.
- Preserve alert history after resolution.
- Deduplicate repeated occurrences where appropriate, update occurrence count and last-seen time, and avoid flooding the feed.
- Provide filtering by severity, status, source, and date.
- Make notification delivery a separate, configurable channel. A notification failure must not erase the alert or audit event.
- Any acknowledge, resolve, mute, or notification-setting change must itself be audited.

Not every audit event should create a user-facing alert. Every consequential action must be audited; only events meeting alert rules should create alerts. This separation prevents routine activity from overwhelming administrators while retaining a complete audit trail.

## Integration contract

The three areas must share a consistent event model:

1. An action or system condition occurs.
2. Authorization is checked where the action is user initiated.
3. The application writes the audit event with a clear outcome.
4. If the event matches an alert rule, an alert is created or an existing alert is updated.
5. The Alerts page displays the alert and its lifecycle.
6. Any notification is dispatched independently and its delivery result is recorded without exposing secrets.

Audit and alert persistence must be transactional where they are part of the same database operation. Where external notification delivery is involved, use a durable queued/outbox pattern or equivalent retry-safe mechanism rather than relying on an in-memory task.

## Delivery sequence

1. **Inspect and preserve identity:** trace the existing login, user model, roles, permission middleware, database schema, and tests. Record what already exists and avoid rebuilding it.
2. **Define persistence and event contracts:** migrations, audit event schema, alert schema, indexes, retention, and safe metadata rules.
3. **Implement audit foundation:** central server-side audit service and coverage for authentication and administrative actions.
4. **Implement user management:** API authorization and persisted CRUD/status workflows using the existing role model.
5. **Implement alert engine:** severity rules, deduplication, lifecycle, and notification boundary.
6. **Connect redesigned screens:** replace all user, audit, and alert fixtures with real API/database data; provide loading, empty, error, and permission-denied states.
7. **Validate:** automated tests, role/authorization tests, audit coverage tests, alert lifecycle tests, migration tests, and local Windows/Docker browser verification.

## Acceptance criteria

- The existing administrator can manage users through the redesigned User Management screen, subject to the established role rules.
- Existing roles and login behavior remain intact.
- Unauthorized users cannot invoke administrative endpoints even if they bypass the UI.
- Every consequential action in the defined coverage produces a durable audit record with actor, action, target, outcome, and timestamp.
- Secrets and credentials are absent from audit records and application-facing alert messages.
- Qualifying events produce correctly classified alerts, and routine events do not create unnecessary alerts.
- Alerts can be filtered, acknowledged, resolved, and retained with their history.
- Alert delivery failures do not lose audit records or alerts.
- Tests prove last-admin protection, access control, audit immutability through application interfaces, and alert deduplication/lifecycle.
- No screen reports success for an operation until the server confirms it.
- The three screens contain no production-facing demo records.

## Explicit non-goals

- No changes to pfSense firewall configuration or firewall-side users.
- No replacement of the existing authentication/role model without a separately approved decision.
- No claim that email, SMS, or push notifications are delivered until a provider and delivery path are configured and tested.
- No implementation of unrelated Hub or Site workspace pages in this phase.

## Open implementation decisions

These are to be resolved by inspecting the existing code before building, not guessed:
- Exact existing role names and permission matrix.
- Existing user/session persistence and password reset mechanism.
- Existing database migration and transaction conventions.
- Initial alert rules and which notification channels are actually configured.
- Audit and alert retention period, export format, and any compliance requirements.


## Implementation record, November 21, 2026

Delivered on the feature branch:
- Account activation state, append-only audit event storage, and persisted alert lifecycle migration.
- Central audit service with recursive secret-key redaction and bounded metadata.
- Administrator-only user listing/search, creation, role changes, activation/deactivation, and password reset API.
- Last-active-administrator protection and session revocation after role, activation, or password changes.
- Disabled accounts are rejected during login and session lookup.
- Audit retrieval and event coverage for setup/login/logout, failed authentication, access denials, user changes, Hub reachability settings, alert lifecycle, and automatic polling recovery.
- Deduplicated Critical/Warning alerts for firewall polling failures, automatically resolved after a fully successful polling cycle.
- User Management, Audit Logs, and Alerts screens now use API-backed data and include loading, empty, error, and action states.
- Service-level tests cover audit metadata sanitization and alert deduplication.

## Verification and remaining release gates

- GitHub Actions typecheck, test, production build, Compose validation, and container build must pass on the final pull request head.
- Verify administrator and regular-user access in the Windows Docker environment.
- Validate migration 004 against a copy of the current PostgreSQL database, including existing migration history.
- Verify last-active-admin protection and append-only enforcement against PostgreSQL.
- Define audit/alert retention, backup, restore, and any notification delivery policy before production release.

## Known limitations

- Alert generation is tied to the existing device overview polling request. There is no background scheduler.
- Notification delivery, audit export, configurable retention, and alert mute controls are not implemented.
- The wider dashboard still contains demonstration data outside these three administration screens.
- No pfSense configuration-changing operation is introduced.

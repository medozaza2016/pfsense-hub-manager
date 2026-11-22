# Phase 1: User Management, Audit Logs, and Alerts

**Status:** Implemented on feature branch; Windows API verification and clean Linux installation completed November 22, 2026; broader authorization/retention acceptance remains open  
**Planning date:** November 21, 2026  
**Target:** Deliver User Management, Audit Logs, and Alerts together as one coherent phase.

## Objective

Complete the Hub administration and accountability foundation before moving to the next Hub workspace area. User Management, Audit Logs, and Alerts are one integrated phase because identity and permissions determine who can act, audit records establish what happened, and alerts surface events that require attention.

## Existing identity and role model

- Reuse the existing authentication, login flow, user records, and role model already established in the project.
- The current signed-in administrator is the starting administrative context.
- Do not create a second authentication system, duplicate users, or silently redefine roles.
- Administrative UI and API operations must enforce authorization on the server.
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

## Scope B: Audit Logs

Audit logging is a cross-cutting requirement. Initial event coverage includes authentication, user administration, configuration changes, site lifecycle, security-sensitive operations, and relevant system jobs.

Each record should capture, where available:
- UTC timestamp, actor identity and actor type.
- Action/event type and outcome.
- Target resource type and identifier.
- Concise summary, request/correlation ID, and sanitized metadata.

Audit records are append-only through application behavior. Never record passwords, API keys, access tokens, session cookies, private keys, or sensitive request bodies. Restrict access by the existing authorization model. Define retention, export, backup, and restore behavior before production release.

## Scope C: Alerts and notifications

Alerts are the operational and security attention layer. Initial severity levels are Critical, Warning, and Info. Alerts retain a stable identifier, title, message, source, affected resource, first/last-seen timestamps, occurrence count, and status.

The lifecycle supports Active, Acknowledged, and Resolved states with actor and timestamps. Repeated occurrences are deduplicated where appropriate. Notification delivery remains separate and is not claimed unless a provider and delivery path are configured and tested.

## Integration contract

1. An action or system condition occurs.
2. Authorization is checked where the action is user initiated.
3. The application writes the audit event with a clear outcome.
4. Qualifying conditions create or update alerts.
5. The Alerts page displays the alert lifecycle.
6. Notification delivery is independent of audit and alert persistence.

## Delivery sequence

1. Inspect and preserve identity, roles, and session handling.
2. Define persistence and event contracts.
3. Implement append-only audit persistence.
4. Implement user management with server-side authorization.
5. Implement alert severity, deduplication, and lifecycle.
6. Connect the three screens to API-backed data with loading, empty, error, and permission-denied states.
7. Validate automated tests, authorization, migrations, and local Windows/Docker browser behavior.

## Acceptance criteria

- Existing administrator account and credentials remain unchanged.
- Existing roles and login behavior remain intact.
- Unauthorized users cannot invoke administrative endpoints.
- Audit records contain actor, action, target, outcome, and timestamp without secrets.
- Alerts support filtering, acknowledgment, resolution, and history.
- No screen reports success before the server confirms it.
- No production-facing screen uses demo records.

## Implementation record, November 21, 2026

Delivered on the feature branch:
- Account activation state, append-only audit event storage, and persisted alert lifecycle migration.
- Central audit service with recursive secret-key redaction and bounded metadata.
- Administrator-only user listing/search, creation, role changes, activation/deactivation, and password reset API.
- Last-active-administrator protection and session revocation after role, activation, or password changes.
- Disabled accounts are rejected during login and session lookup.
- Audit retrieval and event coverage for setup/login/logout, failed authentication, access denials, user changes, Hub reachability settings, alert lifecycle, and automatic polling recovery.
- Deduplicated Critical/Warning alerts for firewall polling failures, automatically resolved after a fully successful polling cycle.
- User Management, Audit Logs, and Alerts screens use API-backed data and include loading, empty, error, and action states.
- Added a development-only, transactional, idempotent seed command for nine standard users, 50 alerts, and 100 synthetic audit events.
- Seeded users receive random unknown passwords, the existing administrator account is not changed, and synthetic audit events are labeled in metadata.
- Seeded user accounts are all role `user`; seven are active and two are disabled to exercise account-state handling.

## Running the development seed

The seed is guarded by `NODE_ENV=development`. It applies pending migrations, requires an existing active administrator, and uses a transaction plus a seed ledger to prevent duplicate runs.

For a local Windows development environment, build the API first, set `NODE_ENV=development` and a development-only `DATABASE_URL`, then run:

```powershell
npm run build --workspace @pfsense-hub/api
$env:NODE_ENV = "development"
npm run db:seed:dev
```

For the Docker Compose API container, explicitly override its production environment only for this one command:

```powershell
docker compose exec -e NODE_ENV=development api npm run db:seed:dev
```

Do not run this command against a production database. Running it a second time reports that the dataset was already applied and makes no changes. Seeded user accounts have randomly generated, unknown passwords; assign a password through the User Management workflow before attempting to sign in as one.

## Verification and remaining release gates

- Windows local verification: 177 API tests passed, 4 platform-specific tests skipped; API/web typechecks and API/web production builds passed.
- Verify administrator and regular-user access in the Windows Docker environment.
- Validate migrations against a copy of the current PostgreSQL database.
- Verify last-active-admin protection and append-only enforcement against PostgreSQL.
- Run the seed once and rerun it to confirm that the second invocation skips without creating duplicates.
- Define audit/alert retention, backup, restore, and notification delivery policy before production release.

## Known limitations

- Alert generation is tied to the existing device overview polling request. There is no background scheduler.
- Notification delivery, audit export, configurable retention, and alert mute controls are not implemented.
- The wider dashboard still contains demonstration data outside these three administration screens.
- No pfSense configuration-changing operation is introduced.


## Closeout update, November 21, 2026

The development seed and responsive administration UI are now part of the active feature branch. The shared `DataTable` and `ListToolbar` components provide search, expandable filters, pagination, and mobile cards. A global `ToastProvider` supplies consistent operation feedback. User Management, Audit Logs, and Alerts render API-backed data and retain loading, empty, error, and action states.

The development-only seed command is exposed as `npm run db:seed:dev`. It must only be run against a disposable/local development database. Its guard, transaction, and seed ledger make it safe to rerun without duplicating the seeded dataset. Seeded accounts have unknown random passwords, so use the application administrator workflow to set credentials before testing those accounts.

The recent local UI issue was traced to a stale Docker web image. Rebuilding the web service resolved the discrepancy; no source rollback or branch repair was required. Remaining verification gates in this document still apply, particularly role behavior, migration validation, seed rerun behavior, and production-build checks on the final merge candidate.

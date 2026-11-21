# Phase 1: User Management, Audit Logs, and Alerts

**Status:** Implemented on feature branch, automated and local verification pending
**Planning date:** November 21, 2026

## Delivered implementation

- Added account activation state without replacing the existing session authentication or role model.
- Added append-only audit event storage, database mutation protection, safe metadata sanitization, and a centralized audit service.
- Added user list/search/create/update APIs, existing `admin` and `user` roles, password reset through administrator update, account activation/deactivation, last-active-admin safeguards, and session revocation for access/password changes.
- Disabled accounts are rejected during session lookup and login.
- Added audit log retrieval and recorded login success/failure, setup, protected-route denials, user changes, Hub reachability preference changes, and alert lifecycle events.
- Added persisted alert retrieval, acknowledgement, resolution, deduplication, and automatic critical/warning alert creation when firewall polling fails. Fully successful polling automatically resolves the corresponding open alert.
- Replaced the User Management, Audit Logs, and Alerts demonstration rows with API-backed UI, including loading, empty, error, and action states.
- Added unit tests for audit metadata redaction and alert deduplication.

## Verification still required

- API test suite, TypeScript typecheck, frontend production build, Docker Compose validation/build, and GitHub Actions result.
- Browser verification with an administrator and a regular user.
- Migration execution against a copy of the current PostgreSQL database, including upgrade from the already-applied migration history.
- Confirm append-only behavior and last-active-admin protection against a real PostgreSQL instance.
- Define retention, backup, restore, and any notification delivery policy before production release.

## Known boundaries

- Alerts are produced from the existing device overview polling request. There is no background scheduler yet.
- Notification delivery is not implemented.
- Audit export, configurable retention, and alert mute controls are not implemented.
- The wider dashboard still contains demonstration data outside these three administration screens.
- No pfSense configuration-changing operation is introduced.

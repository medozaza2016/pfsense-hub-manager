# Runtime settings in Hub Settings — decision proposal

**Status:** **Approved and implemented as [DEC-044](DECISIONS.md), November 23, 2026.** The four parameters in section 2 are editable at **Administration → Hub Settings → Polling cadence**; the as-built contracts are recorded in section 8. Everything listed in section 3 remains environment-only or out of scope.

**Related records:** DEC-043 (opt-in background polling), DEC-041 (retired the Hub-wide Application Settings page), DEC-031 (managed-site lifecycle owns per-site enablement), DEC-036 (local install mode pins `HUB_ACCESS_DEPLOYMENT_ENABLED=false`), FR-13 (GUI-managed Hub access settings).

## 1. Question

Which values currently supplied through `.env` should become editable in the existing **Administration → Hub Settings** page, and which must stay environment-only?

The motivation is narrow and practical: the background polling scheduler added by DEC-043 is now running in the local deployment, and four of its parameters are integers with no security meaning whose correct values differ per installation. Today changing one requires editing a file on the host and recreating the API container, which restarts the scheduler and the process. That is the only reason to propose a write surface. It is not a request for a general preferences page.

## 2. Proposed scope: four polling parameters

| Setting | Former environment variable | Bounds (now enforced in `hub-settings.ts` and again in `PollScheduler`) |
| --- | --- | --- |
| Poll interval | `PFSENSE_POLLING_INTERVAL_MS` | 15 000–3 600 000 ms, install value 60 000 |
| Concurrency | `PFSENSE_POLLING_CONCURRENCY` | 1–8 devices, install value 2 |
| Jitter | `PFSENSE_POLLING_JITTER_MS` | 0–60 000 ms, must be shorter than the interval, install value 15 000 |
| Retention | `PFSENSE_POLLING_RETENTION_DAYS` | 1–365 days, install value 30 |

The second column is historical: those four variables were removed when the decision was implemented (section 4).

Rationale for exactly these four: all are integers, all are already validated in one place with cross-field rules (`jitter < interval`), none grants a capability, none is a secret, and none is deployment wiring. The bounds must be reused verbatim rather than re-expressed in the new layer, so the same invalid value cannot be accepted by the GUI and rejected at boot.

## 3. Explicitly out of scope

Each of the following was considered and rejected for this proposal. They are listed so approval of section 2 cannot be read as approval of them.

**Deferred to the managed-site lifecycle (DEC-031).** Pausing a *specific* site's collection is already `enabled` on the device profile. DEC-041 removed the global "Automatic polling" switch precisely because per-site enablement has an owner. A fleet-wide pause is a different capability and needs its own proposal, not a field in this one.

**Required to stay environment-only, security gates.**

- `HUB_ACCESS_DEPLOYMENT_ENABLED` — DEC-036 pins it `false` on `--local` installs. A browser-reachable control that enables privileged host-agent deployment would cross the boundary the flag exists to hold.
- `HUB_HOST_MONITORING_ENABLED`, `HUB_HOST_OPERATIONS_ENABLED`, `HUB_HOST_OPERATION_TIMEOUT_MS` — fail-closed gates where operations permit admin start/stop/restart of Compose services. Turning those on must remain a host-side administrative act.

**Required to stay environment-only, infrastructure.**

- `HUB_BIND_ADDRESS` and `WEB_PORT` — FR-13 already states that a database row cannot change a Docker host port binding; applying it needs the host-side deployment path that Hub Settings owns for *access*, not a preferences form.
- `COMPOSE_PROJECT_NAME`, `POSTGRES_*`, `DATABASE_URL`, `HUB_AGENT_API_PORT`, `HUB_AGENT_GID`, `HUB_DEPLOYMENT_AGENT_SOCKET` — read before the database is reachable.

**Never returned to a client, secret material.** `HUB_DEPLOYMENT_AGENT_TOKEN`, the Compose file-secret paths (`PFSENSE_API_KEY_FILE`, `APP_ENCRYPTION_KEY_FILE`), and every per-device credential and CA bundle. If a future decision adds rotation, the interface shows only *configured: yes/no* plus a rotate action and never the value.

**Not this proposal.** `PFSENSE_API_TIMEOUT_MS` is better expressed per device on the site profile (that record has `enabled`, `edition`, and `tlsServername` but no timeout today) than as one Hub-wide number; `PFSENSE_OBSERVATION_CACHE_MS` and `PFSENSE_OBSERVATION_ERROR_CACHE_MS` are performance tuning with little operator value and would widen the surface for no benefit.

**Legacy single-firewall bootstrap.** `PFSENSE_DEVICE_ID`, `PFSENSE_DEVICE_NAME`, `PFSENSE_DEVICE_LOCATION`, `PFSENSE_EDITION`, `PFSENSE_API_BASE_URL`, and `PFSENSE_CA_FILE` are not settings to be surfaced. Site identity, TLS trust, and credentials are already GUI-managed per device; the legacy path remains supported in code for existing installations and must be retired by an intentional migration, not by a settings form.

## 4. Precedence — superseded during implementation

This section originally proposed the environment as the default and fallback, with the stored row as an override. The operator rejected that two-source model on November 23, 2026: runtime settings belong in the Hub, and `.env` is reserved for a clean install, so there must not be a second value that can disagree with what the scheduler is running.

As implemented, **the row is the only source**. `018_seed_hub_polling_settings.sql` seeds the install values, **Administration → Hub Settings → Polling cadence** edits the row, and the four `PFSENSE_POLLING_*` cadence variables were removed from `config.ts`, `.env.example`, `compose.yaml`, the `.env` that `scripts/install-linux.sh` generates, and the running deployment's `.env`. A missing row, or one outside the bounds (manual `UPDATE`, a future bounds tightening), is rewritten to the install values when it is read rather than falling back to an invisible environment value. `GET` reports `source: "install"` while `updated_by` is NULL — the operator has not chosen anything yet — and `"hub"` after a save. Stored values are validated at read time as well as write time, and the scheduler keeps its own constructor assertions.

The earlier paragraph is preserved in git history rather than here, so no reader mistakes it for the current rule.

## 5. Required contracts before implementation

**Migration.** `hub_settings` is not reusable: it is a single row whose columns are `reachability_method`, `address_type`, `address`, `https_port`, `updated_at`, `updated_by` — access reachability only. A new typed single-row table (`017`, which this decision used) with `CHECK` constraints mirroring the bounds above and an `updated_by uuid REFERENCES admin_users(id)` column, plus `018` to seed the row rather than editing an applied migration.

**API.** `GET` and `PUT` under `/api/v1/hub-settings/polling`, joining the existing Hub Settings authorization path (the `access-endpoints` `PUT` and the `deployments` routes are already gated there). The `PUT` body is validated with a schema that reuses the scheduler bounds and the `jitter < interval` refinement. Responses never include device data or host paths. Approval did **not** add a second flag: the surface is always available to administrators (DEC-044).

**Audit.** One `appendAudit` event per accepted change, `action: "hub.settings.update"` (the existing vocabulary is `noun.verb`: `device.update`, `system.operation.request`), `targetType: "hub_polling_settings"` as built, `outcome: "success"`, `metadata` limited to changed field names and their new integer values — never a diff of unrelated state, never credentials. Failures after validation record `outcome: "failure"`; a schema rejection changes no state and is not audited.

**Authorization.** Administrator role for both methods, enforced server-side; a hidden or disabled control is not authorization.

**Runtime application.** `PollScheduler` captures `intervalMs` and `jitterMs` in its constructor and exposes `start()`/`stop()`. A save therefore applies as stop → construct with the new options → start, which re-arms jitter and is auditable as a scheduler restart. An in-flight cycle is allowed to finish; the new interval governs the next one. Retention changes take effect at the next prune; concurrency changes take effect for subsequent cycles only.

**Single-scheduler constraint unchanged.** DEC-043 requires exactly one API process to schedule. A stored setting does not relax that: two API replicas would read the same row and both poll. The deployment documentation must keep saying so.

**UI.** Values and their source are shown as read-only text until the administrator edits; the four fields sit in one panel on the existing Hub Settings page, in the established card language. A saved value must not be presented as applied until the API confirms the scheduler restarted.

**Tests.** Bounds and the cross-field rule rejected server-side (not only in the browser); non-admin `403`; audit event written with actor, target, and changed fields; the install row created when none exists; a malformed row repaired instead of crashing; scheduler restarted with the new interval; `GET` reports the effective values and their source; a save does not enable polling when `PFSENSE_POLLING_ENABLED=false`.

## 6. Security review

This would be the first configuration write in a product whose stated security boundary is read-only. Under the repository's rule that state-changing capabilities need explicit approval, the reviewer should weigh:

- The values are bounded integers, but the *write path* is new: it needs authentication, role checks, input validation, rate limiting consistent with the rest of the API, and audit.
- One value is a resource-limit knob: a short interval with a high concurrency raises upstream request volume against every firewall. Approval should state whether a minimum interval or a derived ceiling applies, or accept that an administrator can do this deliberately. Every operation remains a read against the firewalls.
- None of the four can disable TLS verification, redirect a device destination, or widen endpoint scope, which is what keeps this proposal inside the read-only boundary.

## 7. Open questions — answered by DEC-044

1. **Fleet-wide pause?** No. Per-site `enabled` remains the pause mechanism (DEC-031). `PFSENSE_POLLING_ENABLED` stays environment-only: whether a process may schedule at all is a deployment decision, and the single-scheduler rule (DEC-043) must not be flippable from a browser.
2. **Precedence?** Superseded: the row is the only source, seeded at install, with no environment fallback (section 4).
3. **Separate default-off flag?** No. The write surface is one integer row the scheduler already validates, administrator-only and audited. A second gate would add a state where the form appears broken. DEC-036's flag requirement covers privileged host-agent deployment, which is a different risk.
4. **`GET` audience?** Administrator-only, like the rest of `/api/v1/hub-settings/polling`. This is Hub configuration, not site observation.

## 8. Implementation record

**Files.** `apps/api/migrations/017_hub_polling_settings.sql` (singleton table, CHECKs, `jitter_ms < interval_ms`, `updated_by` FK); `apps/api/migrations/018_seed_hub_polling_settings.sql` (install values, `ON CONFLICT DO NOTHING`; a new migration because applied ones are checksum-verified at boot); `apps/api/src/hub-settings.ts` (`POLLING_SETTING_BOUNDS`, `POLLING_SETTING_DEFAULTS`, `pollingSettingsSchema`, `PollingSettings`); `apps/api/src/hub-polling-settings.ts` (`resolvePollingSettings` with create/repair, `savePollingSettings`, `registerHubPollingSettingsRoutes`); `apps/api/src/server.ts` (resolution before `listen`, `buildPollScheduler`, `applyPollingSettings`, admin-only hook entry); `apps/api/src/hub-polling-settings.test.ts`; `apps/web/src/App.tsx` (Polling cadence panel); `compose.yaml`, `.env.example`, and `scripts/install-linux.sh` (the four cadence variables removed; the installer seeds through the migration and writes only the `PFSENSE_POLLING_ENABLED` gate).

**Response.** `GET` returns `{ intervalMs, concurrency, jitterMs, retentionDays, source: "install" | "hub", pollingEnabled, updatedAt, updatedBy }`. One `source` describes all four values because they live in one row — a deliberate simplification of the per-setting source sketched in section 4. `PUT` returns the same shape plus `applied: boolean`.

**Errors.** `400 INVALID_POLLING_SETTINGS`, `401 AUTHENTICATION_REQUIRED`, `403 ADMINISTRATOR_REQUIRED`, `500 POLLING_SETTINGS_NOT_APPLIED` (scheduler refused; previous cadence still running), `500 POLLING_SETTINGS_NOT_SAVED` (row not persisted; previous cadence restored). No upstream detail is echoed.

**Audit.** One `hub.settings.update` event per save attempt that reaches the scheduler: `targetType: "hub_polling_settings"`, outcome `success` or `failure`, metadata carries the previous and updated integers plus `applied` and `pollingEnabled`. Schema rejections return `400` without an audit event because no state changed; authentication and authorization denials are already audited by the server's response hook.

**Behaviour with `PFSENSE_POLLING_ENABLED=false`.** Deployments that keep the flag off still store the values, return `applied: false`, and show a note in the panel. Nothing is polled, and the stored values take effect the first time the deployment starts with the flag on.

**Not verified by hand.** The save through the browser with a real administrator session — the only path that reports `source: "hub"` — was exercised by the route tests (`401`, `403`, the audited save, and both failure recoveries), not by clicking through the deployment. What was observed live: `018` applied and seeded the row, the scheduler start line matched the row, changing the row and restarting changed the logged cadence, restoring the install values restored it, the `api` container's environment carries only `PFSENSE_POLLING_ENABLED`, the served bundle contains the panel, and unauthenticated `GET`/`PUT` returned `401`. The create/repair path for a missing or out-of-bounds row is unit-tested only.





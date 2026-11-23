# Background Polling Scheduler: Design Proposal

**Status:** Approved and implemented as DEC-043, November 23, 2026. The scheduler runs in `apps/api/src/pfsense/poll-scheduler.ts`, is opt-in via `PFSENSE_POLLING_ENABLED`, and is covered by `poll-scheduler.test.ts`, `poll-retention.test.ts`, and the cache write-through tests in `observation-cache.test.ts`. Section 2 keeps the approved parameters; section 7 records the implementation and verification outcome.

**Why this document:** `docs/PRD.md` requires per-device connectivity and read-only monitoring that tolerates partial outages (FR-2, FR-4, FR-5, FR-6) and listed polling frequency as an open question. The roadmap forbade claiming continuous monitoring until a scheduler exists, because collection previously happened only when someone opened a site page.

## 1. What existed before this increment

| Piece | Behavior at drafting time | File |
|---|---|---|
| Collection | `PfSenseProvider.collect(deviceId, onResult)` runs the fixed eight GET operations sequentially | `apps/api/src/pfsense/provider.ts` |
| Trigger | Only `GET /api/v1/devices/:deviceId/snapshot` (and its `/overview` alias) | `apps/api/src/pfsense/observation-routes.ts` |
| Reuse | In-process cache, 10 s success / 2 s failure, single-flight, 64-device bound | `apps/api/src/pfsense/observation-cache.ts` |
| History | One `poll_runs` row per operation per collection, never pruned | `apps/api/migrations/001_initial.sql` (table), `device-repository.ts` |
| Alerts | Deduplicated `device-poll:<deviceId>` warning/critical while failing, auto-resolved with an audit event after a fully successful collection | `apps/api/src/pfsense/poll-health.ts` |
| Metrics | `pfsense_poll_total`, `pfsense_poll_errors_total`, `pfsense_poll_duration_seconds` labeled by `device_id` and `operation_group` | `apps/api/src/metrics.ts` |
| Config | `PFSENSE_API_TIMEOUT_MS`, `PFSENSE_OBSERVATION_CACHE_MS`, `PFSENSE_OBSERVATION_ERROR_CACHE_MS` | `apps/api/src/config.ts` |

So the scheduler needed no new collection path, endpoint, upstream route, or firewall permission. It needed a trigger, a cadence policy, isolation between devices, and retention.

## 2. Approved decisions (DEC-043)

Each row is approved as recorded. The interval, concurrency, jitter, and retention values are configuration, so an installation may run different numbers within the documented bounds without a new decision; the *policy* is what was approved.

| # | Decision | Approved value | Rationale |
|---|---|---|---|
| P-1 | Polling interval per enabled, non-demo device | 60 s (`PFSENSE_POLLING_INTERVAL_MS`, 15 s–1 h) | The existing 10 s cache is a page-load optimization, not a monitoring interval; eight sequential GETs per device per minute is cheap |
| P-2 | Fleet concurrency | 2 devices at a time, one collection per device (`PFSENSE_POLLING_CONCURRENCY`, 1–8) | Each collection is already sequential inside; parallel devices must not multiply firewall load or memory |
| P-3 | Jitter | Random 0–15 s applied to a device's first sighting and to each scheduled success (`PFSENSE_POLLING_JITTER_MS`, 0–60 s, must be shorter than the interval) | Prevents synchronized polling after a restart and keeps devices desynchronized over time |
| P-4 | Failure backoff | 30 s → 60 s → 120 s → 300 s cap, reset on full success, with a floor of the configured interval | Bounded retry that never abandons a device; the cap keeps recovery detection within five minutes |
| P-5 | Per-device isolation | One device's failure, timeout, or schema rejection never stops another device's cycle | FR-2/FR-6; the collect loop already classifies errors per operation |
| P-6 | `poll_runs` retention | 30 days (`PFSENSE_POLLING_RETENTION_DAYS`), pruned in bounded 5,000-row batches at startup and every 24 h; alerts and audit events unaffected | The table previously grew without limit and holds the only per-operation history |
| P-7 | Alert timing | Alert on the first failed collection, keep the existing dedup key, auto-resolve on the first fully successful collection | Preserves current behavior and avoids a second alerting model |
| P-8 | Scheduler enablement | Opt-in via `PFSENSE_POLLING_ENABLED=false` default | An installation that does not opt in behaves exactly as before |
| P-9 | Scheduler lifecycle | One scheduler per API process, started after migrations and listen, stopped on shutdown; no leader election | Single API container is the current deployment; a second replica must not also schedule |
| P-10 | Cache interaction | Scheduler writes the observation cache after a collection, for one interval (capped at the cache's 600 s bound); a failure uses the existing 2 s failure window | Avoids a user-triggered collection right after a scheduled one |

**Amendment to P-4, recorded with the implementation:** the effective retry delay is `max(configured interval, backoff step)` rather than the bare step sequence. A failing device is therefore never polled *more often* than a healthy one. At the approved 60 s interval the observed retry sequence is 60 s → 60 s → 120 s → 300 s; the 30 s floor only takes effect when the interval is configured at 30 s or below. The regression test pins the bare step table and the interval floor separately.

P-6 and P-7 are the only rows that change persisted data or operator-visible alerts. P-9 is the only row that constrains future scaling.

## 3. Invariants the implementation must preserve

1. The eight-operation allowlist, the fixed upstream routes, and the read-only boundary are unchanged. No new firewall permission is requested.
2. The scheduler resolves devices from `managed_devices` server-side. No caller-supplied origin, path, method, or body exists anywhere in this path.
3. A scheduled collection is recorded exactly like a page-triggered one: `poll_runs` rows, metrics, and the same `recordPollHealth` call. There must not be two divergent health paths.
4. No firewall payload is persisted. Scheduled collection reuses the sanitized observation parsers; raw responses still never leave the process.
5. Timers and HTTP calls are cancelled on shutdown so the API process exits promptly.
6. Cache invalidation on profile, credential, TLS trust, enablement, or archival change still applies; a disabled or archived device stops being scheduled without a restart.
7. Secrets, API keys, and device credentials never enter logs, metric labels, or scheduler error messages.

## 4. Test plan (required before the feature can be claimed)

- Cadence: a fake clock proves the configured interval, jitter bounds, and the backoff sequence including cap and reset.
- Isolation: a device that times out or returns a schema-invalid payload neither delays nor fails another device's cycle, and its alert is raised once.
- Concurrency: no more than the configured number of devices are collected simultaneously.
- Enablement: with the flag off, no timer runs and behavior matches today's request-triggered path.
- Cache: a page load inside the interval is served from cache and does not trigger a second collection.
- Retention: the prune job deletes only rows older than the window and never touches `alerts` or `audit_events`.
- Shutdown: stopping the API clears timers and leaves no half-recorded collection.
- Boundary: no new route or method enters the route allowlist, and an unauthenticated request still receives `401`.

## 5. Explicitly out of scope for this increment

- Any write, apply, reboot, or configuration-changing firewall operation.
- Notification delivery (email, webhook, chat) and mute/export workflows.
- Utilization thresholds or trend charts: the API returns point-in-time samples, so history needs its own decision.
- Multi-instance leader election or a distributed job queue.
- CPU architecture reporting or REST API package-version discovery, which no approved endpoint supplies.

## 6. How the implemented scheduler works

`server.ts` constructs the scheduler only when `PFSENSE_POLLING_ENABLED=true`, after migrations, and calls `start()` after `app.listen()`; `shutdown()` calls `stop()`, which clears both timers. Nothing else in the process references it, so the request path is unchanged when the flag is off.

- **One timer, one collector.** `start()` prunes history, arms a 24 h retention interval, and schedules an immediate cycle. Each cycle reconciles the device set, then sleeps until the earliest due device, bounded to one interval. A cycle that is still running when the timer fires is skipped rather than overlapped.
- **In-memory schedule only.** Each enabled, non-demo device has `nextAttemptAt` and `consecutiveFailures`. A restart forgets both and re-derives the schedule from `managed_devices`, so no scheduling state is persisted and no new migration exists.
- **Same collection path.** A scheduled poll calls `provider.collect(deviceId, pollObserver(deviceId))` - the identical eight-operation allowlist, parsers, `poll_runs` writes, and metrics as the site snapshot route. It then calls the shared `recordPollHealth`, sets `pfsense_device_up`, and stores the sanitized snapshot in the observation cache. `recordPollHealth` and `prunePollRuns` are constructor dependencies whose defaults are the shared implementations, so a second health or retention path cannot be introduced silently.
- **Failure containment.** Each device runs inside its own `try`/`catch`; a throw marks only that device's attempt failed and schedules its backoff. Thrown errors are logged with the device ID and the error *class* only, never the message, because a message can carry a hostname or upstream detail.
- **Devices leaving scope.** Disabled, archived, and demo devices are filtered out of every cycle and dropped from the schedule, so a disabled firewall stops being polled without a restart. Admin changes still invalidate the cache through the existing `onDeviceChanged` hook.
- **Retention.** `prunePollRuns` deletes at most 5,000 expired rows per statement (`completed_at < now() - retentionDays`), touching only `poll_runs`. A successful deletion is audited as `polling.history_pruned` with the row count; an empty prune writes nothing, and a prune failure is logged and ignored so monitoring continues.

## 7. Outcome and verification

Implemented November 23, 2026 as DEC-043.

| Claim | Evidence |
|---|---|
| Cadence, jitter bounds, overlap guard | `poll-scheduler.test.ts`: interval boundary, jitter window, `skipped` cycle, timer-driven start/stop |
| Backoff sequence, cap, reset | `poll-scheduler.test.ts`: `[30s, 60s, 120s, 300s, 300s]` at a 15 s interval, then a 15 s cadence after recovery |
| Isolation | `poll-scheduler.test.ts`: a throwing device does not stop the other two, and is not recorded as healthy |
| Concurrency bound | `poll-scheduler.test.ts`: three devices with concurrency 2 never exceed two in-flight collections |
| Only approved devices | `poll-scheduler.test.ts`: disabled and demo devices are never collected |
| Shared health path | `poll-scheduler.test.ts`: `recordPollHealth` receives the real failed/total counts, including partial collections |
| Cache write-through | `observation-cache.test.ts`: stored value serves until its own TTL, an in-flight request wins, invalid TTL rejected |
| Retention scope and cost | `poll-retention.test.ts`: delete bounded by `LIMIT`, window in days, `alerts`/`audit_events` never referenced, invalid ranges rejected |
| No new surface | No route, method, upstream path, or firewall permission was added; the eight-operation allowlist and the read-only boundary are untouched |

Full checks on the implementation commit: API suite **27 files / 335 tests passed** (21 new), API and web typecheck exit 0, production build exit 0 with unchanged web hashes (`index-RBcacaty.js`, `index-DyUEt6w2.css`). The rebuilt `api` container runs with the flag false, is healthy, and logs no scheduler start line.

Live activation on November 23, 2026 confirmed the cadence: with `PFSENSE_POLLING_ENABLED=true`, eight consecutive cycles of all eight operations succeeded at 70–79 s spacing (60 s interval plus 0–15 s jitter plus collection time) with no page request, no duplicate rows, no alert, and no `warn`/`error` log line (closeout section 16). The flag still fails closed on an unrecognised value such as `yes` rather than reading it as `false`.

**Not verified:** a repeated poll failure producing one deduplicated alert that auto-resolves on recovery, a page load inside the interval reporting `cacheHit: true`, and a retention prune that removes and audits real rows. Enabling the flag remains an operator action on a running installation; the cadence is verified, the failure and retention paths are not.


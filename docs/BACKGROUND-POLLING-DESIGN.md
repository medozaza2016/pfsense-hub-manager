# Background Polling Scheduler: Design Proposal

**Status:** Proposal, not approved. No decision is recorded in [Decisions](DECISIONS.md), no code exists, and nothing in this document is implemented. It exists so the next queue item in [Roadmap](ROADMAP.md) section 3.1 can be approved or amended in one pass instead of being invented during implementation.

**Why this document:** `docs/PRD.md` requires per-device connectivity and read-only monitoring that tolerates partial outages (FR-2, FR-4, FR-5, FR-6) and lists polling frequency as an open question. The roadmap forbids claiming continuous monitoring until a scheduler exists. Today collection happens only when someone opens a site page.

## 1. What exists today

| Piece | Current behavior | File |
|---|---|---|
| Collection | `PfSenseProvider.collect(deviceId, onResult)` runs the fixed eight GET operations sequentially | `apps/api/src/pfsense/provider.ts` |
| Trigger | Only `GET /api/v1/devices/:deviceId/snapshot` (and its `/overview` alias) | `apps/api/src/pfsense/observation-routes.ts` |
| Reuse | In-process cache, 10 s success / 2 s failure, single-flight, 64-device bound | `apps/api/src/pfsense/observation-cache.ts` |
| History | One `poll_runs` row per operation per collection, never pruned | `apps/api/migrations/001_initial.sql` (table), `device-repository.ts` |
| Alerts | Deduplicated `device-poll:<deviceId>` warning/critical while failing, auto-resolved with an audit event after a fully successful collection | `apps/api/src/pfsense/poll-health.ts` |
| Metrics | `pfsense_poll_total`, `pfsense_poll_errors_total`, `pfsense_poll_duration_seconds` labeled by `device_id` and `operation_group` | `apps/api/src/metrics.ts` |
| Config | `PFSENSE_API_TIMEOUT_MS`, `PFSENSE_OBSERVATION_CACHE_MS`, `PFSENSE_OBSERVATION_ERROR_CACHE_MS` | `apps/api/src/config.ts` |

So the scheduler needs no new collection path, endpoint, upstream route, or firewall permission. It needs a trigger, a cadence policy, isolation between devices, and retention.

## 2. Decisions required before implementation

Each row needs an explicit approve/amend answer. The values in the last column are **recommendations only**.

| # | Decision | Recommended default | Rationale |
|---|---|---|---|
| P-1 | Polling interval per enabled, non-demo device | 60 s | The existing 10 s cache is a page-load optimization, not a monitoring interval; eight sequential GETs per device per minute is cheap |
| P-2 | Fleet concurrency | 2 devices at a time, one collection per device | Each collection is already sequential inside; parallel devices must not multiply firewall load or memory |
| P-3 | Jitter | Random 0–15 s on start and per cycle | Prevents synchronized polling after a restart |
| P-4 | Failure backoff | 30 s → 60 s → 120 s → 300 s cap, reset on full success | Bounded retry that never abandons a device; the cap keeps recovery detection within five minutes |
| P-5 | Per-device isolation | One device's failure, timeout, or schema rejection never stops another device's cycle | FR-2/FR-6; the collect loop already classifies errors per operation |
| P-6 | `poll_runs` retention | 30 days, pruned by a bounded daily job; alerts and audit events unaffected | The table currently grows without limit and holds the only per-operation history |
| P-7 | Alert timing | Alert on the first failed collection, keep the existing dedup key, auto-resolve on the first fully successful collection | Preserves current behavior and avoids a second alerting model |
| P-8 | Scheduler enablement | Opt-in via `PFSENSE_POLLING_ENABLED=false` default, plus an interval override | An installation that does not opt in behaves exactly as today |
| P-9 | Scheduler lifecycle | One scheduler per API process, started after migrations and stopped on shutdown; no leader election | Single API container is the current deployment; a second replica must not also schedule |
| P-10 | Cache interaction | Scheduler writes the observation cache after a collection so a page load inside the interval is served from cache | Avoids a user-triggered collection right after a scheduled one |

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

## 6. Approval checklist

1. Answer P-1 through P-10, marking any row that differs from the recommendation.
2. Record the outcome as a new decision in [Decisions](DECISIONS.md) that supersedes the "polling frequency remains open" statement in `docs/PRD.md` section 11 and closes the roadmap's "no continuous-monitoring claim" note.
3. Update `docs/METRICS.md` and `docs/MONITORING.md` for the new interval, backoff, and retention behavior.
4. Only then implement, with the test plan above, and record the outcome in [Verification and Documentation Closeout](VERIFICATION-AND-CLOSEOUT.md) as a new section.

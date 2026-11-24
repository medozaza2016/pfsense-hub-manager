# Application Metrics

## Purpose
These metrics describe pfSense Hub Manager itself. They are separate from the upstream pfSense API specification and the API coverage matrix.

## Initial metrics
| Metric | Type | Meaning | Bounded labels |
|---|---|---|---|
| `http_requests_total` | Counter | Completed manager HTTP requests | method, route template, status |
| `http_request_duration_seconds` | Histogram | Manager request duration | method, route template |
| `pfsense_poll_total` | Counter | Poll attempts | device_id, operation_group, result |
| `pfsense_poll_errors_total` | Counter | Failed polls | device_id, operation_group, error_class |
| `pfsense_poll_duration_seconds` | Histogram | Firewall poll duration | device_id, operation_group |
| `pfsense_device_up` | Gauge | Most recent health check, 1 or 0 | device_id |
| `pfsense_last_successful_poll_timestamp_seconds` | Gauge | Unix timestamp of last successful poll | device_id |
| `process_uptime_seconds` | Gauge | Backend process uptime | none |

Use controlled error classes such as timeout, tls, authentication, authorization, unsupported, rate_limit, remote_server, invalid_response, and unknown.

## Collection rules
- Record one attempt and duration per logical poll operation.
- Update last-success timestamp only after a successful, validated response.
- Set device-up from a defined health check.
- Use stable application-generated device IDs.
- Use route templates, never raw URLs or object IDs.
- Never use credentials, API keys, raw payloads, arbitrary IPs, serial numbers, or exception messages as labels.
- Avoid high-cardinality labels.

## Initial implementation
Expose Prometheus-format metrics from Fastify at `/metrics`. It is available only on the internal Docker network, is not proxied by the web container, and is not published to the LXC host.

Prometheus is optional for the first scaffold. Add it when historical time-series, alerting, or external dashboards justify it. PostgreSQL stores application data and selected operational history, not every scrape sample.

## Open parameters
Histogram buckets and metrics access control remain to be decided. The polling interval, fleet concurrency, backoff, and `poll_runs` retention are decided in DEC-043.

## Scheduled polling, November 23, 2026

Background polling (DEC-043) deliberately emits exactly the same series as a page-triggered collection, because it calls the same `pollObserver` recorder from the same eight-operation path. Consequences to keep in mind when reading dashboards:

- There is no `trigger` label. A scheduled poll and a page-triggered poll are indistinguishable in `pfsense_poll_*`; separating them would add a high-cardinality label for little value, so use the collection cadence (`pfsense_last_successful_poll_timestamp_seconds`) instead.
- A poll served from the scheduler's cache write-through emits no poll metrics, matching the existing rule that cache hits do not count as upstream operations.
- A failed scheduled collection increments `pfsense_poll_errors_total` per failed operation and sets `pfsense_device_up` to `0`; a fully successful one sets it to `1`. A device the scheduler could not even start collecting (removed, disabled, or archived mid-cycle) updates neither, because no upstream operation ran.
- History retention never changes counters. `poll_runs` pruning deletes rows and writes one `polling.history_pruned` audit event; it does not touch `pfsense_poll_*` or alert state.

## Per-operation polling labels, November 23, 2026

`pfsense_poll_*` labels use one `operation_group` value per approved operation: `system`, `gateways`, `interfaces`, `services`, `version`, `arpTable`, `firewallStates`, and `firewallStateSize`. Before DEC-042 the ARP operation shared the `diagnostics` label with no other operation, and the two firewall-state operations shared `firewallStates`, which made per-endpoint capability derivation ambiguous. Historical rows keep their old labels; capability derivation falls back to `diagnostics` and `firewallStates` when no per-operation row exists. Dashboards that grouped by the old labels must add the new ones; no metric name, type, or label key changed.

Snapshot cache hits do not emit poll metrics, because no upstream operation ran. A cache hit is reported only in the response `meta.cacheHit` field. Two cache windows therefore coexist and look identical in metrics: a route-triggered miss stores its snapshot for the collection-limit success window (10 s default), while the scheduler stores for `min(intervalMs, 600 s)` (60 s at the default interval). Both were observed live on November 23, 2026 — `meta.cacheHit: true` with `durationMs: 0` and no new `poll_runs` row, including a read 52 s after a scheduled write-through — and in both cases no `pfsense_poll_*` series moved (closeout section 19).

A retention prune is similarly invisible to counters: deleting 40 aged `poll_runs` rows wrote one `polling.history_pruned` event with `removedRuns: 40` and left every `pfsense_poll_*` series and the alert state untouched, and a prune that removed nothing wrote no event at all.

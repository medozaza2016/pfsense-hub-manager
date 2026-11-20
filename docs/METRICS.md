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
Polling interval, per-device concurrency, histogram buckets, retention, exact operation groups, and metrics access control remain to be decided.

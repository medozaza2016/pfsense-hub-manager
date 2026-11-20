# Monitoring and Operations

## Initial model
The Fastify backend owns per-device polling and exports application metrics. Poll devices independently so one outage does not block others. Start with backend-local scheduling, not a separate worker container.

## Health signals
- Backend availability and uptime.
- Manager HTTP request rate, latency, and error rate.
- Per-device reachability.
- Poll attempts, successes, failures, and duration.
- Last successful poll timestamp.
- Classified failure reason with sanitized diagnostic context.

See `METRICS.md` for names and label rules.

## Failure classification
| Class | Typical meaning | First checks |
|---|---|---|
| timeout / network | Route, DNS, refusal, or timeout | Private route, address, port, firewall availability |
| tls | Certificate trust or hostname validation | Repair certificate trust, do not disable verification |
| authentication | API key/account authentication failed | Verify key and account |
| authorization | Missing privilege | Review least-privilege permission for the operation |
| unsupported | Endpoint/package capability absent | Update device compatibility record |
| rate_limit | API throttling | Reduce concurrency or polling frequency |
| remote_server | Firewall-side API failure | Inspect firewall/API service |
| invalid_response | JSON/schema mismatch | Compare package version and pinned schema |
| unknown | Unclassified failure | Capture sanitized diagnostics |

Use bounded retries with backoff for transient failures. Do not retry authentication or authorization failures indefinitely.

## Alerts
Thresholds are not set yet. Establish baselines before defining alerts for backend outage, sustained device outage, excessive poll failures/latency, repeated TLS/authentication errors, and storage or backup failures. Do not invent service-level objectives before agreeing on targets.

## Prometheus
Prometheus is optional, not required in the initial Compose stack. If adopted, scrape the restricted `/metrics` endpoint and define retention and alert routing.

## Incident checklist
1. Identify the device by application device ID.
2. Check last successful poll and classified failure.
3. Verify manager-to-firewall private connectivity.
4. Verify TLS trust and hostname.
5. Verify authentication and the operation privilege.
6. Confirm edition, release, architecture, and API package version.
7. Check for upstream API/schema changes.
8. Record the resolution without credentials or sensitive payloads.

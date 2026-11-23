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


## Hub Docker Compose monitoring and recovery (approved scope)

### Access policy (DEC-027)
- Application roles for this area are `admin` and `user`.
- Both authenticated roles may view service health/status, host telemetry when available, and bounded sanitized service logs.
- Only `admin` may invoke service start/stop/restart, whole-stack start/stop/restart, or Compose validation.
- For `user`, operational controls are visible but disabled and explain that administrator access is required.
- The API must deny unauthenticated requests with 401 and authenticated non-admin operation requests with 403. The UI is presentation only and is never an authorization boundary.
- Role checks must use the role loaded from the server-side database-backed session, never a role supplied by the browser.

## Hub Docker Compose monitoring and recovery (requirements detail)

This section concerns the Hub's own three-service Compose project only: Web, API, and PostgreSQL. The dedicated host is not intended to be a general-purpose Docker host, and unrelated containers are out of scope.

### Monitoring
- Display host CPU, memory, and disk usage only when obtained through a reliable host-side telemetry source. Do not infer host resource usage from the API container's process metrics.
- Display each service's container state, health-check status, uptime, restart count, and last observed update when the runtime provides those fields.
- Provide bounded log retrieval with pagination/limits and follow mode where supported. Redact secrets and avoid returning unbounded log output.
- Distinguish container state (running/stopped) from application health (healthy/unhealthy/unknown).

### Approved initial operations
- Individual service: start, stop, restart, and view logs.
- Whole project: start, stop, restart, and validate Compose configuration.
- Whole-stack stop is disruptive and requires explicit confirmation. Stopping the stack also makes this GUI unavailable.
- Rebuild, recreate, image update, volume deletion, database restore, and arbitrary Docker/host commands are not part of the initial scope.

### Execution and security boundary
The browser calls the Hub API. The API authorizes the administrator and records the requested operation. A narrowly scoped host-side management component performs only predefined actions for the fixed Hub Compose project. The web and API containers must not receive the Docker socket. Do not accept arbitrary command strings, Compose file paths, project names, service names, or CLI flags from the browser. Validate targets against the fixed service allowlist: web, api, and db (PostgreSQL).

Operations must preserve persistent data. Routine stop, restart, and start operations must never include volume removal. Compose configuration validation must not start, stop, or recreate containers. After an operation, query actual runtime state and health; report command completion separately from confirmed recovery. Record actor, action, target, request time, completion time, outcome, and sanitized diagnostics.

### Host recovery procedure
If the entire stack is stopped, the GUI cannot restart itself. The operator must use Docker Desktop or a host terminal to start the project again using the documented Compose deployment procedure. This recovery path must be documented and tested before exposing whole-stack stop in the GUI.

### Implementation status
Implemented through the restricted Host Agent and live-verified on November 23, 2026 for the read paths, bounded logs, Compose validation, the unauthenticated-denial boundary, and allowlisted operations (DEC-039). The agent supports `system.status`, `system.logs`, `compose.validate`, `system.operation`, and `system.operationResult`, and accepts only fixed service targets (`web`, `api`, `db`) and `stack`. The API exposes these only when the corresponding fail-closed feature flags are enabled; operator journals are persisted in `host_operations`.

It does not expose the Docker socket to application containers, arbitrary Compose actions, command-prompt/shell execution, volume deletion, image rebuild/update, or container creation outside the fixed project. Outstanding verification, not passed: a per-service `start`/`stop`/`restart` observed from the browser, the stack-stop recovery rehearsal from a host shell, and viewport-by-viewport visual acceptance. See `SYSTEM-MONITORING-RECOVERY.md` sections 9 and 10 and `ROADMAP.md`.

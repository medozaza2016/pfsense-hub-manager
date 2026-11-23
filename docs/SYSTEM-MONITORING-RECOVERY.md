# System Monitoring & Recovery

**Status:** Implemented and committed on `main` as [`eb008f5`](https://github.com/medozaza2016/pfsense-hub-manager/commit/eb008f5): Host Agent read-only monitoring, bounded logs, fixed-project Compose validation, and allowlisted start/stop/restart; API routes, authorization, audit trail, and the live-wired `/settings/system-recovery` page. Both host feature flags remain `false` by default, so an existing installation behaves exactly as before until an administrator enables them. Browser acceptance and a live operation on the deployment host are not yet recorded.

**Decision authority:** [DEC-026, Hub-only Docker Compose operations and monitoring](DECISIONS.md), [DEC-027, Monitoring visibility and administrator-only operations](DECISIONS.md), and [DEC-039, Host Agent monitoring and recovery operation surface](DECISIONS.md).

## 1. Purpose and placement

Provide a simple **System Monitoring & Recovery** area in the existing Administration interface for this pfSense Hub Manager deployment only. The dedicated host is reserved for this project. Managing unrelated host containers or general-purpose host administration is out of scope.

This is distinct from:

- **Application Settings**, which remains limited to the General and Preferences cards defined by DEC-035.
- **Site Monitoring**, which concerns an individual managed pfSense firewall.

The frontend route is `/settings/system-recovery`, with an Administration navigation item named **System Monitoring & Recovery**.

## 2. Frontend surface

The page at `/settings/system-recovery` contains the following sections:

| Section | Presentation | Wiring |
|---|---|---|
| Host resources | CPU, memory, disk, and uptime cards | `GET /api/v1/system/status`; unavailable metrics render as unknown, never as a fabricated value |
| Compose service health | Web, API, PostgreSQL | Same status response; containers that are absent, unhealthy, or unknown are reported as such |
| Per-service actions | Start, Stop, Restart for each listed service | `POST /api/v1/system/operations` with a fixed `action`/`target`, disabled for non-admins and while an operation is active |
| Service logs | Fixed service selector, line-count selector, refresh | `GET /api/v1/system/services/:service/logs?lines=`; bounded and redacted server-side |
| Compose validation | Validation action and result area | `POST /api/v1/system/compose/validate` for the fixed project file only |
| Whole-stack controls | Start, Stop, Restart | Same operations endpoint with `target: "stack"`; Stop requires a typed confirmation phrase |
| Operation history | Recent journaled operations and their outcomes | `GET /api/v1/system/operations[/:id]`, polled while an operation is active |
| Recovery guidance | Host access, inspect project, restore stack, verify health | Guidance only, no command execution |
| Safety notes | Stack-stop outage warning, code-server exclusion, role model | Informational only |

The page never fabricates resource values, service health, logs, validation results, or operation outcomes. It reaches Docker only through the API and the Host Agent. Disabled controls and hidden buttons are presentation only; the API and the agent re-check role, flag state, device identity, and the operation allowlist on every request.

## 3. Approved initial functional scope

The scope below is the authority for what may exist, and it is now implemented as described in section 6.

### Host resource visibility

Expose CPU, memory, and disk utilization where safely available. Host uptime is already represented in the frontend. The implementation must define metric source, units, sampling interval, refresh behavior, and unavailable/error states. Do not invent values when a metric cannot be read.

### Fixed service health

Expose health/status only for the project's approved Compose services:

- Web
- API
- PostgreSQL

The browser-based code-server service is excluded. Reintroducing it requires a separate explicit decision.

### Bounded service logs

Allow retrieval of logs only for the approved services. Define strict output limits, time/window bounds, truncation behavior, and secret redaction before exposing logs to authenticated users. Do not allow arbitrary container names, host paths, or unbounded log retrieval.

### Individual service operations

Provide start, stop, and restart for each allowlisted service. Enforce authorization on the API and host-side boundary. Record operator, action, target, request/result state, and safe failure details in the audit trail.

### Whole-stack operations

Provide start, stop, and restart for this project's Compose stack only. Stopping the stack makes the browser UI unavailable. Recovery must therefore be possible through documented host-side Docker Desktop or Docker CLI procedures. No volume deletion or destructive database maintenance is permitted.

### Compose configuration validation

Validate only the approved project Compose configuration. Do not accept arbitrary Compose file paths, project names, profiles, shell fragments, or user-supplied commands.

## 4. Authorization model

Per DEC-027:

- Unauthenticated requests are denied.
- Authenticated `admin` and `user` accounts may view monitoring status.
- Only `admin` may invoke service/stack operations or Compose validation.
- For `user`, controls may remain visible but must be disabled with a clear administrator-only explanation.
- Every operational endpoint must enforce the same authorization server-side. Frontend visibility or disabled state is not a security boundary.

Operational attempts and outcomes must be audited without recording secrets or sensitive log content.

## 5. Host management security boundary

All operations must pass through a narrowly scoped host-side management boundary with an explicit allowlist for this Compose project and its approved services.

Prohibited approaches:

- Do not mount the Docker socket into the web or API containers.
- Do not expose arbitrary shell or Docker/Compose execution.
- Do not permit operations against unrelated containers or Compose projects.
- Do not permit volume deletion.
- Do not add rebuild/recreate, image update, destructive database maintenance, or broader host management in this initial scope.

The host-side component must validate operation identifiers and targets against fixed allowlists, bound execution time and output, serialize conflicting operations where required, and return structured success/failure states without leaking secrets.

## 6. Implemented Host Agent control surface

The browser never reaches Docker. `apps/api/src/host-system/` owns the request contract and the audit trail; `host-agent/pfsense_hub_agent.py` is the only process that runs Docker or Compose, and it runs as the restricted systemd unit described in section 5.

### 6.1 Wire protocol v2

Protocol version 2 adds a required `operation` field. Requests are strict objects: unknown keys, unknown operations, unknown actions, and unknown targets are rejected instead of forwarded. The schema is defined once in `apps/api/src/host-system/protocol.ts` and mirrored in the agent.

| Request | Effect |
|---|---|
| `{ protocolVersion: 2, operation: "system.status" }` | Host metrics plus state for `web`, `api`, `db` |
| `{ protocolVersion: 2, operation: "system.logs", service, lines }` | Bounded log lines for an allowlisted service |
| `{ protocolVersion: 2, operation: "compose.validate" }` | Validate the fixed project Compose file |
| `{ protocolVersion: 2, operation: "system.operation", operationId, action, target }` | Dispatch one allowlisted recovery action |
| `{ protocolVersion: 2, operation: "system.operationResult", operationId }` | Read that operation's journaled outcome |

`deployment.apply` keeps its version 2 shape and remains the only request serialized on the connection handler.

### 6.2 Allowlisted operations

`system.operation` accepts only `action` ∈ `{start, stop, restart}` and `target` ∈ `{web, api, db, stack}`. Each pair maps to fixed argv:

```
docker compose --project-directory <project_dir> -f <compose_file> up -d [service]
docker compose --project-directory <project_dir> -f <compose_file> stop [service]
docker compose --project-directory <project_dir> -f <compose_file> restart [service]
```

A target is interpolated only after it matches the allowlist, so a caller cannot introduce a Compose argument, flag, profile, container name, other project, or shell fragment. `stack` addresses only `web`, `api`, and `db`; the code-server container is never addressed. Command timeout is 120 s and output is bounded.

### 6.3 Exactly-once execution

The manager generates the operation UUID and journals the row before contacting the agent. The agent records the id in its journal before answering `{"state":"accepted"}`, then executes in a bounded background thread:

- A retried dispatch for an id already recorded returns `accepted` again and does not execute a second time.
- The same id with a different action or target is refused with `OPERATION_CONFLICT`.
- An unknown action or target is refused with `OPERATION_ACTION_UNSUPPORTED` or `OPERATION_TARGET_UNSUPPORTED`; an invalid id or unexpected key is refused with `REQUEST_INVALID`. Nothing runs in any refusal case.

The journal is `operation_state_path`, defaulting to `host-operations.json` beside `lock_path`. For the production unit that is `/run/pfsense-hub/host-operations.json`, inside the unit's `ReadWritePaths` and cleared on reboot, so an interrupted operation is never replayed after a restart; for the unprivileged development agent it lives in the checkout's `run/host-agent/`. The file is written atomically (temporary file, `fsync`, `rename`, mode `0600`), rejects a symlink, a foreign owner, a malformed envelope, or an unknown entry shape, and prunes settled entries to 50 while keeping unsettled ones. A tampered or unreadable journal fails closed with `OPERATION_JOURNAL_UNAVAILABLE` or `OPERATION_JOURNAL_INVALID` rather than guessing an outcome.

### 6.4 Execution versus confirmed recovery

Command completion is not recovery. After the Compose command exits successfully, the agent polls `docker compose ps --format json` for up to 15 s. The operation is reported `succeeded` only when every addressed service reaches the requested state; a start needs a running container, a stop accepts `exited`, `created`, `dead`, or absence. Otherwise the outcome is `failed` with `OPERATION_UNVERIFIED`, and a non-zero command exit gives `HOST_OPERATION_FAILED`. The manager records `verified_at` only from a verified result, so an executed-but-unconfirmed change is never presented as recovered.

### 6.5 Manager side

`POST /api/v1/system/operations` is administrator-only, journals the row and its `system.operation.request` audit event in one transaction, and returns the record without waiting for the host. A partial unique index enforces one active operation, so a second concurrent request is refused with `HOST_OPERATION_IN_PROGRESS`; stack stop additionally requires the typed confirmation and therefore `HOST_OPERATION_CONFIRMATION_REQUIRED`. Reconciliation runs at boot and after status reads: it asks the agent for the journaled outcome, settles the row with `system.operation.complete`, leaves the row untouched when the agent is unreachable, settles `unknown`/`OPERATION_TIMEOUT` when the operation outlives `HUB_HOST_OPERATION_TIMEOUT_MS`, and settles `unknown`/`OPERATION_NOT_FOUND` when the agent has no record of the id.

### 6.6 Flags, configuration and rollback

| Setting | Default | Meaning |
|---|---|---|
| `HUB_HOST_MONITORING_ENABLED` | `false` | Enables status, logs, and the overview poll |
| `HUB_HOST_OPERATIONS_ENABLED` | `false` | Enables validation, operation submission, and history; requires monitoring |
| `HUB_HOST_OPERATION_TIMEOUT_MS` | `180000` | Reconciliation timeout (5 s – 600 s) |
| `operation_state_path` (agent) | beside `lock_path` | Operation journal |

Disabling the flags leaves the routes returning 503 `HOST_MONITORING_DISABLED` or `HOST_OPERATIONS_DISABLED`; stopping the agent makes operations unavailable with `HOST_AGENT_NOT_CONFIGURED` or a bounded timeout failure. Neither action rolls back an operation already executed, so recovery guidance in the UI stays authoritative. Existing installations keep working without a configuration rewrite because both flags and the journal path have production-preserving defaults.

## 7. Implementation checklist

- [x] Define the Host Agent request/response contract for metrics, service health, bounded logs, Compose validation, and allowlisted operations.
- [x] Implement host metrics with explicit units, sampling, and unavailable/error behavior.
- [x] Implement health/status for Web, API, and PostgreSQL only.
- [x] Implement bounded, redacted service log retrieval.
- [x] Implement fixed-project Compose validation.
- [x] Implement per-service start/stop/restart with timeouts, serialization, structured results, and audit events.
- [x] Implement whole-stack start/stop/restart with the same controls and clear outage warnings.
- [x] Enforce admin/user visibility and server-side authorization on every API operation.
- [x] Add tests for authorization, allowlist enforcement, arbitrary-target rejection, log redaction/truncation, timeouts, and recovery after failures.
- [x] Document host-side recovery procedures for when the stack is stopped and the GUI is unavailable.
- [ ] Verify desktop, tablet, and mobile browser presentation against the running build.
- [ ] Re-run the checks on the deployment host with both flags enabled and record the result in the verification closeout.
- [ ] Review any expansion beyond the initial scope through a separate decision.

## 8. Acceptance criteria

The feature is not functionally complete until all of the following are true:

1. Monitoring values and service health come from the trusted host-side source, not hardcoded fixtures.
2. Only Web, API, and PostgreSQL can be queried or operated on by this feature.
3. Logs are bounded and sanitized.
4. Admin/user access behavior is enforced server-side, including denial of unauthenticated requests.
5. Operational actions are limited to the approved project/service allowlist and generate audit events.
6. Stack-stop recovery is documented and tested without relying on the GUI.
7. Failure, timeout, restart, and unavailable-host states are represented accurately.
8. Automated tests and browser acceptance pass, and exact results are recorded in the verification closeout.

## 9. Current verification state

Verified for commit `eb008f5` on Linux:

| Check | Command | Result |
|---|---|---|
| API typecheck | `npm run typecheck` in `apps/api` | pass |
| API tests | `npm test` in `apps/api` (`vitest run src`) | 22 files, 275 tests passed |
| Agent tests | `python3 -m unittest discover -p 'test_*.py'` in `host-agent` | 64 tests passed |
| Web build (`tsc -b` and `vite build`) | `npm run build` in `apps/web` | pass |

### Live stack verification, November 23, 2026

Run on the Ubuntu Docker host against commit `eb008f5`, using the unprivileged development harness (`scripts/dev-host-agent.sh`) and a local `.env` with `HUB_HOST_MONITORING_ENABLED=true`, `HUB_HOST_OPERATIONS_ENABLED=true`, and `HUB_HOST_OPERATION_TIMEOUT_MS=180000`. The API container was recreated and its environment confirmed to carry those three values.

| Check | Method | Result |
|---|---|---|
| Agent restarted on current source | `bash scripts/dev-host-agent.sh restart` | Restarted; socket, pid file, and journal directory present |
| Protocol v2 `system.status` | direct newline-delimited JSON on the agent socket | `state: "ok"` with live host metrics (16 CPUs, memory, disk, uptime) and `web`/`api`/`db` container state and health |
| Protocol v2 `system.logs` | same | `state: "ok"`, 5 lines returned, `truncated: false` |
| Protocol v2 `compose.validate` | same | `state: "valid"` |
| Unknown operation result | same, random operation id | `OPERATION_NOT_FOUND` |
| Unsupported action | same, `action: "delete"` | `OPERATION_ACTION_UNSUPPORTED` |
| Migration 015 applied | `\d host_operations` | Table plus `host_operations_recent` and the partial unique index `host_operations_single_active` (`WHERE state IN ('requested','running')`), with action, target, and state check constraints and the actor foreign key |
| Manager authorization boundary | unauthenticated `GET /api/v1/system/status` and `GET /api/v1/system/operations` | `401` for both; the SPA routes `/` and `/settings/system-recovery` serve `200` |
| Browser against the live agent | page open in a browser session | `GET /api/v1/system/status` polled every 10 s returning `200`, and `POST /api/v1/system/compose/validate` returned `200` |
| Live stack operation | Initiated by the operator from the browser | `restart` on target `stack`, request id `req-f`, actor `ahmed`: `requested` at `2026-11-23T05:06:48Z`, `verified_at` at `05:06:49Z`, `succeeded` at `05:06:50Z`. The agent journal recorded the same operation as `completed`/`succeeded` with `verified: true`, and all three containers restarted and returned to healthy |

The operator-initiated stack restart coincided with the image rebuild for this verification; both completed, and the stack came back healthy with the new API configuration.

Still outstanding: the stack-stop recovery rehearsal (stopping the stack and recovering it from a host shell without the GUI), and an observed single-service `start`/`stop`/`restart` in the browser. Running `vitest run` without the `src` filter also picks up stale compiled tests in `apps/api/dist/`, which fail for reasons unrelated to source; use the package script. See [VERIFICATION-AND-CLOSEOUT.md](VERIFICATION-AND-CLOSEOUT.md).

# System Monitoring & Recovery

**Status:** Frontend preview merged to `main` through [PR #10](https://github.com/medozaza2016/pfsense-hub-manager/pull/10). Backend and Host Agent workflows are not implemented.

**Decision authority:** [DEC-026, Hub-only Docker Compose operations and monitoring](DECISIONS.md), and [DEC-027, Monitoring visibility and administrator-only operations](DECISIONS.md).

## 1. Purpose and placement

Provide a simple **System Monitoring & Recovery** area in the existing Administration interface for this pfSense Hub Manager deployment only. The dedicated host is reserved for this project. Managing unrelated host containers or general-purpose host administration is out of scope.

This is distinct from:

- **Application Settings**, which remains limited to the General and Preferences cards defined by DEC-035.
- **Site Monitoring**, which concerns an individual managed pfSense firewall.

The frontend route is `/settings/system-recovery`, with an Administration navigation item named **System Monitoring & Recovery**.

## 2. Delivered frontend placeholder

The UI merged in PR #10 contains the following visible sections:

| Section | Current presentation | Functional status |
|---|---|---|
| Host resources | CPU, memory, disk, and uptime cards | Placeholder values, no live data |
| Compose service health | Web, API, PostgreSQL | Unknown/not connected |
| Per-service actions | Start, Stop, Restart for each listed service | Disabled |
| Service logs | Fixed service selector and refresh affordance | Disabled, no log retrieval |
| Compose validation | Validation action and result area | Disabled, no validation executed |
| Whole-stack controls | Start, Stop, Restart | Disabled |
| Recovery guidance | Host access, inspect project, restore stack, verify health | Guidance only, no command execution |
| Safety notes | Stack-stop outage warning, code-server exclusion, role model | Informational only |

The page does not fabricate resource values, service health, logs, or validation results. It does not contact the Host Agent or Docker. Disabled frontend controls are placeholders, not an authorization mechanism.

## 3. Approved initial functional scope

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

## 6. Future implementation checklist

- [ ] Define the Host Agent request/response contract for metrics, service health, bounded logs, Compose validation, and allowlisted operations.
- [ ] Implement host metrics with explicit units, sampling, and unavailable/error behavior.
- [ ] Implement health/status for Web, API, and PostgreSQL only.
- [ ] Implement bounded, redacted service log retrieval.
- [ ] Implement fixed-project Compose validation.
- [ ] Implement per-service start/stop/restart with timeouts, serialization, structured results, and audit events.
- [ ] Implement whole-stack start/stop/restart with the same controls and clear outage warnings.
- [ ] Enforce admin/user visibility and server-side authorization on every API operation.
- [ ] Add tests for authorization, allowlist enforcement, arbitrary-target rejection, log redaction/truncation, timeouts, and recovery after failures.
- [ ] Document host-side recovery procedures for when the stack is stopped and the GUI is unavailable.
- [ ] Verify desktop, tablet, and mobile browser presentation against the merged build.
- [ ] Review any expansion beyond the initial scope through a separate decision.

## 7. Acceptance criteria

The feature is not functionally complete until all of the following are true:

1. Monitoring values and service health come from the trusted host-side source, not hardcoded fixtures.
2. Only Web, API, and PostgreSQL can be queried or operated on by this feature.
3. Logs are bounded and sanitized.
4. Admin/user access behavior is enforced server-side, including denial of unauthenticated requests.
5. Operational actions are limited to the approved project/service allowlist and generate audit events.
6. Stack-stop recovery is documented and tested without relying on the GUI.
7. Failure, timeout, restart, and unavailable-host states are represented accurately.
8. Automated tests and browser acceptance pass, and exact results are recorded in the verification closeout.

## 8. Current verification limitation

Source inspection confirms the route, navigation item, page component, placeholder sections, and disabled actions are present on `main`. The user's screenshot of Application Settings did not display the new navigation item, so the running browser build has not been confirmed to include the merged commit. Browser verification, build/test reruns for PR #10, and production deployment are not recorded as complete. Do not treat the UI merge as functional monitoring or operational readiness.

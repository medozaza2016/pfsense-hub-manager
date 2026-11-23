import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feedback, Icon, Metric, Panel, Status, type IconName } from "../components/ui";
import { ApiRequestError, apiRequest } from "../lib/api";

/**
 * System Monitoring & Recovery.
 *
 * Read-only host monitoring is available to every signed-in manager user.
 * Operational controls and Compose validation are rendered only for
 * administrators, and the server independently enforces the same rule. When the
 * deployment has host monitoring switched off the page keeps its documented
 * preview geometry and never fabricates a value.
 */

export type RecoveryRole = "admin" | "user";

type HostServiceKey = "web" | "api" | "db";
type OperationTarget = HostServiceKey | "stack";
type OperationAction = "start" | "stop" | "restart";
type OperationState = "requested" | "running" | "succeeded" | "failed" | "unknown";

interface HostMetrics {
  cpuPercent: number | null;
  cpuCount: number | null;
  loadAverage: [number, number, number] | null;
  memoryPercent: number | null;
  memoryTotalBytes: number | null;
  memoryAvailableBytes: number | null;
  diskPercent: number | null;
  diskTotalBytes: number | null;
  diskFreeBytes: number | null;
  uptimeSeconds: number | null;
}

interface HostServiceState {
  service: HostServiceKey;
  containerName: string | null;
  state: "running" | "exited" | "paused" | "restarting" | "created" | "dead" | "missing" | "unknown";
  health: "healthy" | "unhealthy" | "starting" | "none";
  statusText: string | null;
  restartCount: number | null;
  startedAt: string | null;
}

interface OperationRecord {
  id: string;
  action: OperationAction;
  target: OperationTarget;
  state: OperationState;
  requestedAt: string;
  completedAt: string | null;
  verifiedAt: string | null;
  safeErrorCode: string | null;
  requestedBy: string | null;
}

interface SystemStatusView {
  host: HostMetrics;
  collectedAt: string;
  services: { available: boolean; errorCode: string | null; items: HostServiceState[] };
  agent: { reachable: true; protocolVersion: number };
  operationsEnabled: boolean;
  recentOperations: OperationRecord[];
}

interface LogsResult {
  state: "ok";
  service: HostServiceKey;
  lines: string[];
  truncated: boolean;
  discardedLines: number;
  collectedAt: string;
}

type ComposeValidationResult =
  | { state: "valid" }
  | { state: "invalid"; detail: string }
  | { state: "error"; errorCode: string };

interface PendingOperation {
  action: OperationAction;
  target: OperationTarget;
}

const STATUS_POLL_MS = 10_000;
const OPERATION_POLL_MS = 2_000;
const OPERATION_POLL_ATTEMPTS = 30;
const STACK_STOP_PHRASE = "STOP STACK";
const LOG_LINE_OPTIONS = [50, 100, 200, 500];

const SERVICES: { key: HostServiceKey; name: string; description: string; container: string; icon: IconName }[] = [
  { key: "web", name: "Web", description: "Frontend and reverse-proxy service", container: "pfsense-hub-manager-web", icon: "monitor" },
  { key: "api", name: "API", description: "Application API and host-agent integration", container: "pfsense-hub-manager-api", icon: "activity" },
  { key: "db", name: "PostgreSQL", description: "Application database", container: "pfsense-hub-manager-db", icon: "database" }
];

const ACTION_LABEL: Record<OperationAction, string> = { start: "Start", stop: "Stop", restart: "Restart" };
const TARGET_LABEL: Record<OperationTarget, string> = {
  web: "Web service",
  api: "API service",
  db: "PostgreSQL service",
  stack: "Hub Manager stack"
};
const OPERATION_STATE_LABEL: Record<OperationState, string> = {
  requested: "Requested",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  unknown: "Unknown"
};
const STATE_LABEL: Record<HostServiceState["state"], string> = {
  running: "Running",
  exited: "Stopped",
  paused: "Paused",
  restarting: "Restarting",
  created: "Created",
  dead: "Failed",
  missing: "Missing",
  unknown: "Unknown"
};
const HEALTH_LABEL: Record<HostServiceState["health"], string> = {
  healthy: "Healthy",
  unhealthy: "Unhealthy",
  starting: "Health check starting",
  none: "No health check"
};

/** Codes that mean "this deployment has the feature switched off", not "it broke". */
const DISABLED_CODES = new Set(["HOST_MONITORING_DISABLED", "HOST_AGENT_NOT_CONFIGURED", "HOST_AGENT_SOCKET_NOT_CONFIGURED"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : Math.round(value) + "%";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return (unit === 0 ? String(Math.round(value)) : value.toFixed(1)) + " " + units[unit];
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return days + "d " + hours + "h";
  if (hours > 0) return hours + "h " + minutes + "m";
  return minutes + "m";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function usageDetail(total: number | null, free: number | null): string {
  if (total === null) return "Total capacity unavailable";
  if (free === null) return formatBytes(total) + " total";
  return formatBytes(Math.max(0, total - free)) + " of " + formatBytes(total);
}

function dotTone(service: HostServiceState): "online" | "warning" | "offline" | "unknown" {
  if (service.state === "running") return service.health === "unhealthy" ? "warning" : "online";
  if (service.state === "restarting" || service.state === "created") return "warning";
  if (service.state === "exited" || service.state === "dead" || service.state === "missing" || service.state === "paused") return "offline";
  return "unknown";
}

function operationTone(state: OperationState): "online" | "warning" | "offline" | "unknown" {
  if (state === "succeeded") return "online";
  if (state === "failed") return "offline";
  if (state === "requested" || state === "running") return "warning";
  return "unknown";
}

function impactCopy(operation: PendingOperation): string {
  const label = TARGET_LABEL[operation.target];
  if (operation.action === "start") return "Docker Compose will start the " + label + ". The Host Agent verifies the resulting container state before the operation is recorded as succeeded.";
  if (operation.action === "restart") return "Docker Compose will restart the " + label + ". Expect a brief interruption while the container is stopped and started again.";
  return "Docker Compose will stop the " + label + ". Dependent services may become unavailable until it is started again.";
}


export function SystemRecoveryPage({ role }: { role: RecoveryRole }) {
  const [view, setView] = useState<SystemStatusView | null>(null);
  const [phase, setPhase] = useState<"loading" | "disabled" | "live" | "error">("loading");
  const [statusError, setStatusError] = useState("");
  const statusInFlight = useRef(false);

  const loadStatus = useCallback(async (silent: boolean) => {
    if (statusInFlight.current) return;
    statusInFlight.current = true;
    if (!silent) setPhase(current => current === "live" ? current : "loading");
    try {
      const status = await apiRequest<SystemStatusView>("/api/v1/system/status");
      setView(status);
      setStatusError("");
      setPhase("live");
    } catch (error) {
      const disabled = error instanceof ApiRequestError && error.status === 503 && error.code !== null && DISABLED_CODES.has(error.code);
      if (disabled) {
        setView(null);
        setStatusError("");
        setPhase("disabled");
      } else {
        setStatusError(errorMessage(error));
        setPhase("error");
      }
    } finally {
      statusInFlight.current = false;
    }
  }, []);

  useEffect(() => { void loadStatus(false); }, [loadStatus]);

  // Keep polling while a sample is shown, including after a transient refresh
  // failure, so the last successful sample is replaced as soon as the agent
  // answers again. Polling pauses while the browser tab is hidden.
  const keepPolling = phase === "live" || (phase === "error" && view !== null);
  useEffect(() => {
    if (!keepPolling) return;
    const tick = () => { if (document.visibilityState === "visible") void loadStatus(true); };
    const timer = window.setInterval(tick, STATUS_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [keepPolling, loadStatus]);

  const [logService, setLogService] = useState<HostServiceKey>("web");
  const [logLines, setLogLines] = useState(100);
  const [logs, setLogs] = useState<LogsResult | null>(null);
  const [logsError, setLogsError] = useState("");
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsFetchedAt, setLogsFetchedAt] = useState<string | null>(null);

  const loadLogs = useCallback(async (service: HostServiceKey, lines: number) => {
    setLogsBusy(true);
    setLogsError("");
    try {
      const result = await apiRequest<LogsResult>("/api/v1/system/services/" + service + "/logs?lines=" + lines);
      setLogs(result);
      setLogsFetchedAt(new Date().toISOString());
    } catch (error) {
      setLogs(null);
      setLogsFetchedAt(null);
      setLogsError(errorMessage(error));
    } finally {
      setLogsBusy(false);
    }
  }, []);

  const hasView = view !== null;
  useEffect(() => {
    if (phase === "live" || hasView) {
      if (phase === "live") void loadLogs(logService, logLines);
      return;
    }
    setLogs(null);
    setLogsError("");
    setLogsFetchedAt(null);
  }, [phase, hasView, logService, logLines, loadLogs]);

  const [validation, setValidation] = useState<ComposeValidationResult | null>(null);
  const [validationError, setValidationError] = useState("");
  const [validationBusy, setValidationBusy] = useState(false);

  async function runValidation(): Promise<void> {
    setValidationBusy(true);
    setValidationError("");
    try {
      setValidation(await apiRequest<ComposeValidationResult>("/api/v1/system/compose/validate", { method: "POST" }));
    } catch (error) {
      setValidation(null);
      setValidationError(errorMessage(error));
    } finally {
      setValidationBusy(false);
    }
  }

  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [operationNotice, setOperationNotice] = useState("");
  const [tracked, setTracked] = useState<OperationRecord | null>(null);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => () => { if (pollTimer.current !== null) window.clearTimeout(pollTimer.current); }, []);

  const pollOperation = useCallback(async (operationId: string, attempt: number): Promise<void> => {
    try {
      const record = await apiRequest<OperationRecord>("/api/v1/system/operations/" + encodeURIComponent(operationId));
      setTracked(record);
      if (record.state === "requested" || record.state === "running") {
        if (attempt < OPERATION_POLL_ATTEMPTS) pollTimer.current = window.setTimeout(() => void pollOperation(operationId, attempt + 1), OPERATION_POLL_MS);
      } else {
        await loadStatus(true);
      }
    } catch {
      // The API may be the service being restarted, so a transient transport
      // failure is expected here. Keep polling within the documented bound.
      if (attempt < OPERATION_POLL_ATTEMPTS) pollTimer.current = window.setTimeout(() => void pollOperation(operationId, attempt + 1), OPERATION_POLL_MS);
    }
  }, [loadStatus]);

  function requestOperation(action: OperationAction, target: OperationTarget): void {
    setOperationError("");
    setOperationNotice("");
    setConfirmText("");
    setPending({ action, target });
  }

  function dismissOperation(): void {
    if (operationBusy) return;
    setPending(null);
    setConfirmText("");
    setOperationError("");
  }

  async function submitOperation(): Promise<void> {
    if (!pending) return;
    setOperationBusy(true);
    setOperationError("");
    try {
      const body: Record<string, unknown> = { action: pending.action, target: pending.target };
      if (pending.action === "stop" && pending.target === "stack") body.confirmStackStop = true;
      const record = await apiRequest<OperationRecord>("/api/v1/system/operations", { method: "POST", body: JSON.stringify(body) });
      setPending(null);
      setConfirmText("");
      setTracked(record);
      setOperationNotice("Requested " + ACTION_LABEL[record.action] + " for " + TARGET_LABEL[record.target] + " at " + formatTimestamp(record.requestedAt) + ".");
      pollTimer.current = window.setTimeout(() => void pollOperation(record.id, 1), OPERATION_POLL_MS);
      await loadStatus(true);
    } catch (error) {
      setOperationError(errorMessage(error));
    } finally {
      setOperationBusy(false);
    }
  }

  const live = view !== null && phase !== "disabled";
  const host = view?.host ?? null;
  const serviceStates = view?.services.items ?? [];
  const operationsAvailable = phase === "live" && role === "admin" && Boolean(view?.operationsEnabled);
  // Per-service controls additionally require verified container state, so a
  // failed `docker ps` probe can never be papered over with an operation.
  const serviceOperationsAvailable = operationsAvailable && Boolean(view?.services.available);
  const operationsReason = role !== "admin"
    ? "Administrator permissions are required."
    : view === null
      ? "Connect host monitoring first."
      : phase !== "live"
        ? "Host monitoring is currently unavailable."
        : !view.operationsEnabled
          ? "Host operations are disabled for this deployment."
          : "";

  const recentOperations = useMemo(() => {
    const rows = [...(view?.recentOperations ?? [])];
    if (tracked) {
      const index = rows.findIndex(row => row.id === tracked.id);
      if (index >= 0) rows[index] = tracked;
      else rows.unshift(tracked);
    }
    return rows.slice(0, 5);
  }, [view, tracked]);

  const requiresTypedConfirmation = pending?.action === "stop" && pending.target === "stack";

  return (
    <>
      <div className="page-heading recovery-heading"><div><h1>System Monitoring &amp; Recovery</h1><p>Health and operational controls for the pfSense Hub Manager host and its Docker Compose stack</p></div><span className={"recovery-preview-label " + (live ? "live" : phase === "error" ? "error" : "preview")}>{live ? "LIVE HOST MONITORING" : phase === "error" ? "HOST AGENT UNAVAILABLE" : "UI PREVIEW · NOT CONNECTED"}</span></div>
      {phase === "disabled" && <div className="recovery-notice"><Icon name="alert" size={18}/><div><strong>Monitoring is not connected yet</strong><span>Values and service states are intentionally not fabricated. Host metrics, container health, and operational actions appear once this deployment is connected to the Host Agent.</span><button type="button" className="secondary-button" onClick={() => void loadStatus(false)}>Check connection</button></div></div>}
      {phase === "error" && !live && <div className="recovery-notice error" role="alert"><Icon name="alert" size={18}/><div><strong>Host monitoring is unavailable</strong><span>{statusError} Container values are not shown until the Host Agent answers again.</span><button type="button" className="secondary-button" onClick={() => void loadStatus(false)}>Retry now</button></div></div>}
      {phase === "error" && live && <div className="recovery-notice error" role="alert"><Icon name="alert" size={18}/><div><strong>Live refresh failed</strong><span>{statusError} Showing the last successful sample from {formatTimestamp(view?.collectedAt ?? null)}.</span></div></div>}

      <div className="recovery-section-heading"><div><h2>Host resources</h2><p>Resource utilization reported by the dedicated Hub host</p></div><span className="recovery-state">{live ? "Sampled " + formatTimestamp(view?.collectedAt ?? null) : "Awaiting host agent"}</span></div>
      <div className="metric-grid recovery-metrics">
        <Metric icon="cpu" label="CPU utilization" value={live ? formatPercent(host?.cpuPercent ?? null) : "—"} detail={live ? (host?.cpuCount ? host.cpuCount + " logical cores" : "Core count unavailable") : "No live data"} tone="blue"/>
        <Metric icon="database" label="Memory utilization" value={live ? formatPercent(host?.memoryPercent ?? null) : "—"} detail={live ? usageDetail(host?.memoryTotalBytes ?? null, host?.memoryAvailableBytes ?? null) : "No live data"} tone="green"/>
        <Metric icon="harddrive" label="Disk utilization" value={live ? formatPercent(host?.diskPercent ?? null) : "—"} detail={live ? usageDetail(host?.diskTotalBytes ?? null, host?.diskFreeBytes ?? null) : "No live data"} tone="purple"/>
        <Metric icon="clock" label="Host uptime" value={live ? formatUptime(host?.uptimeSeconds ?? null) : "—"} detail={live ? "Reported by the Host Agent" : "No live data"} tone="orange"/>
      </div>

      <Panel title="Docker Compose service health" className="recovery-panel">
        <div className="recovery-service-list">{SERVICES.map(service => {
          const state = serviceStates.find(item => item.service === service.key) ?? null;
          const tone = state ? dotTone(state) : "unknown";
          const label = state ? STATE_LABEL[state.state] : "Unknown";
          const detail = state
            ? (state.health === "none" ? state.statusText ?? "Docker state reported" : HEALTH_LABEL[state.health] + (state.statusText ? " · " + state.statusText : ""))
            : live ? "Container state unavailable" : "Not connected";
          return <div className="recovery-service" key={service.key}>
            <div className="recovery-service-main"><span className="recovery-service-icon"><Icon name={service.icon}/></span><div><strong>{service.name}</strong><small>{service.description}</small><code>{state?.containerName ?? service.container}</code></div></div>
            <div className="recovery-service-status"><span className={"recovery-status-dot " + tone}/><strong>{label}</strong><small>{detail}</small></div>
            <div className="recovery-service-actions">{(["start", "stop", "restart"] as const).map(action => <button key={action} type="button" className="secondary-button" disabled={!serviceOperationsAvailable || operationBusy} title={operationsReason || (!view?.services.available ? "Container state must be verified before a service operation is available." : "Runs the fixed allowlisted operation for this service.")} onClick={() => requestOperation(action, service.key)}>{ACTION_LABEL[action]}</button>)}</div>
          </div>;
        })}</div>
        {live && view && !view.services.available && <p className="recovery-warning"><Icon name="alert" size={15}/> Docker container state is unavailable{view.services.errorCode ? " (" + view.services.errorCode + ")" : ""}. Host resource metrics remain live, and service controls stay disabled without verified container state.</p>}
        <p className="recovery-footnote">The browser-based code-server service is intentionally excluded from the monitoring and operations allowlist.</p>
      </Panel>

      <div className="recovery-two-column">
        <Panel title="Service logs" className="recovery-panel">
          <div className="recovery-inline-toolbar">
            <span>Service</span>
            <select value={logService} disabled={!live || logsBusy} aria-label="Log service" onChange={event => setLogService(event.target.value as HostServiceKey)}>{SERVICES.map(service => <option key={service.key} value={service.key}>{service.name}</option>)}</select>
            <select value={logLines} disabled={!live || logsBusy} aria-label="Log line count" onChange={event => setLogLines(Number(event.target.value))}>{LOG_LINE_OPTIONS.map(option => <option key={option} value={option}>Last {option} lines</option>)}</select>
            <button type="button" className="secondary-button" disabled={!live || logsBusy} onClick={() => void loadLogs(logService, logLines)}>{logsBusy ? "Loading…" : "Refresh logs"}</button>
          </div>
          {!live
            ? <div className="recovery-empty-state"><Icon name="file" size={22}/><strong>Logs are not available</strong><span>Connect the host-side agent to retrieve scoped service logs.</span></div>
            : logsError
              ? <div className="recovery-empty-state"><Icon name="alert" size={22}/><strong>Logs are unavailable</strong><span>{logsError}</span></div>
              : !logs
                ? <div className="recovery-empty-state"><Icon name="file" size={22}/><strong>{logsBusy ? "Retrieving logs" : "No logs requested"}</strong><span>Select a service to load its scoped log output.</span></div>
                : logs.lines.length === 0
                  ? <div className="recovery-empty-state"><Icon name="file" size={22}/><strong>No log lines returned</strong><span>The container has produced no output for this request.</span></div>
                  : <pre className="recovery-log-view">{logs.lines.join("\n")}</pre>}
          {live && logs && <p className="recovery-footnote">Retrieved {formatTimestamp(logsFetchedAt)} · {logs.lines.length} line{logs.lines.length === 1 ? "" : "s"}{logs.truncated ? " · output was truncated at the agent limit" : ""}{logs.discardedLines > 0 ? " · " + logs.discardedLines + " line(s) withheld by the redaction rules" : ""}</p>}
        </Panel>
        <Panel title="Compose configuration" className="recovery-panel">
          <div className="recovery-config-row">
            <div><strong>Configuration validation</strong><span>Validate the approved project Compose configuration</span></div>
            {role === "admin"
              ? <button type="button" className="secondary-button" disabled={!operationsAvailable || validationBusy} title={operationsReason || "Validates the fixed project Compose file on the host."} onClick={() => void runValidation()}>{validationBusy ? "Validating…" : "Validate configuration"}</button>
              : <span className="recovery-preview-label">ADMINISTRATOR ONLY</span>}
          </div>
          {validationError
            ? <div className="recovery-empty-state compact"><Icon name="alert" size={21}/><strong>Validation could not be completed</strong><span>{validationError}</span></div>
            : !validation
              ? <div className="recovery-empty-state compact"><Icon name="check" size={21}/><strong>No validation has been run</strong><span>{role === "admin" ? "Run validation to check the approved Compose file before any stack action." : "Administrators can validate the approved Compose configuration."}</span></div>
              : validation.state === "valid"
                ? <div className="recovery-empty-state compact"><Icon name="check" size={21}/><strong>Configuration is valid</strong><span>The approved project Compose file passed validation on the host.</span></div>
                : validation.state === "invalid"
                  ? <div className="recovery-empty-state compact"><Icon name="alert" size={21}/><strong>Configuration is invalid</strong><span>{validation.detail}</span></div>
                  : <div className="recovery-empty-state compact"><Icon name="alert" size={21}/><strong>Validation was refused</strong><span>{validation.errorCode}</span></div>}
        </Panel>
      </div>

      {operationNotice && <Feedback tone="success">{operationNotice}</Feedback>}

      <Panel title="Stack operations" className="recovery-panel recovery-stack-panel">
        <div><strong>Docker Compose stack</strong><span>Start, restart, or stop every monitored service through the allowlisted Compose project. The Host Agent verifies the resulting container state before an operation is recorded as succeeded.</span>{operationsReason && <span>{operationsReason}</span>}</div>
        <div className="recovery-stack-actions">
          <button type="button" className="secondary-button" disabled={!operationsAvailable || operationBusy} title={operationsReason || "Starts the monitored services in the allowlisted Compose project."} onClick={() => requestOperation("start", "stack")}>Start stack</button>
          <button type="button" className="secondary-button" disabled={!operationsAvailable || operationBusy} title={operationsReason || "Restarts the monitored services in the allowlisted Compose project."} onClick={() => requestOperation("restart", "stack")}>Restart stack</button>
          <button type="button" className="recovery-danger-button" disabled={!operationsAvailable || operationBusy} title={operationsReason || "Stops the monitored services and requires typed confirmation."} onClick={() => requestOperation("stop", "stack")}>Stop stack</button>
        </div>
        <p className="recovery-footnote">Stopping the stack stops the API and the web interface, so manager access returns only after the stack is started again from the host console. A stack stop always requires the typed confirmation phrase.</p>
      </Panel>

      <Panel title="Recent operations" className="recovery-panel">
        {recentOperations.length === 0
          ? <div className="recovery-empty-state compact"><Icon name="activity" size={21}/><strong>No operations recorded</strong><span>{live ? "Operational activity appears here after an administrator runs a service or stack action." : "Operations stay unavailable until host monitoring is connected."}</span></div>
          : <div className="recovery-operation-list">{recentOperations.map(operation => <div className="recovery-operation" key={operation.id}>
              <div className="recovery-operation-main"><strong>{ACTION_LABEL[operation.action]} · {TARGET_LABEL[operation.target]}</strong><small>{formatTimestamp(operation.requestedAt)}{operation.requestedBy ? " · " + operation.requestedBy : ""}{operation.verifiedAt ? " · verified " + formatTimestamp(operation.verifiedAt) : ""}</small>{operation.safeErrorCode && <small className="recovery-operation-code">{operation.safeErrorCode}</small>}</div>
              <Status state={operationTone(operation.state)} label={OPERATION_STATE_LABEL[operation.state]}/>
            </div>)}</div>}
        <p className="recovery-footnote">Operation records are written to the server-side audit journal. Container command output is never returned to the browser.</p>
      </Panel>

      <Panel title="Recovery guidance" className="recovery-panel">
        <ol className="recovery-steps">
          <li><strong>Confirm the affected service</strong><span>Read the container state and the scoped logs before changing anything. A restarting container is not the same as a failed one.</span></li>
          <li><strong>Validate the Compose configuration</strong><span>Run validation after any Compose or environment change. An invalid configuration is reported before a stack action fails mid-restart.</span></li>
          <li><strong>Prefer the narrowest operation</strong><span>Restart a single service when only that service is unhealthy. Use stack operations when the API and web services must agree.</span></li>
          <li><strong>Verify the recorded outcome</strong><span>An operation is only recorded as succeeded after the Host Agent re-reads the container state, so a pending record is not a failure.</span></li>
        </ol>
        <p className="recovery-security-note">These controls act on the pfSense Hub Manager host only. They never modify pfSense firewall configuration, and every request is authorized server-side against your role before the agent is contacted.</p>
      </Panel>

      {pending && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) dismissOperation(); }}>
        <section className="modal recovery-confirm" role="dialog" aria-modal="true" aria-labelledby="recovery-confirm-title">
          <button type="button" className="modal-close" aria-label="Close" disabled={operationBusy} onClick={dismissOperation}><Icon name="close"/></button>
          <span className="eyebrow">HOST OPERATION</span>
          <h2 id="recovery-confirm-title">{ACTION_LABEL[pending.action]} {TARGET_LABEL[pending.target].toLowerCase()}</h2>
          <p className="recovery-confirm-impact">{impactCopy(pending)}</p>
          {requiresTypedConfirmation && <label className="recovery-confirm-field"><span>Type <code>{STACK_STOP_PHRASE}</code> to confirm this stop</span><input value={confirmText} autoComplete="off" spellCheck={false} placeholder={STACK_STOP_PHRASE} onChange={event => setConfirmText(event.target.value)}/></label>}
          {operationError && <Feedback tone="error">{operationError}</Feedback>}
          <p className="recovery-security-note">The manager records the actor, target, action, timestamp, and outcome in the audit trail. Nothing on the pfSense firewalls is changed.</p>
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={operationBusy} onClick={dismissOperation}>Cancel</button>
            <button type="button" className={requiresTypedConfirmation ? "recovery-danger-button" : "primary-button"} disabled={operationBusy || (requiresTypedConfirmation && confirmText.trim().toUpperCase() !== STACK_STOP_PHRASE)} onClick={() => void submitOperation()}>{operationBusy ? "Submitting…" : "Confirm " + ACTION_LABEL[pending.action].toLowerCase()}</button>
          </div>
        </section>
      </div>}
    </>
  );
}


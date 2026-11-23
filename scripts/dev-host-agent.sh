#!/usr/bin/env bash
# Unprivileged development harness for the restricted Host Agent.
#
# This script never uses sudo, never installs a systemd unit, and never touches
# /opt/pfsense-hub or /etc/pfsense-hub. It runs the same agent binary as root
# does, against the developer's own checkout and configuration, so Hub access
# deployment can be exercised locally. Production must keep using
# host-agent/install-linux.sh and the systemd unit.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd -P)"
PROJECT_DIR="$(dirname -- "$SCRIPT_DIR")"
AGENT="$PROJECT_DIR/host-agent/pfsense_hub_agent.py"
CONFIG="${PFSENSE_HUB_DEV_AGENT_CONFIG:-$HOME/.config/pfsense-hub/deployment-agent.json}"
STATE_DIR="$PROJECT_DIR/run/host-agent"
SOCKET="$STATE_DIR/agent.sock"
LOG="$STATE_DIR/agent.log"
PID_FILE="$STATE_DIR/agent.pid"

usage() {
  cat <<'USAGE'
Usage: bash scripts/dev-host-agent.sh <start|stop|restart|status|logs>

Runs the restricted Host Agent as the current unprivileged account against this
checkout. The configuration must be created by the local installer:
  bash scripts/install-linux.sh --local --with-agent

Environment:
  PFSENSE_HUB_DEV_AGENT_CONFIG  Configuration path (default ~/.config/pfsense-hub/deployment-agent.json)
USAGE
}

fail() {
  echo "Host Agent: $1" >&2
  exit 1
}

# Read a process command line without leaking race noise when a process exits
# between the /proc listing and the read.
read_cmdline() {
  { tr -d '\0' < "/proc/$1/cmdline"; } 2>/dev/null || true
}

# Identify the running agent by its exact command line, not by the pid file
# alone: the process detaches into its own session, so the pid file can be lost
# while the agent is still running, and a stale pid file would otherwise make
# this harness delete a live agent's socket.
scan_pid() {
  local dir=""
  local pid=""
  local cmdline=""
  for dir in /proc/[0-9]*; do
    pid="${dir#/proc/}"
    [[ "$pid" == "$$" ]] && continue
    cmdline="$(read_cmdline "$pid")"
    [[ -n "$cmdline" ]] || continue
    case "$cmdline" in
      *pfsense_hub_agent.py*--config*"$CONFIG"*) echo "$pid"; return 0 ;;
    esac
  done
  return 0
}

detect_pid() {
  local pid=""
  local cmdline=""
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    cmdline="$(read_cmdline "$pid")"
    if [[ "$cmdline" == *pfsense_hub_agent.py* ]]; then
      echo "$pid"
      return 0
    fi
  fi
  pid="$(scan_pid)"
  if [[ -n "$pid" ]]; then
    mkdir -p "$STATE_DIR"
    echo "$pid" > "$PID_FILE" 2>/dev/null || true
    echo "$pid"
  fi
  return 0
}

start_agent() {
  [[ -f "$AGENT" ]] || fail "Agent source not found at $AGENT."
  [[ -f "$CONFIG" && ! -L "$CONFIG" ]] \
    || fail "No development agent configuration at $CONFIG. Run: bash $SCRIPT_DIR/install-linux.sh --local --with-agent"
  [[ "$EUID" -ne 0 ]] \
    || fail "Run this script as your own account, not as root. Production uses the systemd unit."

  local existing
  existing="$(detect_pid)"
  if [[ -n "$existing" ]]; then
    echo "Host Agent already running (pid $existing)."
    return 0
  fi

  mkdir -p "$STATE_DIR"
  chmod 0755 "$STATE_DIR"
  rm -f "$SOCKET" "$PID_FILE"
  : > "$LOG"
  # setsid puts the agent in its own session and process group. Without it the
  # agent inherits the launching shell's process group and dies when that
  # terminal or tool session is torn down, leaving a stale socket that makes the
  # API report HOST_AGENT_UNAVAILABLE.
  if command -v setsid >/dev/null 2>&1; then
    setsid /usr/bin/python3 "$AGENT" --config "$CONFIG" >>"$LOG" 2>&1 </dev/null &
  else
    nohup /usr/bin/python3 "$AGENT" --config "$CONFIG" >>"$LOG" 2>&1 </dev/null &
  fi

  local agent_pid=""
  local attempt
  for attempt in $(seq 1 20); do
    agent_pid="$(detect_pid)"
    if [[ -n "$agent_pid" && -S "$SOCKET" ]]; then
      echo "Host Agent started (pid $agent_pid)."
      echo "Socket: $SOCKET"
      echo "Log:    $LOG"
      return 0
    fi
    sleep 0.5
  done
  tail -n 20 "$LOG" >&2 || true
  rm -f "$PID_FILE"
  if grep -q 'AGENT_PROJECT_PERMISSIONS_INVALID' "$LOG" 2>/dev/null; then
    echo "The agent refuses group/world-writable project files. Fix with:" >&2
    echo "  chmod g-w,o-w \"$PROJECT_DIR\" \"$PROJECT_DIR/compose.yaml\"" >&2
  fi
  fail "The Host Agent did not create its socket. See the log above."
}

stop_agent() {
  local pid
  pid="$(detect_pid)"
  if [[ -z "$pid" ]]; then
    # A socket without a live agent is stale: the API would report
    # HOST_AGENT_UNAVAILABLE for a Hub that simply has no agent running.
    rm -f "$PID_FILE" "$SOCKET"
    echo "Host Agent is not running."
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  local attempt
  for attempt in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE" "$SOCKET"
      echo "Host Agent stopped."
      return 0
    fi
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE" "$SOCKET"
  echo "Host Agent stopped."
}

show_status() {
  local pid
  pid="$(detect_pid)"
  if [[ -n "$pid" ]]; then
    echo "Host Agent: running (pid $pid)"
  else
    echo "Host Agent: stopped"
  fi
  if [[ -f "$CONFIG" ]]; then
    echo "Configuration: $CONFIG"
  else
    echo "Configuration: missing ($CONFIG)"
  fi
  if [[ -S "$SOCKET" ]]; then
    if [[ -n "$pid" ]]; then
      echo "Socket: present ($(stat -c '%U:%G %a' "$SOCKET"))"
    else
      echo "Socket: stale, no agent process ($(stat -c '%U:%G %a' "$SOCKET"))"
      echo "        Start it with: bash $0 start"
    fi
  else
    echo "Socket: missing"
  fi
}

case "${1:-}" in
  start) start_agent ;;
  stop) stop_agent ;;
  restart) stop_agent; start_agent ;;
  status) show_status ;;
  logs)
    [[ -f "$LOG" ]] || fail "No log file at $LOG."
    tail -n 50 -f "$LOG"
    ;;
  -h|--help|help|"") usage ;;
  *) usage >&2; fail "Unknown command: $1" ;;
esac

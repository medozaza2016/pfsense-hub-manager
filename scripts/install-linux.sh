#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

MODE="production"
WITH_AGENT="false"
TARGET_UID=""
TARGET_GID=""

usage() {
  cat <<'USAGE'
Usage:
  sudo bash scripts/install-linux.sh                    Production install from a root-owned /opt/pfsense-hub checkout.
  bash scripts/install-linux.sh --local                 Unprivileged local development install from any checkout path.
  bash scripts/install-linux.sh --local --with-agent    Local development install plus the unprivileged development Host Agent.
  bash scripts/install-linux.sh --help                  Show this help.

Modes:
  production  Installs the Hub and the privileged Linux systemd Host Agent. Requires root, systemd,
              and a root-owned, non-group/world-writable checkout at /opt/pfsense-hub.
  local       Builds and starts the Hub with Docker Compose only. No Host Agent, no systemd changes,
              no root-owned files, and HUB_ACCESS_DEPLOYMENT_ENABLED stays false.

Options:
  --with-agent  Local mode only. Runs the restricted Host Agent as your own unprivileged account
                against this checkout so GUI-managed Hub access can be exercised without root.
                Uses ~/.config/pfsense-hub/deployment-agent.json and scripts/dev-host-agent.sh.
                Never installs a systemd unit and never writes to /etc or /opt.
USAGE
}

fail() {
  echo "Installation stopped: $1" >&2
  exit 1
}

for argument in "$@"; do
  case "$argument" in
    --local|--dev) MODE="local" ;;
    --with-agent) WITH_AGENT="true" ;;
    -h|--help) usage; exit 0 ;;
    *)
      usage >&2
      fail "Unknown argument: $argument. Use --local for a development install or --help for usage."
      ;;
  esac
done

if [[ "$MODE" == "production" && "$WITH_AGENT" == "true" ]]; then
  fail "--with-agent is only supported with --local. The production installer installs the privileged systemd Host Agent automatically."
fi

# Resolve the checkout from this script so any working directory works.
SCRIPT_DIR="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd -P)"
PROJECT_DIR="$(dirname -- "$SCRIPT_DIR")"
PRODUCTION_PROJECT_DIR="/opt/pfsense-hub"
AGENT_SERVICE="pfsense-hub-deployment-agent.service"
AGENT_CONFIG="/etc/pfsense-hub/deployment-agent.json"
POSTGRES_VOLUME="pfsense-hub_postgres_data"

[[ ! -L "$PROJECT_DIR" ]] || fail "$PROJECT_DIR must not be a symbolic link."
[[ -f "$PROJECT_DIR/compose.yaml" ]] || fail "Expected a pfSense Hub Manager checkout; $PROJECT_DIR/compose.yaml is missing."
[[ -f "$PROJECT_DIR/.env.example" ]] || fail "Expected a pfSense Hub Manager checkout; $PROJECT_DIR/.env.example is missing."
[[ -d "$PROJECT_DIR/apps" ]] || fail "Expected a pfSense Hub Manager checkout; $PROJECT_DIR/apps is missing."
cd "$PROJECT_DIR"

if [[ "$MODE" == "production" && "$PROJECT_DIR" != "$PRODUCTION_PROJECT_DIR" ]]; then
  cat >&2 <<EOF
Installation stopped: this checkout is $PROJECT_DIR.

The production installer requires a root-owned checkout at $PRODUCTION_PROJECT_DIR because it
installs a privileged systemd Host Agent that can change how the Hub is published.

For local development from this checkout, run without sudo:
  bash $SCRIPT_DIR/install-linux.sh --local

For a production installation, clone the repository as root:
  sudo git clone --branch main --single-branch https://github.com/medozaza2016/pfsense-hub-manager.git $PRODUCTION_PROJECT_DIR
  sudo bash $PRODUCTION_PROJECT_DIR/scripts/install-linux.sh
EOF
  exit 1
fi

if [[ "$MODE" == "production" ]]; then
  if [[ "$EUID" -ne 0 ]]; then
    fail "Run the production installer with sudo: sudo bash $SCRIPT_DIR/install-linux.sh"
  fi
  for command_name in docker openssl python3 git systemctl ip groupadd getent stat install; do
    command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name."
  done
  [[ -d /run/systemd/system ]] || fail "A systemd-based Linux host is required."
  python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' || fail "Python 3.10 or newer is required."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
  docker info >/dev/null 2>&1 || fail "Docker Engine is unavailable. Start Docker and retry."
else
  if [[ "$EUID" -eq 0 ]]; then
    [[ -n "${SUDO_USER:-}" && -n "${SUDO_UID:-}" && -n "${SUDO_GID:-}" ]] \
      || fail "Do not run the local installer as root. Run it as your own account: bash $SCRIPT_DIR/install-linux.sh --local"
    TARGET_UID="$SUDO_UID"
    TARGET_GID="$SUDO_GID"
  else
    TARGET_UID="$(id -u)"
    TARGET_GID="$(id -g)"
  fi
  for command_name in docker openssl stat install; do
    command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name."
  done
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
  docker info >/dev/null 2>&1 \
    || fail "Docker Engine is unavailable to this account. Add the account to the docker group and log in again, or start Docker and retry."
  checkout_owner="$(stat -c '%u' "$PROJECT_DIR")"
  [[ "$checkout_owner" == "$TARGET_UID" ]] \
    || fail "The local checkout at $PROJECT_DIR is owned by UID $checkout_owner, not by the account running this installer (UID $TARGET_UID)."
fi

if [[ "$MODE" == "production" ]]; then
  for trusted_path in \
    "$PROJECT_DIR" \
    "$PROJECT_DIR/compose.yaml" \
    "$PROJECT_DIR/host-agent" \
    "$PROJECT_DIR/host-agent/pfsense_hub_agent.py" \
    "$PROJECT_DIR/host-agent/pfsense-hub-deployment-agent.service" \
    "$PROJECT_DIR/host-agent/install-linux.sh"; do
    [[ ! -L "$trusted_path" ]] || fail "$trusted_path must not be a symbolic link."
    [[ "$(stat -c '%u:%g' "$trusted_path")" == "0:0" ]] || fail "$trusted_path must be owned by root:root."
    trusted_mode="$(stat -c '%a' "$trusted_path")"
    (( (8#$trusted_mode & 0022) == 0 )) || fail "$trusted_path must not be group/world writable."
  done

  git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || fail "The project directory must be a Git checkout."
  git_commit="$(git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" rev-parse --short HEAD)"

  existing_state_paths=(
    "$PROJECT_DIR/.env"
    "$PROJECT_DIR/secrets/pfsense_api_key"
    "$PROJECT_DIR/secrets/runtime/app_encryption_key"
    "$AGENT_CONFIG"
    "/etc/systemd/system/$AGENT_SERVICE"
  )
else
  if git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git_commit="$(git -c safe.directory="$PROJECT_DIR" -C "$PROJECT_DIR" rev-parse --short HEAD)"
  else
    git_commit="not a Git checkout"
  fi

  existing_state_paths=(
    "$PROJECT_DIR/.env"
    "$PROJECT_DIR/secrets/pfsense_api_key"
    "$PROJECT_DIR/secrets/runtime/app_encryption_key"
  )
fi

existing_install_stop() {
  local detected="$1"
  {
    echo "Installation stopped: existing installation state detected at $detected."
    echo
    echo "Nothing was changed. This installer never overwrites existing secrets, Compose containers,"
    echo "or the PostgreSQL volume, because the runtime application encryption key and the database"
    echo "contents cannot be recreated without losing encrypted data."
    echo
    echo "To keep the installation that is already here, do not rerun the installer:"
    echo "  docker compose up -d            # add --build to rebuild images after a git pull"
    echo "  docker compose ps               # wait for db, api, and web to report healthy"
    echo "  Hub UI: http://127.0.0.1:8080"
    echo "  Logs:   docker compose logs -f"
    echo
    echo "To deliberately replace it, all existing Hub data is destroyed:"
    echo "  docker compose down -v          # -v deletes the $POSTGRES_VOLUME volume"
    echo "  rm -f .env"
    echo "  rm -rf secrets certs run"
    if [[ "$MODE" == "production" ]]; then
      echo "  sudo systemctl disable --now $AGENT_SERVICE"
      echo "  sudo rm -f /etc/systemd/system/$AGENT_SERVICE $AGENT_CONFIG"
      echo "  sudo systemctl daemon-reload"
      echo "  sudo bash $SCRIPT_DIR/install-linux.sh"
    else
      echo "  bash $SCRIPT_DIR/install-linux.sh --local"
    fi
    echo
    echo "See docs/DEPLOYMENT.md for the supported recovery procedure."
  } >&2
  exit 1
}

wait_for_healthy() {
  local service="$1"
  local container_id=""
  local state=""
  for attempt in $(seq 1 60); do
    container_id="$(docker compose ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$state" == "healthy" ]]; then
        echo "  $service: healthy"
        return 0
      fi
      if [[ "$state" == "unhealthy" || "$state" == "exited" || "$state" == "dead" ]]; then
        docker compose logs --tail=80 "$service" >&2 || true
        return 1
      fi
    fi
    sleep 2
  done
  docker compose logs --tail=80 "$service" >&2 || true
  return 1
}

install_dev_agent() {
  [[ "$MODE" == "local" ]] || fail "--with-agent is only supported together with --local."
  [[ -f "$PROJECT_DIR/.env" && ! -L "$PROJECT_DIR/.env" ]] \
    || fail "Create the local installation first: bash $SCRIPT_DIR/install-linux.sh --local"
  [[ -n "$(docker compose ps -q api 2>/dev/null)" ]] \
    || fail "Start the Hub first: docker compose up -d"

  local env_owner env_mode
  env_owner="$(stat -c '%u:%g' "$PROJECT_DIR/.env")"
  env_mode="$(stat -c '%a' "$PROJECT_DIR/.env")"
  [[ "$env_owner" == "$TARGET_UID:$TARGET_GID" ]] \
    || fail ".env must be owned by $TARGET_UID:$TARGET_GID for the unprivileged development Host Agent."
  if (( (8#$env_mode & 0077) != 0 )); then
    fail ".env must not be accessible to group or other users (mode 0600)."
  fi
  local trusted_path trusted_mode
  for trusted_path in "$PROJECT_DIR" "$PROJECT_DIR/compose.yaml"; do
    [[ "$(stat -c '%u:%g' "$trusted_path")" == "$TARGET_UID:$TARGET_GID" ]] \
      || fail "$trusted_path must be owned by $TARGET_UID:$TARGET_GID for the development Host Agent."
    trusted_mode="$(stat -c '%a' "$trusted_path")"
    if (( (8#$trusted_mode & 0022) != 0 )); then
      fail "$trusted_path must not be group/world writable. Fix it with: chmod g-w,o-w \"$PROJECT_DIR\" \"$PROJECT_DIR/compose.yaml\""
    fi
  done

  local target_home config_dir config_file tailscale_binary docker_binary ip_binary
  target_home="$(getent passwd "$TARGET_UID" | cut -d: -f6)"
  [[ -n "$target_home" && -d "$target_home" ]] || fail "Unable to resolve a home directory for UID $TARGET_UID."
  config_dir="$target_home/.config/pfsense-hub"
  config_file="$config_dir/deployment-agent.json"
  [[ ! -L "$config_dir" && ! -L "$config_file" ]] || fail "$config_file must not be a symbolic link."
  mkdir -p "$config_dir"
  chmod 0700 "$config_dir"
  if [[ "$EUID" -eq 0 ]]; then
    chown "$TARGET_UID:$TARGET_GID" "$config_dir"
  fi
  tailscale_binary="$(command -v tailscale || true)"
  docker_binary="$(command -v docker)"
  ip_binary="$(command -v ip)"

  echo "  Configuring the unprivileged development Host Agent for $(id -nu "$TARGET_UID")."
  /usr/bin/python3 - "$PROJECT_DIR/.env" "$config_file" "$TARGET_UID" "$TARGET_GID" \
    "$PROJECT_DIR" "$tailscale_binary" "$docker_binary" "$ip_binary" <<'PY'
import json, os, re, secrets, stat, sys, tempfile

env_path, config_path, uid, gid, project, tailscale_binary, docker_binary, ip_binary = sys.argv[1:]
uid, gid = int(uid), int(gid)
required = (
    "HUB_DEPLOYMENT_AGENT_TOKEN",
    "HUB_DEPLOYMENT_AGENT_SOCKET",
    "HUB_AGENT_GID",
    "HUB_ACCESS_DEPLOYMENT_ENABLED",
)
metadata = os.lstat(env_path)
if not stat.S_ISREG(metadata.st_mode) or (metadata.st_uid, metadata.st_gid) != (uid, gid):
    raise SystemExit(".env must be a regular file owned by the installing account.")
if stat.S_IMODE(metadata.st_mode) & 0o077:
    raise SystemExit(".env must not be accessible to group or other users.")
lines = open(env_path, encoding="utf-8").read().splitlines()
values = {}
for line in lines:
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    key, value = line.split("=", 1)
    values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
missing = [key for key in required if key not in values]
if missing:
    raise SystemExit("Missing .env settings: " + ", ".join(missing))
token = values["HUB_DEPLOYMENT_AGENT_TOKEN"]
if not token:
    token = secrets.token_urlsafe(32)
if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", token):
    raise SystemExit("HUB_DEPLOYMENT_AGENT_TOKEN must be a 32 to 256 character URL-safe token.")
port = values.get("HUB_AGENT_API_PORT", "3001")
if not re.fullmatch(r"[0-9]{1,5}", port) or not 1 <= int(port) <= 65535:
    raise SystemExit("HUB_AGENT_API_PORT must be a valid TCP port.")
updates = {
    "HUB_DEPLOYMENT_AGENT_TOKEN": token,
    "HUB_DEPLOYMENT_AGENT_SOCKET": "/run/pfsense-hub/agent.sock",
    "HUB_AGENT_GID": str(gid),
    "HUB_ACCESS_DEPLOYMENT_ENABLED": "true",
}
updated = []
for line in lines:
    key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
    updated.append(f"{key}={updates[key]}" if key in updates else line)
fd, temporary = tempfile.mkstemp(prefix=".env-agent-", dir=os.path.dirname(env_path))
try:
    os.fchmod(fd, 0o600)
    if os.geteuid() == 0:
        os.fchown(fd, uid, gid)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write("\n".join(updated) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, env_path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
config = {
    "api_base_url": f"http://127.0.0.1:{port}",
    "api_token": token,
    "socket_path": os.path.join(project, "run/host-agent/agent.sock"),
    "tailscale_binary": tailscale_binary,
    "docker_binary": docker_binary,
    "ip_binary": ip_binary,
    "project_dir": project,
    "compose_file": os.path.join(project, "compose.yaml"),
    "env_file": os.path.join(project, ".env"),
    "web_local_url": "http://127.0.0.1:8080",
    "socket_gid": gid,
    "lock_path": os.path.join(project, "run/host-agent/deployment.lock"),
}
fd, temporary = tempfile.mkstemp(prefix=".deployment-agent-", dir=os.path.dirname(config_path))
try:
    os.fchmod(fd, 0o600)
    if os.geteuid() == 0:
        os.fchown(fd, uid, gid)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(config, stream)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, config_path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

  bash "$SCRIPT_DIR/dev-host-agent.sh" start
  echo "  Recreating only the API container so it reads the new token and socket mount..."
  docker compose up -d --no-deps api
  wait_for_healthy api || fail "The API did not become healthy with the development Host Agent configured."
  docker compose exec -T api node <<'NODE'
const fs = require("node:fs");
const net = require("node:net");
const path = "/run/pfsense-hub/agent.sock";
const metadata = fs.statSync(path);
if (!metadata.isSocket()) {
  throw new Error("Host Agent socket is missing or is not a Unix socket.");
}
if (metadata.uid !== process.getuid() && !process.getgroups().includes(metadata.gid)) {
  throw new Error("The API process cannot access the Host Agent socket.");
}
const socket = net.createConnection({ path });
let buffer = "";
let finished = false;
const timeout = setTimeout(() => fail("Host Agent socket request timed out."), 12000);
function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.error(message);
  socket.destroy();
  process.exitCode = 1;
}
socket.once("connect", () => {
  socket.write(JSON.stringify({
    protocolVersion: 1,
    deploymentId: "00000000-0000-4000-8000-000000000000",
    desiredRevision: 1
  }) + "\n");
});
socket.on("data", chunk => {
  buffer += chunk.toString("utf8");
  const newline = buffer.indexOf("\n");
  if (newline < 0 || finished) return;
  try {
    const response = JSON.parse(buffer.slice(0, newline));
    if (response.state !== "failed" || response.errorCode !== "STALE_DEPLOYMENT") {
      fail("Host Agent replied, but bearer-authenticated API retrieval was not verified: " + JSON.stringify(response));
      return;
    }
    finished = true;
    clearTimeout(timeout);
    console.log("Host Agent socket, socket ownership, and API bearer authentication verified.");
    socket.end();
  } catch {
    fail("Host Agent returned an invalid response.");
  }
});
socket.once("error", error => fail("Unable to connect to Host Agent socket: " + error.message));
NODE
  echo "  Development Host Agent verified. Stop it with: bash $SCRIPT_DIR/dev-host-agent.sh stop"
}

if [[ "$MODE" == "local" && "$WITH_AGENT" == "true" && -f "$PROJECT_DIR/.env" ]]; then
  echo
  echo "DEVELOPMENT HOST AGENT (EXISTING LOCAL INSTALLATION)"
  echo "Checkout: $PROJECT_DIR"
  install_dev_agent
  echo
  echo "Development Host Agent installation completed."
  echo "Hub UI: http://127.0.0.1:8080"
  echo "Mode: local development with an unprivileged Host Agent. No systemd unit and no root-owned files were created."
  exit 0
fi

for existing_path in "${existing_state_paths[@]}"; do
  [[ ! -e "$existing_path" && ! -L "$existing_path" ]] || existing_install_stop "$existing_path"
done

if docker volume inspect "$POSTGRES_VOLUME" >/dev/null 2>&1; then
  existing_install_stop "the named PostgreSQL volume $POSTGRES_VOLUME"
fi
existing_containers="$(docker ps -aq --filter label=com.docker.compose.project=pfsense-hub)"
[[ -z "$existing_containers" ]] || existing_install_stop "Compose project pfsense-hub containers"

DB_PASSWORD="$(openssl rand -hex 32)"
APP_KEY="$(openssl rand -hex 32)"
if [[ "$MODE" == "production" ]]; then
  AGENT_TOKEN="$(openssl rand -hex 32)"
  trap 'unset DB_PASSWORD APP_KEY AGENT_TOKEN recovery_confirm 2>/dev/null || true' EXIT
else
  trap 'unset DB_PASSWORD APP_KEY recovery_confirm 2>/dev/null || true' EXIT
fi

if [[ "$MODE" == "local" ]]; then
  echo
  echo "LOCAL DEVELOPMENT INSTALL"
  echo "Checkout: $PROJECT_DIR"
  if [[ "$WITH_AGENT" == "true" ]]; then
    echo "Docker Compose and the unprivileged development Host Agent are configured for this checkout."
    echo "No systemd unit, no /etc or /opt writes, and no root-owned files are created."
  else
    echo "Only Docker Compose is configured. The Host Agent is not installed, and"
    echo "HUB_ACCESS_DEPLOYMENT_ENABLED remains false. This is not a production installation."
  fi
fi

echo
echo "APPLICATION ENCRYPTION RECOVERY KEY"
echo "Save this value in your password manager. It is displayed only during this installation:"
echo "$APP_KEY"
echo
read -r -p "Confirm that you saved the recovery key securely [y/N]: " recovery_confirm </dev/tty
[[ "$recovery_confirm" == "y" || "$recovery_confirm" == "Y" ]] \
  || fail "Recovery key was not confirmed. No installation files have been created."

install -d -m 0700 "$PROJECT_DIR/secrets" "$PROJECT_DIR/secrets/runtime"
install -d -m 0755 "$PROJECT_DIR/certs" "$PROJECT_DIR/run"
install -d -m 0755 "$PROJECT_DIR/run/host-agent"
if [[ "$MODE" == "local" && "$EUID" -eq 0 ]]; then
  chown "$TARGET_UID:$TARGET_GID" \
    "$PROJECT_DIR/secrets" "$PROJECT_DIR/secrets/runtime" \
    "$PROJECT_DIR/certs" "$PROJECT_DIR/run" "$PROJECT_DIR/run/host-agent"
fi

: > "$PROJECT_DIR/secrets/pfsense_api_key"
printf '%s\n' "$APP_KEY" > "$PROJECT_DIR/secrets/runtime/app_encryption_key"
if [[ "$MODE" == "production" ]]; then
  chown 1000:1000 "$PROJECT_DIR/secrets/pfsense_api_key" "$PROJECT_DIR/secrets/runtime/app_encryption_key"
else
  if [[ "$EUID" -eq 0 ]]; then
    chown "$TARGET_UID:$TARGET_GID" "$PROJECT_DIR/secrets/pfsense_api_key" "$PROJECT_DIR/secrets/runtime/app_encryption_key"
  fi
fi
chmod 0400 "$PROJECT_DIR/secrets/pfsense_api_key" "$PROJECT_DIR/secrets/runtime/app_encryption_key"

if [[ "$MODE" == "production" ]]; then
  cat > "$PROJECT_DIR/.env" <<EOF
COMPOSE_PROJECT_NAME=pfsense-hub
POSTGRES_DB=pfsense_hub
POSTGRES_USER=pfsense_hub
POSTGRES_PASSWORD=$DB_PASSWORD
PFSENSE_DEVICE_ID=
PFSENSE_DEVICE_NAME=
PFSENSE_DEVICE_LOCATION=
PFSENSE_EDITION=unknown
PFSENSE_API_BASE_URL=
PFSENSE_API_TIMEOUT_MS=10000
HUB_AGENT_API_PORT=3001
HUB_DEPLOYMENT_AGENT_TOKEN=$AGENT_TOKEN
HUB_DEPLOYMENT_AGENT_SOCKET=/run/pfsense-hub/agent.sock
HUB_AGENT_GID=2000
HUB_ACCESS_DEPLOYMENT_ENABLED=false
HUB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8080
PFSENSE_CA_FILE=
EOF
  chown root:root "$PROJECT_DIR/.env"
else
  cat > "$PROJECT_DIR/.env" <<EOF
COMPOSE_PROJECT_NAME=pfsense-hub
POSTGRES_DB=pfsense_hub
POSTGRES_USER=pfsense_hub
POSTGRES_PASSWORD=$DB_PASSWORD
PFSENSE_DEVICE_ID=
PFSENSE_DEVICE_NAME=
PFSENSE_DEVICE_LOCATION=
PFSENSE_EDITION=unknown
PFSENSE_API_BASE_URL=
PFSENSE_API_TIMEOUT_MS=10000
HUB_AGENT_API_PORT=3001
HUB_DEPLOYMENT_AGENT_TOKEN=
HUB_DEPLOYMENT_AGENT_SOCKET=
HUB_AGENT_GID=2000
HUB_ACCESS_DEPLOYMENT_ENABLED=false
HUB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8080
PFSENSE_CA_FILE=
EOF
  if [[ "$EUID" -eq 0 ]]; then
    chown "$TARGET_UID:$TARGET_GID" "$PROJECT_DIR/.env"
  fi
fi
chmod 0600 "$PROJECT_DIR/.env"

if [[ "$MODE" == "production" ]]; then
  unset AGENT_TOKEN
fi
unset DB_PASSWORD APP_KEY recovery_confirm

if [[ "$MODE" == "production" ]]; then
  echo
  echo "[1/6] Validating the Hub Compose configuration..."
  docker compose config --quiet

  echo
  echo "[2/6] Installing the standard Linux Host Agent..."
  HUB_AGENT_INSTALLER_MANAGED=1 bash "$PROJECT_DIR/host-agent/install-linux.sh"

  echo
  echo "[3/6] Waiting for the Host Agent systemd service and socket..."
  agent_ready=0
  for attempt in $(seq 1 20); do
    if systemctl is-active --quiet "$AGENT_SERVICE" && [[ -S "$PROJECT_DIR/run/host-agent/agent.sock" ]]; then
      agent_ready=1
      break
    fi
    sleep 1
  done
  [[ "$agent_ready" -eq 1 ]] || {
    systemctl status "$AGENT_SERVICE" --no-pager >&2 || true
    journalctl -u "$AGENT_SERVICE" -n 60 --no-pager >&2 || true
    fail "Host Agent did not become active with its Unix socket."
  }

  echo
  echo "[4/6] Building and starting the Hub web, API, and PostgreSQL services..."
  docker compose config --quiet
  docker compose up -d --build

  wait_for_healthy db || fail "PostgreSQL did not become healthy."
  wait_for_healthy api || fail "The API did not become healthy."
  wait_for_healthy web || fail "The web service did not become healthy."

  echo
  echo "[5/6] Verifying API-to-Host-Agent socket and bearer authentication..."
  docker compose exec -T api node <<'NODE'
const fs = require("node:fs");
const net = require("node:net");
const path = "/run/pfsense-hub/agent.sock";
const metadata = fs.statSync(path);
if (!metadata.isSocket() || (metadata.mode & 0o020) === 0) {
  throw new Error("Host Agent socket is missing or not group-writable.");
}
if (!process.getgroups().includes(2000)) {
  throw new Error("API process is missing Host Agent supplementary group 2000.");
}
const socket = net.createConnection({ path });
let buffer = "";
let finished = false;
const timeout = setTimeout(() => fail("Host Agent socket request timed out."), 12000);
function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.error(message);
  socket.destroy();
  process.exitCode = 1;
}
socket.once("connect", () => {
  socket.write(JSON.stringify({
    protocolVersion: 1,
    deploymentId: "00000000-0000-4000-8000-000000000000",
    desiredRevision: 1
  }) + "\n");
});
socket.on("data", chunk => {
  buffer += chunk.toString("utf8");
  const newline = buffer.indexOf("\n");
  if (newline < 0 || finished) return;
  try {
    const response = JSON.parse(buffer.slice(0, newline));
    if (response.state !== "failed" || response.errorCode !== "STALE_DEPLOYMENT") {
      fail("Host Agent replied, but bearer-authenticated API retrieval was not verified: " + JSON.stringify(response));
      return;
    }
    finished = true;
    clearTimeout(timeout);
    console.log("Host Agent socket, supplementary group, and API bearer authentication verified.");
    socket.end();
  } catch {
    fail("Host Agent returned an invalid response.");
  }
});
socket.once("error", error => fail("Unable to connect to Host Agent socket: " + error.message));
NODE

  echo
  echo "[6/6] Enabling GUI-managed access after successful Host Agent verification..."
  python3 - "$PROJECT_DIR/.env" <<'PY'
import os
import stat
import sys
import tempfile
from pathlib import Path

path = Path(sys.argv[1])
metadata = path.lstat()
if not stat.S_ISREG(metadata.st_mode) or (metadata.st_uid, metadata.st_gid) != (0, 0):
    raise SystemExit(".env must remain a regular root-owned file.")
if stat.S_IMODE(metadata.st_mode) != 0o600:
    raise SystemExit(".env permissions must remain 0600.")
lines = path.read_text(encoding="utf-8").splitlines()
matches = [i for i, line in enumerate(lines) if line.startswith("HUB_ACCESS_DEPLOYMENT_ENABLED=")]
if len(matches) != 1 or lines[matches[0]] != "HUB_ACCESS_DEPLOYMENT_ENABLED=false":
    raise SystemExit("Expected exactly one disabled Hub access feature gate.")
lines[matches[0]] = "HUB_ACCESS_DEPLOYMENT_ENABLED=true"
fd, temporary = tempfile.mkstemp(prefix=".env-install-", dir=str(path.parent))
try:
    os.fchown(fd, 0, 0)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write("\n".join(lines) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
PY

  docker compose config --quiet
  docker compose up -d --no-deps api
  wait_for_healthy api || fail "The API did not become healthy after enabling GUI-managed access."
  systemctl is-active --quiet "$AGENT_SERVICE" || fail "Host Agent stopped after application startup."
  [[ -S "$PROJECT_DIR/run/host-agent/agent.sock" ]] || fail "Host Agent socket disappeared after application startup."

  echo
  echo "Installation completed successfully."
  echo "Git commit: $git_commit"
  echo "Services:"
  docker compose ps
  echo
  echo "Hub UI: http://127.0.0.1:8080"
  echo "Host Agent: active (systemd), restricted Unix socket verified."
  echo "GUI-managed Hub access: enabled after successful Host Agent verification."
  if command -v tailscale >/dev/null 2>&1; then
    echo "Tailscale CLI detected. Authenticate this machine and enable tailnet HTTPS before selecting Tailscale in Hub Settings."
  else
    echo "Tailscale is not installed. The Hub is available locally; install and authenticate Tailscale when you are ready to use tailnet access."
    echo "The Host Agent discovers the Tailscale CLI from PATH when it is installed later."
  fi
  echo "Do not delete the PostgreSQL volume or replace the application encryption key during updates or reinstallations."
else
  echo
  echo "[1/4] Validating the Hub Compose configuration..."
  docker compose config --quiet

  echo
  echo "[2/4] Building and starting the Hub web, API, and PostgreSQL services..."
  docker compose up -d --build

  echo
  echo "[3/4] Waiting for service health..."
  wait_for_healthy db || fail "PostgreSQL did not become healthy."
  wait_for_healthy api || fail "The API did not become healthy."
  wait_for_healthy web || fail "The web service did not become healthy."

  if [[ "$WITH_AGENT" == "true" ]]; then
    echo
    echo "[4/5] Installing the unprivileged development Host Agent..."
    install_dev_agent
    echo
    echo "[5/5] Local development installation completed."
  else
    echo
    echo "[4/4] Local development installation completed."
  fi
  echo "Git commit: $git_commit"
  echo "Services:"
  docker compose ps
  echo
  echo "Hub UI: http://127.0.0.1:8080"
  echo "Mode: local development (Docker Compose only, no root-owned services)."
  if [[ "$WITH_AGENT" == "true" ]]; then
    echo "Host Agent: running as $(id -nu "$TARGET_UID") from $PROJECT_DIR (development mode, not systemd)."
    echo "GUI-managed Hub access: enabled (HUB_ACCESS_DEPLOYMENT_ENABLED=true)."
    echo "Control the agent with: bash $SCRIPT_DIR/dev-host-agent.sh start|stop|status|logs"
  else
    echo "Host Agent: not installed. GUI-managed Hub access deployment remains disabled (HUB_ACCESS_DEPLOYMENT_ENABLED=false)."
  fi
  echo "This is not a production installation. The supported production procedure is documented in docs/DEPLOYMENT.md."
  echo "Follow logs with: docker compose logs -f"
  echo "Stop with: docker compose down (never 'docker compose down -v'; it removes the generated database and encryption state)."
  echo "Do not delete the PostgreSQL volume or replace the application encryption key during updates or reinstallations."
fi

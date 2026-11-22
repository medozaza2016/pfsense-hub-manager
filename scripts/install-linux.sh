#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

PROJECT_DIR="/opt/pfsense-hub"
AGENT_SERVICE="pfsense-hub-deployment-agent.service"
AGENT_CONFIG="/etc/pfsense-hub/deployment-agent.json"
POSTGRES_VOLUME="pfsense-hub_postgres_data"

fail() {
  echo "Installation stopped: $1" >&2
  exit 1
}

if [[ "$EUID" -ne 0 ]]; then
  echo "Run the installer with sudo: sudo bash scripts/install-linux.sh" >&2
  exit 1
fi
[[ -d "$PROJECT_DIR" ]] || fail "Expected project directory $PROJECT_DIR."
cd "$PROJECT_DIR"

for command_name in docker openssl python3 git systemctl ip groupadd getent stat install; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command not found: $command_name."
done
[[ -d /run/systemd/system ]] || fail "A systemd-based Linux host is required."
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' || fail "Python 3.10 or newer is required."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
docker info >/dev/null 2>&1 || fail "Docker Engine is unavailable. Start Docker and retry."

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

for existing_path in \
  "$PROJECT_DIR/.env" \
  "$PROJECT_DIR/secrets/pfsense_api_key" \
  "$PROJECT_DIR/secrets/runtime/app_encryption_key" \
  "$AGENT_CONFIG" \
  "/etc/systemd/system/$AGENT_SERVICE"; do
  [[ ! -e "$existing_path" && ! -L "$existing_path" ]] \
    || fail "Existing installation state detected at $existing_path. This installer will not overwrite it."
done

if docker volume inspect "$POSTGRES_VOLUME" >/dev/null 2>&1; then
  fail "Existing PostgreSQL volume $POSTGRES_VOLUME detected. Refusing to initialize over existing database data."
fi
existing_containers="$(docker ps -aq --filter label=com.docker.compose.project=pfsense-hub)"
[[ -z "$existing_containers" ]] || fail "Existing containers for Compose project pfsense-hub were detected. Inspect and preserve that installation before proceeding."
if [[ -d "$PROJECT_DIR/secrets" ]] && find "$PROJECT_DIR/secrets" -type f -print -quit | grep -q .; then
  fail "Existing files were found in secrets/. Review and preserve them before installing."
fi

DB_PASSWORD="$(openssl rand -hex 32)"
APP_KEY="$(openssl rand -hex 32)"
AGENT_TOKEN="$(openssl rand -hex 32)"
trap 'unset DB_PASSWORD APP_KEY AGENT_TOKEN 2>/dev/null || true' EXIT

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

: > "$PROJECT_DIR/secrets/pfsense_api_key"
printf '%s\n' "$APP_KEY" > "$PROJECT_DIR/secrets/runtime/app_encryption_key"
chown 1000:1000 "$PROJECT_DIR/secrets/pfsense_api_key" "$PROJECT_DIR/secrets/runtime/app_encryption_key"
chmod 0400 "$PROJECT_DIR/secrets/pfsense_api_key" "$PROJECT_DIR/secrets/runtime/app_encryption_key"

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
chmod 0600 "$PROJECT_DIR/.env"
unset DB_PASSWORD APP_KEY AGENT_TOKEN recovery_confirm

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
if (!process.getGroups().includes(2000)) {
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
python3 - <<'PY'
import os
import stat
import tempfile
from pathlib import Path

path = Path("/opt/pfsense-hub/.env")
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

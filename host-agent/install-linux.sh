#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/opt/pfsense-hub}"
if [[ "$PROJECT_DIR" != "/opt/pfsense-hub" ]]; then
  echo "The systemd unit is pinned to /opt/pfsense-hub. Install the project there." >&2
  exit 1
fi
ENV_FILE="$PROJECT_DIR/.env"
AGENT_SOURCE="$PROJECT_DIR/host-agent/pfsense_hub_agent.py"
CONFIG_DIR="/etc/pfsense-hub"
CONFIG_FILE="$CONFIG_DIR/deployment-agent.json"
SERVICE_SOURCE="$PROJECT_DIR/host-agent/pfsense-hub-deployment-agent.service"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi
if [[ -e "$PROJECT_DIR/compose.override.yaml" ]]; then
  echo "A custom compose.override.yaml is not supported by the restricted host agent. Review and remove it before installation." >&2
  exit 1
fi
for file in "$ENV_FILE" "$AGENT_SOURCE" "$SERVICE_SOURCE"; do
  [[ -f "$file" ]] || { echo "Required file not found: $file" >&2; exit 1; }
done
for trusted_path in "$PROJECT_DIR" "$PROJECT_DIR/compose.yaml"; do
  [[ "$(stat -c '%u:%g' "$trusted_path")" == "0:0" ]] || {
    echo "$trusted_path must be owned by root:root before installing the privileged host agent." >&2
    exit 1
  }
  TRUSTED_MODE="$(stat -c '%a' "$trusted_path")"
  (( (8#$TRUSTED_MODE & 0022) == 0 )) || {
    echo "$trusted_path must not be group/world writable." >&2
    exit 1
  }
done
command -v python3 >/dev/null || { echo "python3 is required." >&2; exit 1; }
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' || { echo "Python 3.10 or newer is required." >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required." >&2; exit 1; }
DOCKER_BIN="$(command -v docker)" || { echo "Docker Engine is required." >&2; exit 1; }
IP_BIN="$(command -v ip)" || { echo "iproute2 is required." >&2; exit 1; }
"$DOCKER_BIN" compose version >/dev/null
TAILSCALE_BIN="$(command -v tailscale || true)"

# Parse only literal KEY=value lines. Never source or execute the .env file.
TOKEN="$(python3 - "$ENV_FILE" <<'PY'
import sys
values = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")
print(values.get("HUB_DEPLOYMENT_AGENT_TOKEN", ""))
PY
)"
API_PORT="$(python3 - "$ENV_FILE" <<'PY'
import sys
values = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")
print(values.get("HUB_AGENT_API_PORT", "3001"))
PY
)"
ENV_OWNER="$(stat -c '%u:%g' "$ENV_FILE")"
ENV_MODE="$(stat -c '%a' "$ENV_FILE")"
if [[ "$ENV_OWNER" != "0:0" ]] || (( (8#$ENV_MODE & 0022) != 0 )); then
  echo ".env must be owned by root:root and not be group/world writable." >&2
  exit 1
fi
for required_setting in \
  'HUB_DEPLOYMENT_AGENT_SOCKET=/run/pfsense-hub/agent.sock' \
  'HUB_AGENT_GID=2000' \
  'HUB_BIND_ADDRESS=127.0.0.1' \
  'WEB_PORT=8080'; do
  grep -Fxq "$required_setting" "$ENV_FILE" || {
    echo "Set $required_setting in .env before installing the host agent." >&2
    exit 1
  }
done
if [[ ! "$TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  echo "Set HUB_DEPLOYMENT_AGENT_TOKEN to a 32 to 256 character URL-safe random token in .env first (for example, generated with openssl rand -hex 32)." >&2
  exit 1
fi
if [[ ! "$API_PORT" =~ ^[0-9]{1,5}$ ]] || (( API_PORT < 1 || API_PORT > 65535 )); then
  echo "HUB_AGENT_API_PORT must be a valid TCP port." >&2
  exit 1
fi

install -d -m 0750 "$CONFIG_DIR" /run/pfsense-hub "$PROJECT_DIR/run/host-agent"
install -d -m 0755 /usr/local/libexec
if ! getent group pfsense-hub-agent >/dev/null; then
  if getent group 2000 >/dev/null; then echo "GID 2000 is already assigned. Resolve this before installing." >&2; exit 1; fi
  groupadd --gid 2000 pfsense-hub-agent
else
  EXISTING_GID="$(getent group pfsense-hub-agent | cut -d: -f3)"
  if [[ "$EXISTING_GID" != "2000" ]]; then
    echo "The pfsense-hub-agent group must use GID 2000." >&2
    exit 1
  fi
fi
install -m 0755 "$AGENT_SOURCE" /usr/local/libexec/pfsense-hub-deployment-agent.py
python3 - "$CONFIG_FILE" "$TOKEN" "$API_PORT" "$PROJECT_DIR" "$TAILSCALE_BIN" "$DOCKER_BIN" "$IP_BIN" <<'PY'
import json, os, sys
path, token, port, project, tailscale_binary, docker_binary, ip_binary = sys.argv[1:]
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
    "web_local_url": "http://127.0.0.1:8080"
}
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as stream:
    json.dump(config, stream)
    stream.write("\n")
os.chown(path, 0, 0)
os.chmod(path, 0o600)
PY
install -m 0644 "$SERVICE_SOURCE" /etc/systemd/system/pfsense-hub-deployment-agent.service
chown root:pfsense-hub-agent "$PROJECT_DIR/run/host-agent"
chmod 2750 "$PROJECT_DIR/run/host-agent"
systemctl daemon-reload
systemctl enable --now pfsense-hub-deployment-agent.service

echo "Host agent installed. Ensure .env contains:"
echo "HUB_DEPLOYMENT_AGENT_SOCKET=/run/pfsense-hub/agent.sock"
echo "HUB_DEPLOYMENT_AGENT_TOKEN=<same token used by the agent>"
echo "HUB_AGENT_GID=2000"
echo "Then recreate only the API container so its socket mount and group are active."

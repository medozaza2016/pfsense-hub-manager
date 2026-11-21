#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
step(){ printf '\n==> %s\n' "$1"; }
fail(){ echo "ERROR: $*" >&2; exit 1; }
get_env(){ local k="$1" d="${2:-}" v; v="$(grep -E "^${k}=" .env | tail -n1 | cut -d= -f2- || true)"; printf '%s' "${v:-$d}"; }
set_env(){
  local k="$1" v="$2" t; t="$(mktemp)"
  if grep -qE "^${k}=" .env; then awk -v k="$k" -v v="$v" 'BEGIN{FS=OFS="="} $1==k {$0=k "=" v;f=1}{print}END{if(!f)print k "=" v}' .env > "$t"
  else cat .env > "$t"; printf '%s=%s\n' "$k" "$v" >> "$t"; fi
  cat "$t" > .env; rm -f "$t"; chmod 600 .env
}
step "Checking Docker and Compose"
command -v docker >/dev/null || fail "Docker CLI missing."
docker info >/dev/null 2>&1 || fail "Docker Engine is not running."
docker compose version >/dev/null || fail "Docker Compose v2 is required."
[[ -f compose.yaml && -f .env.example ]] || fail "Run this script from the repository."
step "Preparing settings and secrets"
[[ -f .env ]] || cp .env.example .env
chmod 600 .env
db="$(get_env POSTGRES_PASSWORD)"
if [[ -z "$db" || "$db" == replace-with-* ]]; then db="$(openssl rand -hex 32)"; set_env POSTGRES_PASSWORD "$db"; fi
url="$(get_env PFSENSE_API_BASE_URL https://172.10.50.1:10443)"
[[ "$url" == https://* ]] || fail "pfSense API URL must use HTTPS."
mkdir -p secrets certs workspace; chmod 700 secrets
if [[ ! -s secrets/pfsense_api_key ]]; then
  read -r -s -p "Dedicated read-only pfSense API key (hidden): " key; echo
  [[ -n "$key" ]] || fail "API key cannot be empty."
  printf '%s' "$key" > secrets/pfsense_api_key; unset key
fi
chown 1000:1000 secrets/pfsense_api_key; chmod 400 secrets/pfsense_api_key
if [[ ! -s secrets/device_credentials_key ]]; then
  openssl rand -hex 32 > secrets/device_credentials_key
fi
chmod 400 secrets/device_credentials_key
if [[ ! -f certs/pfsense-ca.pem ]]; then
  read -r -p "Private pfSense CA PEM path, or Enter if not required: " ca
  if [[ -n "$ca" ]]; then [[ -f "$ca" ]] || fail "CA file not found."; install -m 644 "$ca" certs/pfsense-ca.pem; fi
fi
if [[ -f certs/pfsense-ca.pem ]]; then set_env PFSENSE_CA_FILE /run/certs/pfsense-ca.pem; else set_env PFSENSE_CA_FILE ""; fi
step "Optional browser-based VS Code"
read -r -p "Enable code-server (VS Code in browser)? [y/N] " enable
compose=(-f compose.yaml); password=""
if [[ "$enable" =~ ^([yY]|[yY][eE][sS])$ ]]; then
  compose+=(-f compose.code-server.yaml)
  if [[ ! -s secrets/code_server_password ]]; then
    read -r -p "Generate a strong code-server password automatically? [Y/n] " gen
    if [[ "$gen" =~ ^([nN]|[nN][oO])$ ]]; then
      read -r -s -p "Password, minimum 16 characters: " password; echo
      [[ ${#password} -ge 16 ]] || fail "Password must be at least 16 characters."
    else password="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"; fi
    printf '%s' "$password" > secrets/code_server_password
  else password="$(cat secrets/code_server_password)"; fi
  chmod 400 secrets/code_server_password
fi
step "Validating and starting Compose"
docker compose "${compose[@]}" config --quiet
docker compose "${compose[@]}" up -d --build --wait --wait-timeout 240 || { docker compose "${compose[@]}" logs --tail 80; fail "Services failed health checks."; }
port="$(get_env WEB_PORT 8080)"; app="http://127.0.0.1:${port}"
ok=false
for _ in $(seq 1 20); do if curl -fsS --max-time 3 "$app/health" >/dev/null; then ok=true; break; fi; sleep 2; done
echo "Installation complete."
echo "Application: $app"
[[ "$ok" == true ]] || echo "WARNING: Web probe failed. Run docker compose logs web."
if [[ ${#compose[@]} -gt 2 ]]; then
  cp="$(get_env CODE_SERVER_PORT 8443)"; echo "Browser VS Code: http://127.0.0.1:${cp}"
  [[ -z "$password" ]] || echo "code-server password (shown once): $password"
fi
echo "UI is localhost-only. Do not expose it publicly before manager authentication is implemented."
echo "Troubleshooting: docker compose ps ; docker compose logs -f api"

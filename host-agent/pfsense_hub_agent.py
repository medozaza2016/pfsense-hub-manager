#!/usr/bin/env python3
"""Restricted Linux host agent for pfSense Hub Manager.

The agent accepts only deployment UUID/revision requests over a Unix socket.
It never accepts shell commands, filesystem paths, Compose arguments, or env
values from the API. The first implementation deliberately supports only
Tailscale MagicDNS with Tailscale Serve TLS. LAN/custom TLS are rejected until
an explicit certificate lifecycle is provisioned.
"""
from __future__ import annotations

import ipaddress
import json
import os
import re
import socket
import ssl
import stat
import tempfile
import time
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

CONFIG_PATH = Path("/etc/pfsense-hub/deployment-agent.json")
MAX_LINE = 16 * 1024
PROTOCOL_VERSION = 1
SAFE_ERROR = re.compile(r"^[A-Z0-9_]{1,64}$")


class AgentError(Exception):
    def __init__(self, code: str):
        self.code = code if SAFE_ERROR.fullmatch(code) else "HOST_AGENT_FAILURE"
        super().__init__(self.code)


def load_config() -> dict[str, Any]:
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        raise AgentError("AGENT_CONFIGURATION_UNAVAILABLE") from exc
    required = {"api_base_url", "api_token", "socket_path", "tailscale_binary", "docker_binary", "ip_binary", "project_dir", "compose_file", "env_file", "web_local_url"}
    if not isinstance(raw, dict) or not required.issubset(raw):
        raise AgentError("AGENT_CONFIGURATION_INVALID")
    try:
        metadata = CONFIG_PATH.stat()
    except OSError as exc:
        raise AgentError("AGENT_CONFIGURATION_UNAVAILABLE") from exc
    if metadata.st_uid != 0 or metadata.st_mode & 0o077:
        raise AgentError("AGENT_CONFIGURATION_PERMISSIONS_INVALID")
    parsed = urllib.parse.urlparse(raw["api_base_url"])
    if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "::1")
            or parsed.path not in ("", "/") or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.port is None
            or not 1 <= parsed.port <= 65535):
        raise AgentError("AGENT_API_MUST_BE_LOOPBACK")
    if not isinstance(raw["api_token"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", raw["api_token"]):
        raise AgentError("AGENT_TOKEN_INVALID")
    if not isinstance(raw["socket_path"], str) or not os.path.isabs(raw["socket_path"]):
        raise AgentError("AGENT_SOCKET_PATH_INVALID")
    if raw["tailscale_binary"] and (not isinstance(raw["tailscale_binary"], str) or not os.path.isabs(raw["tailscale_binary"])):
        raise AgentError("AGENT_TAILSCALE_BINARY_INVALID")
    if not isinstance(raw["docker_binary"], str) or not os.path.isabs(raw["docker_binary"]):
        raise AgentError("AGENT_DOCKER_BINARY_INVALID")
    if not isinstance(raw["ip_binary"], str) or not os.path.isabs(raw["ip_binary"]):
        raise AgentError("AGENT_IP_BINARY_INVALID")
    if raw["project_dir"] != "/opt/pfsense-hub" or raw["compose_file"] != "/opt/pfsense-hub/compose.yaml" or raw["env_file"] != "/opt/pfsense-hub/.env":
        raise AgentError("AGENT_PROJECT_PATH_INVALID")
    if raw["web_local_url"] != "http://127.0.0.1:8080":
        raise AgentError("AGENT_WEB_TARGET_INVALID")
    return raw


def run_fixed(argv: list[str], timeout: int = 20) -> str:
    try:
        result = subprocess.run(argv, check=False, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AgentError("HOST_OPERATION_UNAVAILABLE") from exc
    if result.returncode != 0:
        raise AgentError("HOST_OPERATION_FAILED")
    return result.stdout.strip()


def get_deployment(config: dict[str, Any], deployment_id: str, revision: int) -> dict[str, Any]:
    query = urllib.parse.urlencode({"deploymentId": deployment_id, "desiredRevision": str(revision)})
    url = config["api_base_url"].rstrip("/") + "/api/v1/internal/host-deployment-config?" + query
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + config["api_token"]})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            payload = json.loads(response.read(16 * 1024))
    except urllib.error.HTTPError as exc:
        if exc.code == 409:
            raise AgentError("STALE_DEPLOYMENT") from exc
        raise AgentError("DEPLOYMENT_CONFIG_UNAVAILABLE") from exc
    except Exception as exc:
        raise AgentError("DEPLOYMENT_CONFIG_UNAVAILABLE") from exc
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict) or data.get("deploymentId") != deployment_id or data.get("desiredRevision") != revision:
        raise AgentError("DEPLOYMENT_CONFIG_INVALID")
    return data


def tailscale_identity(binary: str) -> tuple[str, set[str], set[str]]:
    try:
        status = json.loads(run_fixed([binary, "status", "--json"], timeout=10))
        self_info = status.get("Self") or {}
        dns_name = str(self_info.get("DNSName") or "").rstrip(".").lower()
        ips = {str(value) for value in (self_info.get("TailscaleIPs") or [])}
        cert_domains = {str(value).rstrip(".").lower() for value in (status.get("CertDomains") or [])}
    except Exception as exc:
        if isinstance(exc, AgentError):
            raise
        raise AgentError("TAILSCALE_STATUS_INVALID") from exc
    if not dns_name or not ips:
        raise AgentError("TAILSCALE_NOT_CONNECTED")
    return dns_name, ips, cert_domains


def serve_status(binary: str) -> str:
    return run_fixed([binary, "serve", "status", "--json"], timeout=10)


def has_serve_handler(raw: str, host: str, port: int, target: str) -> bool:
    if not raw.strip():
        return False
    try:
        value = json.loads(raw)
    except Exception as exc:
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID") from exc
    if not isinstance(value, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    web = value.get("Web") or {}
    if not isinstance(web, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    endpoint = web.get(f"{host}:{port}") or {}
    handlers = endpoint.get("Handlers") or {}
    root_handler = handlers.get("/") or {}
    return root_handler.get("Proxy") == target


def verify_https(origin: str) -> None:
    context = ssl.create_default_context()
    request = urllib.request.Request(origin + "/health", headers={"User-Agent": "pfSense-Hub-Deployment-Agent/1"})
    try:
        with urllib.request.urlopen(request, timeout=8, context=context) as response:
            if response.status != 200 or response.read(128).strip() != b"ok":
                raise AgentError("ENDPOINT_HEALTH_CHECK_FAILED")
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("TLS_OR_ENDPOINT_VERIFICATION_FAILED") from exc


def has_funnel_handler(raw: str, host: str, port: int) -> bool:
    try:
        value = json.loads(raw)
    except Exception as exc:
        raise AgentError("TAILSCALE_FUNNEL_STATUS_INVALID") from exc
    if not isinstance(value, dict):
        raise AgentError("TAILSCALE_FUNNEL_STATUS_INVALID")
    allow_funnel = value.get("AllowFunnel") or {}
    if not isinstance(allow_funnel, dict):
        raise AgentError("TAILSCALE_FUNNEL_STATUS_INVALID")
    return allow_funnel.get(f"{host}:{port}") is True


def deploy(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    if set(request) != {"protocolVersion", "deploymentId", "desiredRevision"}:
        raise AgentError("REQUEST_INVALID")
    if request["protocolVersion"] != PROTOCOL_VERSION or not isinstance(request["desiredRevision"], int) or request["desiredRevision"] < 1:
        raise AgentError("REQUEST_INVALID")
    try:
        deployment_id = str(uuid.UUID(request["deploymentId"]))
    except Exception as exc:
        raise AgentError("REQUEST_INVALID") from exc
    revision = request["desiredRevision"]

    endpoint = get_deployment(config, deployment_id, revision)
    if endpoint.get("method") != "tailscale" or endpoint.get("addressType") != "magic_dns" or endpoint.get("scheme") != "https":
        raise AgentError("TLS_METHOD_NOT_SUPPORTED_YET")
    address = endpoint.get("address")
    port = endpoint.get("port")
    if not isinstance(address, str) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")
    host = address.rstrip(".").lower()
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.ts\.net", host):
        raise AgentError("TAILSCALE_MAGICDNS_REQUIRED")

    binary = config["tailscale_binary"]
    dns_name, _ips, cert_domains = tailscale_identity(binary)
    if host != dns_name:
        raise AgentError("TAILSCALE_ADDRESS_MISMATCH")
    if host not in cert_domains:
        raise AgentError("TAILSCALE_HTTPS_NOT_ENABLED")

    # DEC-026 prohibits automatic Tailscale, DNS, or reverse-proxy provisioning.
    # Verify that an operator has already configured the exact private Serve route.
    serve = serve_status(binary)
    if not has_serve_handler(serve, host, port, config["web_local_url"]):
        raise AgentError("TAILSCALE_SERVE_NOT_CONFIGURED")
    funnel = run_fixed([binary, "funnel", "status", "--json"], timeout=10)
    if has_funnel_handler(funnel, host, port):
        raise AgentError("TAILSCALE_FUNNEL_ALREADY_CONFIGURED")

    verify_https("https://" + host + ("" if port == 443 else ":" + str(port)))
    # Reject a result if the desired revision changed during the HTTPS probe.
    current = get_deployment(config, deployment_id, revision)
    if current.get("address") != address or current.get("port") != port:
        raise AgentError("STALE_DEPLOYMENT")
    return {"state": "succeeded", "appliedOrigin": "https://" + host + ("" if port == 443 else ":" + str(port))}


def handle_client(conn: socket.socket, config: dict[str, Any], lock_path: Path) -> None:
    import fcntl
    try:
        conn.settimeout(120)
        data = bytearray()
        while b"\n" not in data and len(data) <= MAX_LINE:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data.extend(chunk)
        if len(data) > MAX_LINE or b"\n" not in data:
            raise AgentError("REQUEST_TOO_LARGE_OR_INCOMPLETE")
        request = json.loads(bytes(data).split(b"\n", 1)[0])
        with lock_path.open("w", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                result = deploy(config, request)
            except AgentError as exc:
                result = {"state": "failed", "errorCode": exc.code, "rollbackSucceeded": None}
            except Exception:
                result = {"state": "failed", "errorCode": "HOST_AGENT_FAILURE", "rollbackSucceeded": None}
            finally:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        conn.sendall(json.dumps(result, separators=(",", ":")).encode() + b"\n")
    except Exception:
        try:
            conn.sendall(b'{"state":"failed","errorCode":"REQUEST_INVALID","rollbackSucceeded":null}\n')
        except OSError:
            pass
    finally:
        conn.close()


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("The host deployment agent must run as root.")
    config = load_config()
    socket_path = Path(config["socket_path"])
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        socket_path.unlink()
    except FileNotFoundError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(socket_path))
    os.chmod(socket_path, 0o660)
    server.listen(8)
    lock_path = Path("/run/pfsense-hub/deployment.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    while True:
        conn, _ = server.accept()
        handle_client(conn, config, lock_path)


if __name__ == "__main__":
    main()

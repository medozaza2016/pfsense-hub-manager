#!/usr/bin/env python3
"""Restricted Linux host agent for pfSense Hub Manager.

The agent accepts only newline-delimited JSON requests carrying an explicit
protocol version, an operation discriminator, and that operation's fixed fields
such as a deployment UUID or revision. It never accepts shell commands,
filesystem paths, Compose arguments, service names, or env values from the API.
It changes only HUB_BIND_ADDRESS in the fixed project .env
and recreates only the fixed web service, or configures and verifies one fixed
Tailscale MagicDNS Serve route. DNS, TLS termination, reverse proxies, and
tailnet policy remain operator-managed. The agent never configures Funnel.

Recovery is a closed set as well: ``system.operation`` accepts one manager-assigned
operation UUID plus an allowlisted action (start, stop, restart) and an allowlisted
target (one fixed Compose service or the whole stack). The action is journaled
before it runs, executed once per UUID, and verified against ``docker compose ps``;
the manager reads the outcome back with ``system.operationResult``. No command
string, Compose argument, image override, or shell is ever accepted.

Trust model: trust is derived from the agent's own identity, never from a mode
flag or from the configuration file. The configuration file, the project
directory, the Compose file, and the environment file must all be owned by the
effective user and group running the agent. A root agent therefore still
requires a root-owned checkout at the production project path, while an
unprivileged agent requires an unprivileged-owned checkout. No configuration
can make a privileged agent accept attacker-writable project files.
"""
from __future__ import annotations

import ipaddress
import json
import os
import re
import socket
import shutil
import ssl
import stat
import sys
import tempfile
import threading
import time
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

CONFIG_PATH = Path("/etc/pfsense-hub/deployment-agent.json")
PRODUCTION_PROJECT_DIR = "/opt/pfsense-hub"
DEFAULT_SOCKET_GID = 2000
DEFAULT_LOCK_PATH = "/run/pfsense-hub/deployment.lock"
MAX_LINE = 16 * 1024
PROTOCOL_VERSION = 2
SAFE_ERROR = re.compile(r"^[A-Z0-9_]{1,64}$")
MAX_LOG_LINES = 500
MAX_LOG_LINE_CHARS = 2000
SERVICE_NAMES = ("web", "api", "db")
CONTAINER_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$")
STARTED_AT = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?Z$")
OPERATION_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
# Recovery surface. Both enumerations mirror the API protocol allowlist; anything
# else fails closed before a single Docker argument is built.
OPERATION_ACTIONS = ("start", "stop", "restart")
OPERATION_TARGETS = ("web", "api", "db", "stack")
OPERATION_ID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
OPERATION_STATE_MAX = 50
OPERATION_EXEC_TIMEOUT = 120
OPERATION_VERIFY_ATTEMPTS = 15
OPERATION_VERIFY_INTERVAL = 1.0
OPERATION_STATE_NAME = "host-operations.json"
OPERATION_STOPPED_STATES = frozenset({"exited", "created", "dead", "missing"})
# Order matters: specific credential shapes first, generic assignments last.
REDACTIONS = (
    (re.compile(r"(?i)(authorization\s*:\s*bearer\s+)\S+"), r"\1[REDACTED]"),
    (re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"), "[REDACTED]"),
    (re.compile(r"(?i)\b((?:postgres(?:ql)?|redis|rediss|amqp)://)\S+"), r"\1[REDACTED]"),
    # Environment-style assignments such as HUB_SERVICE_ROLE_KEY=... or HUB_SECRET_KEY=...
    (re.compile(
        r"(?im)\b([A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|KEY)[A-Z0-9_]*\s*=\s*)[^\s\"',;]+"
    ), r"\1[REDACTED]"),
    (re.compile(
        r"(?i)\b(password|passwd|secret|token|api[_-]?key|service[_-]?role[_-]?key)"
        r"(\s*[=:]\s*)[^\s\"',;]+"
    ), r"\1\2[REDACTED]")
)


class AgentError(Exception):
    def __init__(self, code: str):
        self.code = code if SAFE_ERROR.fullmatch(code) else "HOST_AGENT_FAILURE"
        super().__init__(self.code)


def validate_project_paths(raw: dict[str, Any]) -> None:
    """Require project files that belong to the identity running this agent.

    A root agent therefore still requires a root-owned production checkout, so a
    configuration file can never point a privileged agent at a writable tree.
    """
    project_dir = raw["project_dir"]
    if not isinstance(project_dir, str) or not os.path.isabs(project_dir):
        raise AgentError("AGENT_PROJECT_PATH_INVALID")
    if project_dir != os.path.realpath(project_dir):
        raise AgentError("AGENT_PROJECT_PATH_INVALID")
    if raw["compose_file"] != os.path.join(project_dir, "compose.yaml"):
        raise AgentError("AGENT_PROJECT_PATH_INVALID")
    if raw["env_file"] != os.path.join(project_dir, ".env"):
        raise AgentError("AGENT_PROJECT_PATH_INVALID")
    owner = os.geteuid()
    group = os.getegid()
    if owner == 0 and project_dir != PRODUCTION_PROJECT_DIR:
        raise AgentError("AGENT_PROJECT_PATH_INVALID")
    try:
        project_stat = Path(project_dir).lstat()
        compose_stat = Path(raw["compose_file"]).lstat()
        if (not stat.S_ISDIR(project_stat.st_mode) or project_stat.st_uid != owner
                or project_stat.st_mode & 0o022
                or not stat.S_ISREG(compose_stat.st_mode) or compose_stat.st_uid != owner
                or compose_stat.st_gid != group or compose_stat.st_mode & 0o022):
            raise AgentError("AGENT_PROJECT_PERMISSIONS_INVALID")
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("AGENT_PROJECT_UNAVAILABLE") from exc


def load_config(path: Path | None = None) -> dict[str, Any]:
    # Validate the configuration file itself before reading it. lstat rejects
    # symlinks. The production path lives in a root-only directory; a development
    # configuration lives in the invoking account's own config directory. In both
    # cases the file must belong to the identity that runs the agent.
    config_path = CONFIG_PATH if path is None else path
    owner = os.geteuid()
    group = os.getegid()
    try:
        metadata = config_path.lstat()
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != owner
                or metadata.st_gid != group or metadata.st_mode & 0o077):
            raise AgentError("AGENT_CONFIGURATION_PERMISSIONS_INVALID")
        raw = json.loads(config_path.read_text(encoding="utf-8"))
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("AGENT_CONFIGURATION_UNAVAILABLE") from exc
    required = {"api_base_url", "api_token", "socket_path", "tailscale_binary", "docker_binary", "ip_binary", "project_dir", "compose_file", "env_file", "web_local_url"}
    if not isinstance(raw, dict) or not required.issubset(raw):
        raise AgentError("AGENT_CONFIGURATION_INVALID")
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
    validate_project_paths(raw)
    for binary_key in ("docker_binary", "ip_binary", "tailscale_binary"):
        binary_path = raw[binary_key]
        if not binary_path:
            continue
        try:
            binary_stat = Path(binary_path).stat()
            if not stat.S_ISREG(binary_stat.st_mode) or binary_stat.st_uid != 0 or binary_stat.st_mode & 0o022 or not os.access(binary_path, os.X_OK):
                raise AgentError("AGENT_BINARY_PERMISSIONS_INVALID")
        except AgentError:
            raise
        except Exception as exc:
            raise AgentError("AGENT_BINARY_UNAVAILABLE") from exc
    if raw["web_local_url"] != "http://127.0.0.1:8080":
        raise AgentError("AGENT_WEB_TARGET_INVALID")
    socket_gid = raw.get("socket_gid", DEFAULT_SOCKET_GID)
    if type(socket_gid) is not int or not 1 <= socket_gid <= 65535:
        raise AgentError("AGENT_SOCKET_GROUP_INVALID")
    lock_path = raw.get("lock_path", DEFAULT_LOCK_PATH)
    if not isinstance(lock_path, str) or not os.path.isabs(lock_path):
        raise AgentError("AGENT_LOCK_PATH_INVALID")
    # The recovery journal defaults next to the mutation lock so it lands inside
    # the unit's ReadWritePaths and is cleared with /run on reboot.
    operation_state_path = raw.get(
        "operation_state_path", os.path.join(os.path.dirname(lock_path), OPERATION_STATE_NAME)
    )
    if not isinstance(operation_state_path, str) or not os.path.isabs(operation_state_path):
        raise AgentError("AGENT_OPERATION_STATE_PATH_INVALID")
    config = dict(raw)
    config["socket_gid"] = socket_gid
    config["lock_path"] = lock_path
    config["operation_state_path"] = operation_state_path
    return config


def run_fixed(argv: list[str], timeout: int = 20) -> str:
    try:
        result = subprocess.run(argv, check=False, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AgentError("HOST_OPERATION_UNAVAILABLE") from exc
    if len(result.stdout.encode("utf-8")) > 1024 * 1024 or len(result.stderr.encode("utf-8")) > 1024 * 1024:
        raise AgentError("HOST_OPERATION_OUTPUT_TOO_LARGE")
    if result.returncode != 0:
        raise AgentError("HOST_OPERATION_FAILED")
    return result.stdout.strip()


def read_bind_address(config: dict[str, Any]) -> tuple[str, str]:
    path = Path(config["env_file"])
    try:
        metadata = path.lstat()
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                or metadata.st_gid != os.getegid() or metadata.st_mode & 0o077):
            raise AgentError("ENV_FILE_PERMISSIONS_INVALID")
        content = path.read_text(encoding="utf-8")
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("ENV_FILE_UNAVAILABLE") from exc
    matches = [line for line in content.splitlines() if line.strip().startswith("HUB_BIND_ADDRESS=")]
    if len(matches) > 1:
        raise AgentError("ENV_BIND_ADDRESS_DUPLICATED")
    if not matches:
        return content, "127.0.0.1"
    value = matches[0].split("=", 1)[1].strip().strip('"').strip("'")
    if not value:
        raise AgentError("ENV_BIND_ADDRESS_INVALID")
    return content, value


def write_bind_address(config: dict[str, Any], address: str) -> None:
    path = Path(config["env_file"])
    try:
        metadata = path.lstat()
        if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                or metadata.st_gid != os.getegid() or metadata.st_mode & 0o077):
            raise AgentError("ENV_FILE_PERMISSIONS_INVALID")
        content = path.read_text(encoding="utf-8")
        mode = stat.S_IMODE(metadata.st_mode)
        lines = content.splitlines(keepends=True)
        updated: list[str] = []
        matches = 0
        for line in lines:
            if line.strip().startswith("HUB_BIND_ADDRESS="):
                matches += 1
                newline = "\r\n" if line.endswith("\r\n") else "\n" if line.endswith("\n") else ""
                updated.append("HUB_BIND_ADDRESS=" + address + newline)
            else:
                updated.append(line)
        if matches > 1:
            raise AgentError("ENV_BIND_ADDRESS_DUPLICATED")
        if matches == 0:
            if updated and not updated[-1].endswith(("\n", "\r")):
                updated[-1] += "\n"
            updated.append("HUB_BIND_ADDRESS=" + address + "\n")
        fd, temporary = tempfile.mkstemp(prefix=".hub-env-", dir=str(path.parent))
        try:
            if hasattr(os, "fchmod"):
                os.fchmod(fd, mode)
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
                stream.write("".join(updated))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            try:
                directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            except OSError:
                if os.name != "nt":
                    raise
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("ENV_FILE_UPDATE_FAILED") from exc


def assigned_interface_addresses(config: dict[str, Any]) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    raw = run_fixed([config["ip_binary"], "-j", "address", "show"], timeout=10)
    try:
        interfaces = json.loads(raw)
        addresses: set[ipaddress.IPv4Address | ipaddress.IPv6Address] = set()
        for interface in interfaces:
            for info in interface.get("addr_info", []):
                local = info.get("local")
                if not local:
                    continue
                flags = set(info.get("flags") or [])
                if flags.intersection({"tentative", "deprecated"}):
                    continue
                address = ipaddress.ip_address(local)
                if not address.is_unspecified and not address.is_multicast and not address.is_link_local:
                    addresses.add(address)
        return addresses
    except Exception as exc:
        if isinstance(exc, AgentError):
            raise
        raise AgentError("HOST_INTERFACE_DISCOVERY_FAILED") from exc


def validate_previous_bind_address(value: str) -> None:
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise AgentError("PREVIOUS_BIND_ADDRESS_INVALID") from exc
    if (address.is_unspecified or address.is_multicast or address.is_link_local
            or (not address.is_private and not address.is_loopback)):
        raise AgentError("PREVIOUS_BIND_ADDRESS_UNSAFE")


def resolve_bind_address(endpoint: dict[str, Any], config: dict[str, Any]) -> str:
    method = endpoint.get("method")
    address_type = endpoint.get("addressType")
    address = endpoint.get("address")
    if method not in ("local", "hostname") or address_type not in ("hostname", "ip") or not isinstance(address, str) or not address:
        raise AgentError("HOST_BIND_ENDPOINT_UNSUPPORTED")
    assigned = assigned_interface_addresses(config)
    candidates: set[ipaddress.IPv4Address | ipaddress.IPv6Address] = set()
    if address_type == "ip":
        try:
            candidates.add(ipaddress.ip_address(address))
        except ValueError as exc:
            raise AgentError("HOST_BIND_ADDRESS_INVALID") from exc
    else:
        try:
            records = socket.getaddrinfo(address, None, type=socket.SOCK_STREAM)
            candidates = {ipaddress.ip_address(record[4][0]) for record in records}
        except Exception as exc:
            raise AgentError("HOST_BIND_HOSTNAME_RESOLUTION_FAILED") from exc
    matches = candidates.intersection(assigned)
    if not matches:
        raise AgentError("HOST_BIND_ADDRESS_NOT_ASSIGNED")
    eligible = sorted(matches, key=lambda item: (item.version != 4, str(item)))
    selected = eligible[0]
    if selected.is_loopback:
        raise AgentError("HOST_BIND_LOOPBACK_NOT_ALLOWED")
    if not selected.is_private and not selected.is_loopback:
        raise AgentError("HOST_BIND_PUBLIC_ADDRESS_NOT_ALLOWED")
    return str(selected)


def compose_web_recreate(config: dict[str, Any]) -> None:
    base = [
        config["docker_binary"], "compose",
        "--project-directory", config["project_dir"],
        "-f", config["compose_file"]
    ]
    run_fixed(base + ["config", "--quiet"], timeout=20)
    run_fixed(base + ["up", "-d", "--no-deps", "--no-build", "web"], timeout=45)


def format_origin(address: str, port: int) -> str:
    host = address
    try:
        parsed = ipaddress.ip_address(address)
        if parsed.version == 6:
            host = "[" + address + "]"
    except ValueError:
        pass
    return "https://" + host + ("" if port == 443 else ":" + str(port))


def verify_https_with_retries(origin: str) -> None:
    last_error: AgentError | None = None
    for attempt in range(5):
        try:
            verify_https(origin)
            return
        except AgentError as exc:
            last_error = exc
            if attempt < 4:
                time.sleep(1)
    raise last_error or AgentError("TLS_OR_ENDPOINT_VERIFICATION_FAILED")


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


def serve_endpoint_state(raw: str, host: str, port: int) -> tuple[bool, str | None]:
    if not raw.strip():
        return False, None
    try:
        value = json.loads(raw)
    except Exception as exc:
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID") from exc
    if not isinstance(value, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    web = value.get("Web") or {}
    if not isinstance(web, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    key = f"{host}:{port}"
    if key not in web:
        return False, None
    endpoint = web[key]
    if not isinstance(endpoint, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    handlers = endpoint.get("Handlers") or {}
    if not isinstance(handlers, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    if "/" not in handlers:
        return True, None
    root_handler = handlers["/"]
    if not isinstance(root_handler, dict):
        raise AgentError("TAILSCALE_SERVE_STATUS_INVALID")
    proxy = root_handler.get("Proxy")
    return True, proxy if isinstance(proxy, str) else None


def has_serve_handler(raw: str, host: str, port: int, target: str) -> bool:
    present, proxy = serve_endpoint_state(raw, host, port)
    return present and proxy == target


def remove_owned_tailscale_serve_endpoint(binary: str, host: str, port: int, target: str) -> None:
    raw = serve_status(binary)
    present, proxy = serve_endpoint_state(raw, host, port)
    if present and proxy == target:
        # Remove only the root handler installed by this agent, not other paths.
        run_fixed([binary, "serve", f"--https={port}", "--set-path=/", "off"], timeout=20)


def ensure_tailscale_serve_endpoint(binary: str, host: str, port: int, target: str) -> bool:
    raw = serve_status(binary)
    present, proxy = serve_endpoint_state(raw, host, port)
    if present:
        if proxy == target:
            return False
        # Never replace another administrator's handler or other Serve app.
        raise AgentError("TAILSCALE_SERVE_CONFLICT")

    try:
        # This is the single fixed route the Hub is permitted to manage.
        run_fixed([binary, "serve", "--bg", "--yes", f"--https={port}", target], timeout=20)
        configured = serve_status(binary)
        if not has_serve_handler(configured, host, port, target):
            raise AgentError("TAILSCALE_SERVE_NOT_CONFIGURED")
        return True
    except AgentError:
        # A CLI failure can occur after the daemon accepted the configuration.
        # Remove only our exact root proxy if it was partially applied.
        try:
            remove_owned_tailscale_serve_endpoint(binary, host, port, target)
        except AgentError as cleanup_error:
            raise AgentError("TAILSCALE_SERVE_ROLLBACK_FAILED") from cleanup_error
        raise


def verify_https(origin: str) -> None:
    context = ssl.create_default_context()
    request = urllib.request.Request(origin + "/health", headers={"User-Agent": "pfSense-Hub-Deployment-Agent/1"})
    try:
        with urllib.request.urlopen(request, timeout=8, context=context) as response:
            expected_url = origin.rstrip("/") + "/health"
            if response.geturl() != expected_url or response.status != 200 or response.read(128).strip() != b"ok":
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
    return allow_funnel.get(str(port)) is True or allow_funnel.get(f"{host}:{port}") is True


def resolve_tailscale_binary(config: dict[str, Any]) -> str:
    configured = config.get("tailscale_binary")
    if isinstance(configured, str) and configured:
        return configured
    discovered = shutil.which("tailscale")
    if discovered:
        return discovered
    raise AgentError("TAILSCALE_NOT_INSTALLED")


def verify_tailscale_endpoint(endpoint: dict[str, Any], config: dict[str, Any]) -> tuple[str, bool]:
    _env_content, current_bind = read_bind_address(config)
    if current_bind != "127.0.0.1":
        raise AgentError("TAILSCALE_LOOPBACK_BINDING_REQUIRED")
    binary = resolve_tailscale_binary(config)
    host = str(endpoint.get("address") or "").rstrip(".").lower()
    port = endpoint.get("port")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.ts\.net", host):
        raise AgentError("TAILSCALE_MAGICDNS_REQUIRED")
    if type(port) is not int or not 1 <= port <= 65535:
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")
    dns_name, _ips, cert_domains = tailscale_identity(binary)
    if host != dns_name:
        raise AgentError("TAILSCALE_ADDRESS_MISMATCH")
    if host not in cert_domains:
        raise AgentError("TAILSCALE_HTTPS_NOT_ENABLED")
    funnel = run_fixed([binary, "funnel", "status", "--json"], timeout=10)
    if has_funnel_handler(funnel, host, port):
        raise AgentError("TAILSCALE_FUNNEL_ALREADY_CONFIGURED")
    created = ensure_tailscale_serve_endpoint(binary, host, port, config["web_local_url"])
    return format_origin(host, port), created


def deploy(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    if set(request) != {"protocolVersion", "operation", "deploymentId", "desiredRevision"}:
        raise AgentError("REQUEST_INVALID")
    if request["operation"] != "deployment.apply":
        raise AgentError("OPERATION_NOT_SUPPORTED")
    if type(request["protocolVersion"]) is not int or request["protocolVersion"] != PROTOCOL_VERSION:
        raise AgentError("PROTOCOL_VERSION_UNSUPPORTED")
    if type(request["desiredRevision"]) is not int or request["desiredRevision"] < 1:
        raise AgentError("REQUEST_INVALID")
    try:
        deployment_id = str(uuid.UUID(request["deploymentId"]))
    except Exception as exc:
        raise AgentError("REQUEST_INVALID") from exc
    revision = request["desiredRevision"]

    endpoint = get_deployment(config, deployment_id, revision)
    if endpoint.get("scheme") != "https":
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")

    method = endpoint.get("method")
    if method == "tailscale":
        if endpoint.get("addressType") != "magic_dns":
            raise AgentError("TLS_METHOD_NOT_SUPPORTED_YET")
        _old_content, old_bind_address = read_bind_address(config)
        validate_previous_bind_address(old_bind_address)
        changed = old_bind_address != "127.0.0.1"
        created_serve = False
        try:
            if changed:
                write_bind_address(config, "127.0.0.1")
                compose_web_recreate(config)
            origin, created_serve = verify_tailscale_endpoint(endpoint, config)
            verify_https_with_retries(origin)
            current = get_deployment(config, deployment_id, revision)
            if current.get("address") != endpoint.get("address") or current.get("port") != endpoint.get("port"):
                raise AgentError("STALE_DEPLOYMENT")
            return {"state": "succeeded", "appliedOrigin": origin}
        except AgentError as failure:
            cleanup_failed = False
            if created_serve:
                try:
                    binary = resolve_tailscale_binary(config)
                    remove_owned_tailscale_serve_endpoint(
                        binary, str(endpoint.get("address") or "").rstrip(".").lower(),
                        int(endpoint.get("port") or 0), config["web_local_url"]
                    )
                except AgentError:
                    cleanup_failed = True
            if not changed:
                if cleanup_failed:
                    raise AgentError("TAILSCALE_SERVE_ROLLBACK_FAILED") from failure
                raise
            try:
                write_bind_address(config, old_bind_address)
                compose_web_recreate(config)
                previous_origin = endpoint.get("previousAppliedOrigin")
                if isinstance(previous_origin, str) and previous_origin.startswith("https://") and not cleanup_failed:
                    verify_https_with_retries(previous_origin)
                    return {
                        "state": "rolled_back",
                        "errorCode": failure.code,
                        "rollbackSucceeded": True
                    }
                return {
                    "state": "failed",
                    "errorCode": "TAILSCALE_SERVE_ROLLBACK_FAILED" if cleanup_failed else failure.code,
                    "rollbackSucceeded": False
                }
            except AgentError:
                return {
                    "state": "failed",
                    "errorCode": "TAILSCALE_SERVE_ROLLBACK_FAILED" if cleanup_failed else failure.code,
                    "rollbackSucceeded": False
                }

    if method not in ("local", "hostname"):
        raise AgentError("DEPLOYMENT_METHOD_UNSUPPORTED")
    address = endpoint.get("address")
    port = endpoint.get("port")
    if not isinstance(address, str) or type(port) is not int or not 1 <= port <= 65535:
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")

    origin = format_origin(address, port)
    _old_content, old_bind_address = read_bind_address(config)
    validate_previous_bind_address(old_bind_address)
    new_bind_address = resolve_bind_address(endpoint, config)
    changed = True
    try:
        if new_bind_address != old_bind_address:
            write_bind_address(config, new_bind_address)
        compose_web_recreate(config)
        verify_https_with_retries(origin)
        current = get_deployment(config, deployment_id, revision)
        if current.get("address") != address or current.get("port") != port:
            raise AgentError("STALE_DEPLOYMENT")
        return {"state": "succeeded", "appliedOrigin": origin}
    except AgentError as failure:
        if not changed:
            raise
        try:
            write_bind_address(config, old_bind_address)
            compose_web_recreate(config)
            previous_origin = endpoint.get("previousAppliedOrigin")
            if isinstance(previous_origin, str) and previous_origin.startswith("https://"):
                verify_https_with_retries(previous_origin)
                return {
                    "state": "rolled_back",
                    "errorCode": failure.code,
                    "rollbackSucceeded": True
                }
            return {
                "state": "failed",
                "errorCode": failure.code,
                "rollbackSucceeded": False
            }
        except AgentError:
            return {
                "state": "failed",
                "errorCode": failure.code,
                "rollbackSucceeded": False
            }


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def redact_text(value: str) -> str:
    cleaned = value.replace("\x00", "").replace("\r", "")
    for pattern, replacement in REDACTIONS:
        cleaned = pattern.sub(replacement, cleaned)
    return cleaned


def run_capture(argv: list[str], timeout: int = 20) -> "subprocess.CompletedProcess[str]":
    """Run a fixed argv and return the raw result without raising on a non-zero exit."""
    try:
        return subprocess.run(argv, check=False, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AgentError("HOST_OPERATION_UNAVAILABLE") from exc


def _cpu_snapshot() -> tuple[int, int] | None:
    try:
        with open("/proc/stat", "r", encoding="utf-8") as handle:
            first = handle.readline()
    except OSError:
        return None
    fields = first.split()
    if not fields or fields[0] != "cpu" or len(fields) < 5:
        return None
    try:
        values = [int(field) for field in fields[1:9]]
    except ValueError:
        return None
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    return (sum(values), idle)


def sample_cpu_percent(interval: float = 0.1) -> float | None:
    """Measure CPU busy percentage between two /proc/stat samples."""
    first = _cpu_snapshot()
    if first is None:
        return None
    if interval > 0:
        time.sleep(interval)
    second = _cpu_snapshot()
    if second is None:
        return None
    total = second[0] - first[0]
    idle = second[1] - first[1]
    if total <= 0:
        return None
    return round(max(0.0, min(100.0, (total - idle) * 100.0 / total)), 1)


def _meminfo() -> dict[str, int] | None:
    try:
        text = Path("/proc/meminfo").read_text(encoding="utf-8")
    except OSError:
        return None
    values: dict[str, int] = {}
    for line in text.splitlines():
        key, _, remainder = line.partition(":")
        fields = remainder.split()
        if fields and fields[0].isdigit():
            values[key.strip()] = int(fields[0]) * 1024
    return values


def collect_host_metrics(config: dict[str, Any]) -> dict[str, Any]:
    memory = _meminfo()
    if not memory or "MemTotal" not in memory or memory["MemTotal"] <= 0:
        raise AgentError("HOST_METRICS_UNAVAILABLE")
    total_memory = memory["MemTotal"]
    available_memory = memory.get("MemAvailable", memory.get("MemFree", 0))
    try:
        disk = shutil.disk_usage(config["project_dir"])
    except OSError as exc:
        raise AgentError("HOST_METRICS_UNAVAILABLE") from exc
    uptime: int | None = None
    try:
        uptime = int(float(Path("/proc/uptime").read_text(encoding="utf-8").split()[0]))
    except (OSError, ValueError, IndexError):
        uptime = None
    load: list[float] | None = None
    try:
        load = [round(value, 2) for value in os.getloadavg()]
    except (OSError, AttributeError):
        load = None
    return {
        "cpuPercent": sample_cpu_percent(),
        "cpuCount": os.cpu_count(),
        "loadAverage": load,
        "memoryPercent": round((total_memory - available_memory) * 100.0 / total_memory, 1),
        "memoryTotalBytes": total_memory,
        "memoryAvailableBytes": available_memory,
        "diskPercent": round(disk.used * 100.0 / disk.total, 1) if disk.total > 0 else None,
        "diskTotalBytes": disk.total,
        "diskFreeBytes": disk.free,
        "uptimeSeconds": uptime,
    }


# Only host-mutating operations take the serialized lock inside the connection
# handler; reads run concurrently. A recovery operation returns its acceptance
# immediately and takes the same lock inside its worker thread instead, so a
# slow Compose action never blocks a status read.
LOCKED_OPERATIONS = frozenset({"deployment.apply"})


SERVICE_STATES = frozenset({"running", "exited", "paused", "restarting", "created", "dead"})
HEALTH_STATES = frozenset({"healthy", "unhealthy", "starting"})


def compose_argv(config: dict[str, Any], *arguments: str) -> list[str]:
    return [
        config["docker_binary"], "compose",
        "--project-directory", config["project_dir"],
        "-f", config["compose_file"],
        *arguments
    ]


def parse_compose_ps(output: str) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            raise AgentError("DOCKER_OUTPUT_INVALID") from exc
        if not isinstance(entry, dict):
            raise AgentError("DOCKER_OUTPUT_INVALID")
        entries.append(entry)
    return entries


def container_details(config: dict[str, Any], name: str | None) -> tuple[int | None, str | None]:
    """Read restart count and start time for one already-validated container name."""
    if not isinstance(name, str) or not CONTAINER_NAME.fullmatch(name):
        return (None, None)
    try:
        output = run_fixed([
            config["docker_binary"], "inspect",
            "--format", "{{.RestartCount}}|{{.State.StartedAt}}", name
        ], timeout=10)
    except AgentError:
        return (None, None)
    restarts_raw, _, started_raw = output.partition("|")
    restarts = int(restarts_raw.strip()) if restarts_raw.strip().isdigit() else None
    match = STARTED_AT.match(started_raw.strip())
    started = match.group(1) + "Z" if match else None
    return (restarts, started)


def docker_services(config: dict[str, Any]) -> list[dict[str, Any]]:
    entries = parse_compose_ps(run_fixed(compose_argv(config, "ps", "--format", "json"), timeout=15))
    by_service: dict[str, dict[str, Any]] = {}
    for entry in entries:
        service = entry.get("Service")
        if isinstance(service, str):
            by_service[service] = entry
    items: list[dict[str, Any]] = []
    for service in SERVICE_NAMES:
        entry = by_service.get(service)
        if entry is None:
            items.append({
                "service": service, "containerName": None, "state": "missing",
                "health": "none", "statusText": None, "restartCount": None, "startedAt": None
            })
            continue
        raw_state = entry.get("State")
        state = raw_state.strip().lower() if isinstance(raw_state, str) else ""
        raw_health = entry.get("Health")
        health = raw_health.strip().lower() if isinstance(raw_health, str) else ""
        raw_status = entry.get("Status")
        raw_name = entry.get("Name")
        name = raw_name if isinstance(raw_name, str) and CONTAINER_NAME.fullmatch(raw_name) else None
        restarts, started = container_details(config, name)
        items.append({
            "service": service,
            "containerName": name,
            "state": state if state in SERVICE_STATES else "unknown",
            "health": health if health in HEALTH_STATES else "none",
            "statusText": redact_text(raw_status)[:200] if isinstance(raw_status, str) and raw_status.strip() else None,
            "restartCount": restarts,
            "startedAt": started
        })
    return items


def require_keys(request: dict[str, Any], allowed: tuple[str, ...]) -> None:
    """Every handler accepts exactly its documented keys; nothing else reaches Docker."""
    if set(request) != set(allowed):
        raise AgentError("REQUEST_INVALID")


def system_status(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    require_keys(request, ("protocolVersion", "operation"))
    collected_at = iso_now()
    try:
        host = collect_host_metrics(config)
    except AgentError as exc:
        return {"state": "error", "errorCode": exc.code}
    try:
        items = docker_services(config)
    except AgentError as exc:
        return {
            "state": "partial",
            "collectedAt": collected_at,
            "host": host,
            "services": {"available": False, "errorCode": exc.code, "items": []}
        }
    return {
        "state": "ok",
        "collectedAt": collected_at,
        "host": host,
        "services": {"available": True, "errorCode": None, "items": items}
    }


def validate_log_request(request: dict[str, Any]) -> tuple[str, int]:
    require_keys(request, ("protocolVersion", "operation", "service", "lines"))
    service = request.get("service")
    tail = request.get("lines")
    if service not in SERVICE_NAMES:
        raise AgentError("SERVICE_NOT_SUPPORTED")
    if type(tail) is not int or not 1 <= tail <= MAX_LOG_LINES:
        raise AgentError("REQUEST_INVALID")
    return (service, tail)


def service_logs(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    service, tail = validate_log_request(request)
    output = run_fixed(
        compose_argv(config, "logs", "--no-color", "--no-log-prefix", "--tail", str(tail), service),
        timeout=20
    )
    lines = [
        redact_text(line)[:MAX_LOG_LINE_CHARS]
        for line in output.splitlines()
        if line.strip()
    ]
    kept = lines[-tail:]
    return {
        "state": "ok",
        "service": service,
        "lines": kept,
        "truncated": len(kept) < len(lines),
        "discardedLines": len(lines) - len(kept),
        "collectedAt": iso_now()
    }


def sanitize_detail(config: dict[str, Any], text: str) -> str:
    cleaned = redact_text(text.replace(config["project_dir"], "<project>"))
    return re.sub(r"\s+", " ", cleaned).strip()[:500]


def compose_validation(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    require_keys(request, ("protocolVersion", "operation"))
    try:
        result = run_capture(compose_argv(config, "config", "--quiet"), timeout=20)
    except AgentError as exc:
        return {"state": "error", "errorCode": exc.code}
    if result.returncode == 0:
        return {"state": "valid"}
    detail = sanitize_detail(config, (result.stderr or result.stdout or "")[-4000:])
    return {"state": "invalid", "detail": detail or "Compose configuration is invalid."}


_JOURNAL_LOCK = threading.Lock()


def validate_operation_id(value: Any) -> str:
    """One manager-assigned UUID per operation; the agent never mints its own."""
    if not isinstance(value, str) or not OPERATION_ID.fullmatch(value):
        raise AgentError("REQUEST_INVALID")
    return value.lower()


def validate_operation_request(request: dict[str, Any]) -> tuple[str, str, str]:
    require_keys(request, ("protocolVersion", "operation", "operationId", "action", "target"))
    operation_id = validate_operation_id(request.get("operationId"))
    action = request.get("action")
    target = request.get("target")
    if not isinstance(action, str) or action not in OPERATION_ACTIONS:
        raise AgentError("OPERATION_ACTION_UNSUPPORTED")
    if not isinstance(target, str) or target not in OPERATION_TARGETS:
        raise AgentError("OPERATION_TARGET_UNSUPPORTED")
    return (operation_id, action, target)


def read_operation_journal(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Read the recovery journal, refusing anything that is not our own file.

    A missing file simply means no operation has ever been accepted. A symlink, a
    foreign owner, malformed JSON, or an unexpected envelope fails closed instead of
    being repaired, because a tampered journal could hide an in-flight mutation.
    """
    path = Path(config["operation_state_path"])
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return {}
    except OSError as exc:
        raise AgentError("OPERATION_JOURNAL_UNAVAILABLE") from exc
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid():
        raise AgentError("OPERATION_JOURNAL_UNAVAILABLE")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise AgentError("OPERATION_JOURNAL_UNAVAILABLE") from exc
    if not isinstance(raw, dict) or not isinstance(raw.get("operations"), dict):
        raise AgentError("OPERATION_JOURNAL_UNAVAILABLE")
    entries: dict[str, dict[str, Any]] = {}
    for key, value in raw["operations"].items():
        if isinstance(key, str) and isinstance(value, dict):
            entries[key] = dict(value)
    return entries


def prune_operation_journal(entries: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Keep every unsettled entry plus the newest settled ones."""
    unsettled = {key: value for key, value in entries.items() if value.get("state") != "completed"}
    settled = [(key, value) for key, value in entries.items() if value.get("state") == "completed"]
    settled.sort(key=lambda item: str(item[1].get("finishedAt") or ""), reverse=True)
    return {**unsettled, **dict(settled[:OPERATION_STATE_MAX])}


def write_operation_journal(config: dict[str, Any], entries: dict[str, dict[str, Any]]) -> None:
    """Replace the journal atomically so a crash never exposes a partial file."""
    path = Path(config["operation_state_path"])
    payload = json.dumps({"version": 1, "operations": entries}, separators=(",", ":")).encode()
    temporary = ""
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
        with tempfile.NamedTemporaryFile(
            dir=str(path.parent), prefix=".host-operations-", delete=False
        ) as handle:
            temporary = handle.name
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, str(path))
        temporary = ""
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("OPERATION_JOURNAL_UNAVAILABLE") from exc
    finally:
        if temporary:
            try:
                os.unlink(temporary)
            except OSError:
                pass


def update_operation_entry(config: dict[str, Any], operation_id: str, **fields: Any) -> None:
    with _JOURNAL_LOCK:
        entries = read_operation_journal(config)
        entry = entries.get(operation_id)
        if entry is None:
            raise AgentError("OPERATION_NOT_FOUND")
        entry.update(fields)
        entries[operation_id] = entry
        write_operation_journal(config, prune_operation_journal(entries))


def operation_argv(config: dict[str, Any], action: str, target: str) -> list[str]:
    """Build the one fixed Compose argv for an allowlisted action/target pair.

    Both enumerations were already validated, and the target is interpolated only
    after it matched, so the manager can never reach an arbitrary service name or
    extra Compose flag.
    """
    if action not in OPERATION_ACTIONS or target not in OPERATION_TARGETS:
        raise AgentError("REQUEST_INVALID")
    arguments = [target] if target != "stack" else []
    if action == "start":
        return compose_argv(config, "up", "-d", *arguments)
    if action == "stop":
        return compose_argv(config, "stop", *arguments)
    return compose_argv(config, "restart", *arguments)


def execute_operation(config: dict[str, Any], action: str, target: str) -> None:
    result = run_capture(operation_argv(config, action, target), timeout=OPERATION_EXEC_TIMEOUT)
    if result.returncode != 0:
        raise AgentError("HOST_OPERATION_FAILED")


def operation_state_is_satisfied(config: dict[str, Any], action: str, target: str) -> bool:
    """Confirm the requested end state independently of the command's exit code."""
    entries = parse_compose_ps(run_fixed(compose_argv(config, "ps", "--format", "json"), timeout=15))
    observed: dict[str, str] = {}
    for entry in entries:
        service = entry.get("Service")
        state = entry.get("State")
        if isinstance(service, str) and isinstance(state, str):
            observed[service] = state.strip().lower()
    services = SERVICE_NAMES if target == "stack" else (target,)
    for service in services:
        state = observed.get(service)
        if state is None:
            # A stopped stack may have no container at all; a missing container can
            # never satisfy a start or restart.
            if action == "stop":
                continue
            return False
        if action == "stop":
            if state not in OPERATION_STOPPED_STATES:
                return False
        elif state != "running":
            return False
    return True


def wait_for_operation_state(config: dict[str, Any], action: str, target: str) -> bool:
    """Poll briefly, because Compose reports success before containers settle."""
    for attempt in range(OPERATION_VERIFY_ATTEMPTS):
        try:
            if operation_state_is_satisfied(config, action, target):
                return True
        except AgentError:
            # A transient Docker failure is retried; the last attempt decides.
            pass
        if attempt + 1 < OPERATION_VERIFY_ATTEMPTS:
            time.sleep(OPERATION_VERIFY_INTERVAL)
    return False


def record_operation_outcome(
    config: dict[str, Any], operation_id: str, result: str, error_code: str | None, verified: bool
) -> None:
    """Write the terminal entry; a journal failure is never raised to the caller."""
    try:
        update_operation_entry(
            config, operation_id,
            state="completed", result=result, errorCode=error_code,
            verified=verified, finishedAt=iso_now(),
        )
    except Exception:
        pass


def run_operation(config: dict[str, Any], operation_id: str, action: str, target: str) -> None:
    """Execute one accepted operation under the same lock as a deployment apply.

    Serializing through the existing lock file keeps a recovery action and a
    deployment from recreating containers at the same time; the OS releases the
    lock if this process dies, so a crash cannot wedge the agent.
    """
    import fcntl
    try:
        lock_path = Path(config["lock_path"])
        lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
        with lock_path.open("w", encoding="utf-8") as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
            try:
                update_operation_entry(config, operation_id, state="running", startedAt=iso_now())
            except AgentError as exc:
                record_operation_outcome(config, operation_id, "failed", exc.code, False)
                return
            try:
                execute_operation(config, action, target)
            except AgentError as exc:
                record_operation_outcome(config, operation_id, "failed", exc.code, False)
                return
            except Exception:
                record_operation_outcome(config, operation_id, "failed", "HOST_AGENT_FAILURE", False)
                return
            if wait_for_operation_state(config, action, target):
                record_operation_outcome(config, operation_id, "succeeded", None, True)
            else:
                record_operation_outcome(config, operation_id, "failed", "OPERATION_UNVERIFIED", False)
    except AgentError as exc:
        record_operation_outcome(config, operation_id, "failed", exc.code, False)
    except Exception:
        record_operation_outcome(config, operation_id, "failed", "HOST_AGENT_FAILURE", False)


def request_operation(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    """Accept or replay one operation, then execute it exactly once.

    The journal entry is durable before the response is written, and an existing
    UUID is never executed twice: a retried dispatch only repeats the acceptance,
    and the manager reads the real outcome with ``system.operationResult``.
    """
    operation_id, action, target = validate_operation_request(request)
    with _JOURNAL_LOCK:
        entries = read_operation_journal(config)
        existing = entries.get(operation_id)
        if existing is not None:
            if existing.get("action") != action or existing.get("target") != target:
                raise AgentError("OPERATION_CONFLICT")
            return {"state": "accepted", "operationId": operation_id}
        entries[operation_id] = {
            "operationId": operation_id,
            "action": action,
            "target": target,
            "state": "queued",
            "result": None,
            "errorCode": None,
            "verified": False,
            "requestedAt": iso_now(),
            "startedAt": None,
            "finishedAt": None,
        }
        write_operation_journal(config, prune_operation_journal(entries))
    threading.Thread(
        target=run_operation, args=(config, operation_id, action, target), daemon=True
    ).start()
    return {"state": "accepted", "operationId": operation_id}


def operation_result(config: dict[str, Any], request: dict[str, Any]) -> dict[str, Any]:
    """Report the journaled outcome. This handler never executes anything."""
    require_keys(request, ("protocolVersion", "operation", "operationId"))
    operation_id = validate_operation_id(request.get("operationId"))
    with _JOURNAL_LOCK:
        entry = read_operation_journal(config).get(operation_id)
    if entry is None:
        raise AgentError("OPERATION_NOT_FOUND")
    if entry.get("state") != "completed":
        return {"state": "pending"}
    result = entry.get("result")
    error_code = entry.get("errorCode")
    finished_at = entry.get("finishedAt")
    if (result not in ("succeeded", "failed") or not isinstance(finished_at, str)
            or not OPERATION_TIMESTAMP.fullmatch(finished_at)
            or (error_code is not None
                and (not isinstance(error_code, str) or not SAFE_ERROR.fullmatch(error_code)))):
        raise AgentError("OPERATION_JOURNAL_INVALID")
    return {
        "state": "completed",
        "result": result,
        "errorCode": error_code,
        "verified": entry.get("verified") is True,
        "finishedAt": finished_at,
    }


def dispatch_result(config: dict[str, Any], request: Any) -> dict[str, Any]:
    """Convert handler outcomes into the single response envelope the API expects.

    Deployment results are a closed set that predates the operation discriminator
    and carry ``rollbackSucceeded``; every other operation answers with the strict
    ``{"state": "error", "errorCode": ...}`` envelope so the API can distinguish a
    protocol mismatch from a malformed response.
    """
    operation = request.get("operation") if isinstance(request, dict) else None
    deployment = operation == "deployment.apply"
    try:
        return dispatch(config, request)
    except AgentError as exc:
        if deployment:
            return {"state": "failed", "errorCode": exc.code, "rollbackSucceeded": None}
        return {"state": "error", "errorCode": exc.code}
    except Exception:
        if deployment:
            return {"state": "failed", "errorCode": "HOST_AGENT_FAILURE", "rollbackSucceeded": None}
        return {"state": "error", "errorCode": "HOST_AGENT_FAILURE"}


HANDLERS = {
    "deployment.apply": deploy,
    "system.status": system_status,
    "system.logs": service_logs,
    "compose.validate": compose_validation,
    "system.operation": request_operation,
    "system.operationResult": operation_result,
}


def dispatch(config: dict[str, Any], request: Any) -> dict[str, Any]:
    """Route one validated protocol request to its single allowlisted handler.

    Unknown operations fail closed instead of being inferred from the request
    shape, so a caller can never reach an unimplemented host capability.
    """
    if not isinstance(request, dict):
        raise AgentError("REQUEST_INVALID")
    if type(request.get("protocolVersion")) is not int or request["protocolVersion"] != PROTOCOL_VERSION:
        raise AgentError("PROTOCOL_VERSION_UNSUPPORTED")
    operation = request.get("operation")
    if not isinstance(operation, str) or operation not in HANDLERS:
        raise AgentError("OPERATION_NOT_SUPPORTED")
    return HANDLERS[operation](config, request)


def handle_client(conn: socket.socket, config: dict[str, Any], lock_path: Path) -> None:
    import fcntl
    try:
        conn.settimeout(270)
        data = bytearray()
        while b"\n" not in data and len(data) <= MAX_LINE:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data.extend(chunk)
        if len(data) > MAX_LINE or b"\n" not in data:
            raise AgentError("REQUEST_TOO_LARGE_OR_INCOMPLETE")
        request = json.loads(bytes(data).split(b"\n", 1)[0])
        operation = request.get("operation") if isinstance(request, dict) else None
        if operation in LOCKED_OPERATIONS:
            with lock_path.open("w", encoding="utf-8") as lock:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
                try:
                    result = dispatch_result(config, request)
                finally:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        else:
            result = dispatch_result(config, request)
        conn.sendall(json.dumps(result, separators=(",", ":")).encode() + b"\n")
    except Exception:
        try:
            conn.sendall(b'{"state":"failed","errorCode":"REQUEST_INVALID","rollbackSucceeded":null}\n')
        except OSError:
            pass
    finally:
        conn.close()


def parse_config_path(argv: list[str]) -> Path:
    if not argv:
        return CONFIG_PATH
    if len(argv) != 2 or argv[0] != "--config":
        raise SystemExit("Usage: pfsense_hub_agent.py [--config /absolute/path/deployment-agent.json]")
    path = Path(argv[1])
    if not path.is_absolute():
        raise SystemExit("The agent configuration path must be absolute.")
    return path


def require_socket_group(socket_gid: int) -> None:
    # Granting a socket group access requires privilege unless that group already
    # belongs to this account. Fail closed instead of silently widening access.
    if os.geteuid() != 0 and socket_gid != os.getegid() and socket_gid not in os.getgroups():
        raise SystemExit("AGENT_SOCKET_GROUP_REQUIRES_ROOT: the agent cannot grant its socket group access.")


def main() -> None:
    config = load_config(parse_config_path(sys.argv[1:]))
    socket_path = Path(config["socket_path"])
    socket_gid = config["socket_gid"]
    require_socket_group(socket_gid)
    socket_path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    try:
        socket_path.unlink()
    except FileNotFoundError:
        pass
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(str(socket_path))
    os.chown(socket_path, os.geteuid(), socket_gid)
    os.chmod(socket_path, 0o660)
    server.listen(8)
    lock_path = Path(config["lock_path"])
    lock_path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    while True:
        conn, _ = server.accept()
        # One thread per connection: a slow log read must not block status polling,
        # while mutating operations stay serialized by the lock file.
        threading.Thread(
            target=handle_client, args=(conn, config, lock_path), daemon=True
        ).start()


if __name__ == "__main__":
    try:
        main()
    except AgentError as startup_failure:
        # Report the safe error code without a traceback or configuration contents.
        raise SystemExit(f"Host Agent failed to start: {startup_failure.code}")

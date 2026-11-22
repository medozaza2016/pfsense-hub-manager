#!/usr/bin/env python3
"""Restricted Linux host agent for pfSense Hub Manager.

The agent accepts only deployment UUID/revision requests over a Unix socket.
It never accepts shell commands, filesystem paths, Compose arguments, or env
values from the API. It changes only HUB_BIND_ADDRESS in the fixed project .env
and recreates only the fixed web service, or verifies an operator-managed
Tailscale MagicDNS Serve endpoint. DNS, TLS termination, reverse proxies, and
Tailscale configuration remain operator-managed.
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
    try:
        project_stat = Path(raw["project_dir"]).stat()
        compose_stat = Path(raw["compose_file"]).stat()
        if (project_stat.st_uid != 0 or project_stat.st_mode & 0o022
                or not stat.S_ISREG(compose_stat.st_mode) or compose_stat.st_uid != 0
                or compose_stat.st_mode & 0o022):
            raise AgentError("AGENT_PROJECT_PERMISSIONS_INVALID")
    except AgentError:
        raise
    except Exception as exc:
        raise AgentError("AGENT_PROJECT_UNAVAILABLE") from exc
    if raw["web_local_url"] != "http://127.0.0.1:8080":
        raise AgentError("AGENT_WEB_TARGET_INVALID")
    return raw


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
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_gid != 0 or metadata.st_mode & 0o022:
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
        metadata = path.stat()
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
            os.fchmod(fd, mode)
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
                stream.write("".join(updated))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
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
    if method == "hostname" and selected.is_loopback:
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


def verify_tailscale_endpoint(endpoint: dict[str, Any], config: dict[str, Any]) -> str:
    _env_content, current_bind = read_bind_address(config)
    if current_bind != "127.0.0.1":
        raise AgentError("TAILSCALE_LOOPBACK_BINDING_REQUIRED")
    binary = config.get("tailscale_binary") or ""
    if not binary:
        raise AgentError("TAILSCALE_NOT_INSTALLED")
    host = str(endpoint.get("address") or "").rstrip(".").lower()
    port = endpoint.get("port")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.ts\.net", host):
        raise AgentError("TAILSCALE_MAGICDNS_REQUIRED")
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")
    dns_name, _ips, cert_domains = tailscale_identity(binary)
    if host != dns_name:
        raise AgentError("TAILSCALE_ADDRESS_MISMATCH")
    if host not in cert_domains:
        raise AgentError("TAILSCALE_HTTPS_NOT_ENABLED")
    serve = serve_status(binary)
    if not has_serve_handler(serve, host, port, config["web_local_url"]):
        raise AgentError("TAILSCALE_SERVE_NOT_CONFIGURED")
    funnel = run_fixed([binary, "funnel", "status", "--json"], timeout=10)
    if has_funnel_handler(funnel, host, port):
        raise AgentError("TAILSCALE_FUNNEL_ALREADY_CONFIGURED")
    return format_origin(host, port)


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
    if endpoint.get("scheme") != "https":
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")

    method = endpoint.get("method")
    if method == "tailscale":
        if endpoint.get("addressType") != "magic_dns":
            raise AgentError("TLS_METHOD_NOT_SUPPORTED_YET")
        origin = verify_tailscale_endpoint(endpoint, config)
        verify_https_with_retries(origin)
        current = get_deployment(config, deployment_id, revision)
        if current.get("address") != endpoint.get("address") or current.get("port") != endpoint.get("port"):
            raise AgentError("STALE_DEPLOYMENT")
        return {"state": "succeeded", "appliedOrigin": origin}

    if method not in ("local", "hostname"):
        raise AgentError("DEPLOYMENT_METHOD_UNSUPPORTED")
    address = endpoint.get("address")
    port = endpoint.get("port")
    if not isinstance(address, str) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise AgentError("DEPLOYMENT_ENDPOINT_INVALID")

    origin = format_origin(address, port)
    _old_content, old_bind_address = read_bind_address(config)
    new_bind_address = resolve_bind_address(endpoint, config)
    changed = False
    try:
        if new_bind_address != old_bind_address:
            changed = True
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

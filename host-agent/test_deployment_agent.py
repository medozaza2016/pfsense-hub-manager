import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("pfsense_hub_agent.py")
SPEC = importlib.util.spec_from_file_location("pfsense_hub_agent", MODULE_PATH)
agent = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(agent)


class DeploymentAgentTests(unittest.TestCase):
    def setUp(self):
        self.config = {
            "api_base_url": "http://127.0.0.1:3001",
            "api_token": "x" * 40,
            "socket_path": "/tmp/agent.sock",
            "tailscale_binary": "/usr/bin/tailscale",
            "docker_binary": "/usr/bin/docker",
            "ip_binary": "/usr/sbin/ip",
            "project_dir": "/opt/pfsense-hub",
            "compose_file": "/opt/pfsense-hub/compose.yaml",
            "env_file": "/opt/pfsense-hub/.env",
            "web_local_url": "http://127.0.0.1:8080",
        }
        self.request = {
            "protocolVersion": 1,
            "deploymentId": "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
            "desiredRevision": 3,
        }
        self.endpoint = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "tailscale",
            "scheme": "https",
            "addressType": "magic_dns",
            "address": "hub.example.ts.net",
            "port": 443,
        }
        self.serve_status = (
            '{"Web":{"hub.example.ts.net:443":{"Handlers":{"/":'
            '{"Proxy":"http://127.0.0.1:8080"}}}}}'
        )

    def test_rejects_unknown_request_fields(self):
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, {**self.request, "command": "id"})
        self.assertEqual(caught.exception.code, "REQUEST_INVALID")

    @patch.object(agent, "get_deployment")
    def test_rejects_lan_and_custom_until_tls_is_provisioned(self, get_deployment):
        get_deployment.return_value = {**self.endpoint, "method": "local", "addressType": None, "address": None}
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TLS_METHOD_NOT_SUPPORTED_YET")

    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}, {"hub.example.ts.net"}))
    @patch.object(agent, "get_deployment")
    def test_requires_exact_magicdns_identity(self, get_deployment, identity):
        get_deployment.return_value = {**self.endpoint, "address": "other-device.example.ts.net"}
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TAILSCALE_ADDRESS_MISMATCH")

    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}, set()))
    @patch.object(agent, "get_deployment")
    def test_requires_tailscale_https_certificate_eligibility(self, get_deployment, identity):
        get_deployment.return_value = self.endpoint
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TAILSCALE_HTTPS_NOT_ENABLED")

    @patch.object(agent, "serve_status", return_value="")
    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}, {"hub.example.ts.net"}))
    @patch.object(agent, "get_deployment")
    def test_requires_an_operator_configured_serve_route(self, get_deployment, identity, serve_status):
        get_deployment.return_value = self.endpoint
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TAILSCALE_SERVE_NOT_CONFIGURED")

    @patch.object(agent, "run_fixed", return_value='{"AllowFunnel":{"hub.example.ts.net:443":true}}')
    @patch.object(agent, "serve_status", return_value='{"Web":{"hub.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8080"}}}}}')
    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}, {"hub.example.ts.net"}))
    @patch.object(agent, "get_deployment")
    def test_refuses_a_public_funnel_route(self, get_deployment, identity, serve_status, run_fixed):
        get_deployment.return_value = self.endpoint
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TAILSCALE_FUNNEL_ALREADY_CONFIGURED")

    @patch.object(agent, "verify_https")
    @patch.object(agent, "run_fixed", return_value='{"AllowFunnel":{}}')
    @patch.object(agent, "serve_status")
    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}, {"hub.example.ts.net"}))
    @patch.object(agent, "get_deployment")
    def test_verifies_preconfigured_private_serve_route(self, get_deployment, identity, serve_status, run_fixed, verify_https):
        get_deployment.return_value = self.endpoint
        serve_status.return_value = self.serve_status
        result = agent.deploy(self.config, self.request)
        self.assertEqual(result, {"state": "succeeded", "appliedOrigin": "https://hub.example.ts.net"})
        verify_https.assert_called_once_with("https://hub.example.ts.net")
        run_fixed.assert_called_once_with(
            ["/usr/bin/tailscale", "funnel", "status", "--json"], timeout=10
        )
        self.assertEqual(get_deployment.call_count, 2)

    @patch.object(agent, "verify_https", side_effect=agent.AgentError("TLS_OR_ENDPOINT_VERIFICATION_FAILED"))
    @patch.object(agent, "run_fixed", return_value='{"AllowFunnel":{}}')
    @patch.object(agent, "serve_status")
    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}, {"hub.example.ts.net"}))
    @patch.object(agent, "get_deployment")
    def test_probe_failure_does_not_mutate_operator_managed_serve(self, get_deployment, identity, serve_status, run_fixed, verify_https):
        get_deployment.return_value = self.endpoint
        serve_status.return_value = self.serve_status
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TLS_OR_ENDPOINT_VERIFICATION_FAILED")
        run_fixed.assert_called_once_with(
            ["/usr/bin/tailscale", "funnel", "status", "--json"], timeout=10
        )



    @patch.object(agent, "verify_https_with_retries")
    @patch.object(agent, "compose_web_recreate")
    @patch.object(agent, "write_bind_address")
    @patch.object(agent, "resolve_bind_address", return_value="192.168.1.20")
    @patch.object(agent, "read_bind_address", return_value=("HUB_BIND_ADDRESS=127.0.0.1\\n", "127.0.0.1"))
    @patch.object(agent, "get_deployment")
    def test_applies_local_bind_address_and_verifies_external_tls(self, get_deployment, read_bind, resolve, write_bind, recreate, verify):
        endpoint = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "local",
            "scheme": "https",
            "addressType": "ip",
            "address": "192.168.1.20",
            "port": 443,
            "previousAppliedOrigin": "https://old.example.com",
        }
        get_deployment.return_value = endpoint
        result = agent.deploy(self.config, self.request)
        self.assertEqual(result, {"state": "succeeded", "appliedOrigin": "https://192.168.1.20"})
        write_bind.assert_called_once_with(self.config, "192.168.1.20")
        recreate.assert_called_once_with(self.config)
        verify.assert_called_once_with("https://192.168.1.20")

    @patch.object(agent, "verify_https_with_retries", side_effect=[
        agent.AgentError("TLS_OR_ENDPOINT_VERIFICATION_FAILED"), None
    ])
    @patch.object(agent, "compose_web_recreate")
    @patch.object(agent, "write_bind_address")
    @patch.object(agent, "resolve_bind_address", return_value="192.168.1.20")
    @patch.object(agent, "read_bind_address", return_value=("HUB_BIND_ADDRESS=127.0.0.1\\n", "127.0.0.1"))
    @patch.object(agent, "get_deployment")
    def test_restores_previous_bind_and_verifies_previous_origin_after_failure(self, get_deployment, read_bind, resolve, write_bind, recreate, verify):
        get_deployment.return_value = {
            **self.endpoint,
            "method": "hostname",
            "addressType": "hostname",
            "address": "hub.example.com",
            "port": 443,
            "previousAppliedOrigin": "https://old.example.com",
        }
        result = agent.deploy(self.config, self.request)
        self.assertEqual(result, {
            "state": "rolled_back",
            "errorCode": "TLS_OR_ENDPOINT_VERIFICATION_FAILED",
            "rollbackSucceeded": True,
        })
        self.assertEqual(write_bind.call_args_list[0].args, (self.config, "192.168.1.20"))
        self.assertEqual(write_bind.call_args_list[1].args, (self.config, "127.0.0.1"))
        self.assertEqual(recreate.call_count, 2)
        verify.assert_any_call("https://hub.example.com")
        verify.assert_any_call("https://old.example.com")

    @patch.object(agent, "socket.getaddrinfo", return_value=[(2, 1, 6, "", ("192.168.1.20", 0))])
    @patch.object(agent, "assigned_interface_addresses", return_value={agent.ipaddress.ip_address("192.168.1.20")})
    def test_resolves_hostname_only_to_an_address_assigned_to_this_host(self, assigned, getaddrinfo):
        endpoint = {
            "method": "hostname",
            "addressType": "hostname",
            "address": "hub.example.com",
        }
        self.assertEqual(agent.resolve_bind_address(endpoint, self.config), "192.168.1.20")

    @patch.object(agent, "socket.getaddrinfo", return_value=[(2, 1, 6, "", ("192.168.1.30", 0))])
    @patch.object(agent, "assigned_interface_addresses", return_value={agent.ipaddress.ip_address("192.168.1.20")})
    def test_rejects_hostname_that_does_not_resolve_to_a_local_interface(self, assigned, getaddrinfo):
        endpoint = {
            "method": "hostname",
            "addressType": "hostname",
            "address": "other.example.com",
        }
        with self.assertRaises(agent.AgentError) as caught:
            agent.resolve_bind_address(endpoint, self.config)
        self.assertEqual(caught.exception.code, "HOST_BIND_ADDRESS_NOT_ASSIGNED")


    def test_updates_only_hub_bind_address_and_preserves_other_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            env_path.write_text("POSTGRES_PASSWORD=keep-this\\nHUB_BIND_ADDRESS=127.0.0.1\\nWEB_PORT=8080\\n", encoding="utf-8")
            config = {**self.config, "env_file": str(env_path)}
            agent.write_bind_address(config, "192.168.1.20")
            self.assertEqual(
                env_path.read_text(encoding="utf-8"),
                "POSTGRES_PASSWORD=keep-this\\nHUB_BIND_ADDRESS=192.168.1.20\\nWEB_PORT=8080\\n"
            )


    @patch.object(agent, "run_fixed")
    def test_compose_recreation_targets_only_web_without_build_or_dependencies(self, run_fixed):
        agent.compose_web_recreate(self.config)
        self.assertEqual(run_fixed.call_count, 2)
        self.assertEqual(run_fixed.call_args_list[0].args[0][-2:], ["config", "--quiet"])
        self.assertEqual(
            run_fixed.call_args_list[1].args[0][-5:],
            ["up", "-d", "--no-deps", "web"]
        )
        self.assertEqual(run_fixed.call_args_list[1].kwargs, {"timeout": 60})

if __name__ == "__main__":
    unittest.main()

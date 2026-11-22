import importlib.util
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


if __name__ == "__main__":
    unittest.main()

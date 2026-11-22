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
            "socket_gid": 2000,
            "tailscale_binary": "/usr/bin/tailscale",
            "web_local_url": "http://127.0.0.1:8080",
        }
        self.request = {
            "protocolVersion": 1,
            "deploymentId": "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
            "desiredRevision": 3,
        }

    def test_rejects_unknown_request_fields(self):
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, {**self.request, "command": "id"})
        self.assertEqual(caught.exception.code, "REQUEST_INVALID")

    @patch.object(agent, "get_deployment")
    def test_rejects_lan_and_custom_until_tls_is_provisioned(self, get_deployment):
        get_deployment.return_value = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "local",
            "scheme": "https",
            "addressType": None,
            "address": None,
            "port": 443,
        }
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TLS_METHOD_NOT_SUPPORTED_YET")

    @patch.object(agent, "tailscale_identity")
    @patch.object(agent, "serve_status")
    @patch.object(agent, "get_deployment")
    def test_requires_exact_magicdns_identity(self, get_deployment, serve_status, identity):
        get_deployment.return_value = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "tailscale",
            "scheme": "https",
            "addressType": "magic_dns",
            "address": "other-device.example.ts.net",
            "port": 443,
        }
        serve_status.return_value = "{}"
        identity.return_value = ("hub.example.ts.net", {"100.64.0.2"})
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TAILSCALE_ADDRESS_MISMATCH")

    @patch.object(agent, "run_fixed", return_value="{}")
    @patch.object(agent, "serve_status")
    @patch.object(agent, "tailscale_identity")
    @patch.object(agent, "get_deployment")
    def test_does_not_overwrite_existing_serve_configuration(self, get_deployment, identity, serve_status, run_fixed):
        get_deployment.return_value = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "tailscale",
            "scheme": "https",
            "addressType": "magic_dns",
            "address": "hub.example.ts.net",
            "port": 443,
        }
        identity.return_value = ("hub.example.ts.net", {"100.64.0.2"})
        serve_status.return_value = '{"Web":{"hub.example.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8080"}}}}}'
        with self.assertRaises(agent.AgentError) as caught:
            agent.deploy(self.config, self.request)
        self.assertEqual(caught.exception.code, "TAILSCALE_SERVE_ALREADY_CONFIGURED")



    @patch.object(agent, "verify_https")
    @patch.object(agent, "run_fixed", side_effect=["{}", ""])
    @patch.object(agent, "serve_status", side_effect=["{}"])
    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}))
    @patch.object(agent, "get_deployment")
    def test_applies_and_verifies_tailscale_serve(self, get_deployment, identity, serve_status, run_fixed, verify_https):
        get_deployment.return_value = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "tailscale",
            "scheme": "https",
            "addressType": "magic_dns",
            "address": "hub.example.ts.net",
            "port": 443,
        }
        result = agent.deploy(self.config, self.request)
        self.assertEqual(result, {"state": "succeeded", "appliedOrigin": "https://hub.example.ts.net"})
        verify_https.assert_called_once_with("https://hub.example.ts.net")
        self.assertEqual(run_fixed.call_args_list[1].args[0], [
            "/usr/bin/tailscale", "serve", "--bg", "--https=443", "http://127.0.0.1:8080"
        ])

    @patch.object(agent, "verify_https", side_effect=agent.AgentError("TLS_OR_ENDPOINT_VERIFICATION_FAILED"))
    @patch.object(agent, "run_fixed", side_effect=["{}", "", ""])
    @patch.object(agent, "serve_status", side_effect=["{}", "{}"])
    @patch.object(agent, "tailscale_identity", return_value=("hub.example.ts.net", {"100.64.0.2"}))
    @patch.object(agent, "get_deployment")
    def test_rolls_back_its_own_serve_endpoint_when_tls_probe_fails(self, get_deployment, identity, serve_status, run_fixed, verify_https):
        get_deployment.return_value = {
            "deploymentId": self.request["deploymentId"],
            "desiredRevision": 3,
            "method": "tailscale",
            "scheme": "https",
            "addressType": "magic_dns",
            "address": "hub.example.ts.net",
            "port": 443,
        }
        result = agent.deploy(self.config, self.request)
        self.assertEqual(result, {
            "state": "rolled_back",
            "errorCode": "TLS_OR_ENDPOINT_VERIFICATION_FAILED",
            "rollbackSucceeded": True,
        })
        self.assertEqual(run_fixed.call_args_list[2].args[0], [
            "/usr/bin/tailscale", "serve", "--https=443", "off"
        ])

if __name__ == "__main__":
    unittest.main()

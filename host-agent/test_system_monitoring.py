import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("pfsense_hub_agent.py")
SPEC = importlib.util.spec_from_file_location("pfsense_hub_agent_monitoring", MODULE_PATH)
agent = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(agent)

PS_OUTPUT = "\n".join([
    json.dumps({
        "Service": "web",
        "Name": "pfsense-hub-web-1",
        "State": "running",
        "Health": "healthy",
        "Status": "Up 2 hours (healthy)",
    }),
    json.dumps({
        "Service": "api",
        "Name": "pfsense-hub-api-1",
        "State": "exited",
        "Health": "",
        "Status": "Exited (1)",
    }),
])

CONFIG = {
    "docker_binary": "/usr/bin/docker",
    "project_dir": "/opt/pfsense-hub",
    "compose_file": "/opt/pfsense-hub/compose.yaml",
    "env_file": "/opt/pfsense-hub/.env",
    "socket_path": "/run/pfsense-hub/deployment.sock",
}


class HostMonitoringTests(unittest.TestCase):
    def test_dispatch_rejects_unknown_operations_and_versions(self):
        with self.assertRaises(agent.AgentError) as unknown:
            agent.dispatch(CONFIG, {"protocolVersion": 2, "operation": "system.reboot"})
        self.assertEqual(unknown.exception.code, "OPERATION_NOT_SUPPORTED")

        with self.assertRaises(agent.AgentError) as stale:
            agent.dispatch(CONFIG, {"protocolVersion": 1, "operation": "system.status"})
        self.assertEqual(stale.exception.code, "PROTOCOL_VERSION_UNSUPPORTED")

        with self.assertRaises(agent.AgentError) as shape:
            agent.dispatch(CONFIG, ["system.status"])
        self.assertEqual(shape.exception.code, "REQUEST_INVALID")

    def test_dispatch_rejects_extra_keys_on_a_read_operation(self):
        with self.assertRaises(agent.AgentError) as exc:
            agent.dispatch(CONFIG, {
                "protocolVersion": 2,
                "operation": "system.status",
                "command": "id",
            })
        self.assertEqual(exc.exception.code, "REQUEST_INVALID")

    def test_collects_host_metrics_from_proc_files(self):
        config = {**CONFIG, "project_dir": tempfile.gettempdir()}
        metrics = agent.collect_host_metrics(config)
        self.assertEqual(set(metrics), {
            "cpuPercent", "cpuCount", "loadAverage", "memoryPercent",
            "memoryTotalBytes", "memoryAvailableBytes", "diskPercent",
            "diskTotalBytes", "diskFreeBytes", "uptimeSeconds",
        })
        self.assertGreater(metrics["memoryTotalBytes"], 0)
        self.assertIsNotNone(metrics["memoryPercent"])
        self.assertLessEqual(metrics["memoryPercent"], 100)
        self.assertIsNotNone(metrics["diskPercent"])
        if metrics["cpuPercent"] is not None:
            self.assertGreaterEqual(metrics["cpuPercent"], 0)
            self.assertLessEqual(metrics["cpuPercent"], 100)

    def test_metrics_fail_closed_without_meminfo(self):
        with patch.object(agent, "_meminfo", return_value=None):
            with self.assertRaises(agent.AgentError) as exc:
                agent.collect_host_metrics(CONFIG)
        self.assertEqual(exc.exception.code, "HOST_METRICS_UNAVAILABLE")

    def test_maps_compose_services_and_reports_missing_containers(self):
        with patch.object(agent, "run_fixed", return_value=PS_OUTPUT) as run_fixed, \
                patch.object(agent, "container_details", side_effect=[
                    (0, "2026-11-22T07:00:00Z"),
                    (3, "2026-11-22T06:00:00Z"),
                ]):
            items = agent.docker_services(CONFIG)
        self.assertEqual([item["service"] for item in items], ["web", "api", "db"])
        self.assertEqual(items[0]["state"], "running")
        self.assertEqual(items[0]["health"], "healthy")
        self.assertEqual(items[0]["containerName"], "pfsense-hub-web-1")
        self.assertEqual(items[0]["startedAt"], "2026-11-22T07:00:00Z")
        self.assertEqual(items[1]["state"], "exited")
        self.assertEqual(items[1]["health"], "none")
        self.assertEqual(items[1]["restartCount"], 3)
        self.assertEqual(items[2]["state"], "missing")
        self.assertIsNone(items[2]["containerName"])
        self.assertEqual(run_fixed.call_args.args[0][:2], ["/usr/bin/docker", "compose"])

    def test_status_degrades_to_partial_when_docker_is_unavailable(self):
        with patch.object(agent, "collect_host_metrics", return_value={"cpuPercent": 1.0}), \
                patch.object(agent, "docker_services", side_effect=agent.AgentError("DOCKER_UNAVAILABLE")):
            result = agent.system_status(CONFIG, {"protocolVersion": 2, "operation": "system.status"})
        self.assertEqual(result["state"], "partial")
        self.assertFalse(result["services"]["available"])
        self.assertEqual(result["services"]["errorCode"], "DOCKER_UNAVAILABLE")
        self.assertEqual(result["services"]["items"], [])
        self.assertEqual(result["host"], {"cpuPercent": 1.0})

    def test_redacts_credentials_from_log_text(self):
        cleaned = agent.redact_text(
            "Authorization: Bearer abc123token\n"
            "HUB_SECRET_KEY=super-secret-value\n"
            "DATABASE_URL=postgres://hubuser:hunter2@db:5432/hub\n"
        )
        self.assertNotIn("abc123token", cleaned)
        self.assertNotIn("super-secret-value", cleaned)
        self.assertNotIn("hunter2", cleaned)
        self.assertIn("[REDACTED]", cleaned)
        self.assertIn("HUB_SECRET_KEY", cleaned)

    def test_logs_are_tailed_bounded_and_redacted(self):
        output = "\n".join([
            "boot message",
            "second message",
            "third with token=abc123",
        ])
        with patch.object(agent, "run_fixed", return_value=output) as run_fixed:
            result = agent.service_logs(CONFIG, {
                "protocolVersion": 2, "operation": "system.logs", "service": "web", "lines": 1,
            })
        self.assertEqual(result["state"], "ok")
        self.assertEqual(len(result["lines"]), 1)
        self.assertIn("[REDACTED]", result["lines"][0])
        self.assertNotIn("abc123", result["lines"][0])
        self.assertTrue(result["truncated"])
        self.assertEqual(result["discardedLines"], 2)
        argv = run_fixed.call_args.args[0]
        self.assertIn("logs", argv)
        self.assertEqual(argv[-2:], ["1", "web"])

    def test_rejects_unsupported_log_targets(self):
        for request in (
            {"protocolVersion": 2, "operation": "system.logs", "service": "code-server", "lines": 10},
            {"protocolVersion": 2, "operation": "system.logs", "service": "web", "lines": 0},
            {"protocolVersion": 2, "operation": "system.logs", "service": "web", "lines": agent.MAX_LOG_LINES + 1},
            {"protocolVersion": 2, "operation": "system.logs", "service": "web", "lines": 10, "command": "id"},
        ):
            with self.assertRaises(agent.AgentError):
                agent.service_logs(CONFIG, request)

    def test_validation_reports_invalid_configuration_without_secrets(self):
        failure = agent.subprocess.CompletedProcess(
            args=[], returncode=1,
            stdout="",
            stderr="invalid: /opt/pfsense-hub/.env: HUB_SERVICE_ROLE_KEY=leaked-value",
        )
        with patch.object(agent, "run_capture", return_value=failure):
            result = agent.compose_validation(CONFIG, {"protocolVersion": 2, "operation": "compose.validate"})
        self.assertEqual(result["state"], "invalid")
        self.assertNotIn("leaked-value", result["detail"])
        self.assertNotIn("/opt/pfsense-hub", result["detail"])
        self.assertIn("<project>", result["detail"])

    def test_validation_accepts_a_valid_compose_file(self):
        success = agent.subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        with patch.object(agent, "run_capture", return_value=success):
            result = agent.compose_validation(CONFIG, {"protocolVersion": 2, "operation": "compose.validate"})
        self.assertEqual(result, {"state": "valid"})

    def test_validation_surfaces_an_unavailable_docker_binary(self):
        with patch.object(agent, "run_capture", side_effect=agent.AgentError("HOST_OPERATION_UNAVAILABLE")):
            result = agent.compose_validation(CONFIG, {"protocolVersion": 2, "operation": "compose.validate"})
        self.assertEqual(result, {"state": "error", "errorCode": "HOST_OPERATION_UNAVAILABLE"})

    def test_docker_ps_goes_through_fixed_argv(self):
        with patch.object(agent, "run_fixed", return_value="") as run_fixed:
            items = agent.docker_services(CONFIG)
        argv = run_fixed.call_args.args[0]
        self.assertEqual(argv[0], "/usr/bin/docker")
        self.assertEqual(argv[1], "compose")
        self.assertIn("/opt/pfsense-hub/compose.yaml", argv)
        self.assertEqual(argv[-3:], ["ps", "--format", "json"])
        self.assertTrue(all(item["state"] == "missing" for item in items))


if __name__ == "__main__":
    unittest.main()


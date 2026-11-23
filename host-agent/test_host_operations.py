import importlib.util
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

MODULE_PATH = Path(__file__).with_name("pfsense_hub_agent.py")
SPEC = importlib.util.spec_from_file_location("pfsense_hub_agent_operations", MODULE_PATH)
agent = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(agent)

OPERATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
FIXED_PROJECT = "/opt/pfsense-hub"


def ps_lines(*states: tuple[str, str]) -> str:
    return "\n".join(
        json.dumps({"Service": service, "State": state, "Name": f"pfsense-hub-{service}-1"})
        for service, state in states
    )


class FakeThread:
    created: list["FakeThread"] = []

    def __init__(self, target=None, args=(), daemon=None):
        self.target = target
        self.args = args
        self.daemon = daemon
        self.started = False
        FakeThread.created.append(self)

    def start(self):
        self.started = True


class HostOperationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        base = self.directory.name
        self.config = {
            "docker_binary": "/usr/bin/docker",
            "project_dir": FIXED_PROJECT,
            "compose_file": f"{FIXED_PROJECT}/compose.yaml",
            "env_file": f"{FIXED_PROJECT}/.env",
            "lock_path": os.path.join(base, "deployment.lock"),
            "operation_state_path": os.path.join(base, "host-operations.json"),
        }
        FakeThread.created = []

    def tearDown(self):
        self.directory.cleanup()

    def seed(self, operation_id=OPERATION_ID, **fields):
        entry = {
            "operationId": operation_id,
            "action": "restart",
            "target": "web",
            "state": "queued",
            "result": None,
            "errorCode": None,
            "verified": False,
            "requestedAt": "2026-11-22T08:00:00Z",
            "startedAt": None,
            "finishedAt": None,
        }
        entry.update(fields)
        agent.write_operation_journal(self.config, {operation_id: entry})
        return entry

    def request(self, **overrides):
        payload = {
            "protocolVersion": 2,
            "operation": "system.operation",
            "operationId": OPERATION_ID,
            "action": "restart",
            "target": "web",
        }
        payload.update(overrides)
        return payload

    def test_only_operation_handlers_were_added(self):
        self.assertEqual(set(agent.HANDLERS), {
            "deployment.apply", "system.status", "system.logs",
            "compose.validate", "system.operation", "system.operationResult",
        })
        self.assertNotIn("system.operation", agent.LOCKED_OPERATIONS)

    def test_rejects_unsupported_actions_targets_and_shapes(self):
        cases = (
            ({"action": "kill"}, "OPERATION_ACTION_UNSUPPORTED"),
            ({"target": "code-server"}, "OPERATION_TARGET_UNSUPPORTED"),
            ({"operationId": "not-a-uuid"}, "REQUEST_INVALID"),
            ({"command": "id"}, "REQUEST_INVALID"),
        )
        for overrides, code in cases:
            with self.assertRaises(agent.AgentError) as exc:
                agent.request_operation(self.config, self.request(**overrides))
            self.assertEqual(exc.exception.code, code)
        self.assertEqual(agent.read_operation_journal(self.config), {})


    def test_accepts_once_and_journals_before_dispatch(self):
        with patch.object(agent, "threading", SimpleNamespace(Thread=FakeThread)):
            accepted = agent.request_operation(self.config, self.request())
        self.assertEqual(accepted, {"state": "accepted", "operationId": OPERATION_ID})
        entry = agent.read_operation_journal(self.config)[OPERATION_ID]
        self.assertEqual(entry["state"], "queued")
        self.assertEqual((entry["action"], entry["target"]), ("restart", "web"))
        self.assertIsNone(entry["finishedAt"])
        self.assertEqual(len(FakeThread.created), 1)
        self.assertTrue(FakeThread.created[0].started)
        self.assertEqual(FakeThread.created[0].args, (self.config, OPERATION_ID, "restart", "web"))

    def test_replay_is_idempotent_and_a_conflicting_replay_is_refused(self):
        with patch.object(agent, "threading", SimpleNamespace(Thread=FakeThread)):
            agent.request_operation(self.config, self.request())
            replay = agent.request_operation(self.config, self.request(operationId=OPERATION_ID.upper()))
        self.assertEqual(replay, {"state": "accepted", "operationId": OPERATION_ID})
        self.assertEqual(len(FakeThread.created), 1)
        with self.assertRaises(agent.AgentError) as exc:
            agent.request_operation(self.config, self.request(action="stop"))
        self.assertEqual(exc.exception.code, "OPERATION_CONFLICT")

    def test_operation_argv_is_a_fixed_allowlist(self):
        prefix = ["/usr/bin/docker", "compose", "--project-directory", FIXED_PROJECT,
                  "-f", f"{FIXED_PROJECT}/compose.yaml"]
        for action, target, expected in (
            ("start", "stack", ["up", "-d"]),
            ("stop", "stack", ["stop"]),
            ("restart", "stack", ["restart"]),
            ("start", "api", ["up", "-d", "api"]),
            ("stop", "db", ["stop", "db"]),
            ("restart", "web", ["restart", "web"]),
        ):
            self.assertEqual(agent.operation_argv(self.config, action, target), prefix + expected)
        for action, target in (("start", "code-server"), ("kill", "web"), ("start", "--force")):
            with self.assertRaises(agent.AgentError):
                agent.operation_argv(self.config, action, target)

    def test_execute_operation_reports_a_failed_command(self):
        success = agent.subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
        with patch.object(agent, "run_capture", return_value=success) as run_capture:
            agent.execute_operation(self.config, "stop", "stack")
        self.assertEqual(run_capture.call_args.args[0][-1], "stop")
        self.assertEqual(run_capture.call_args.kwargs["timeout"], agent.OPERATION_EXEC_TIMEOUT)
        failure = agent.subprocess.CompletedProcess(args=[], returncode=1, stdout="", stderr="boom")
        with patch.object(agent, "run_capture", return_value=failure):
            with self.assertRaises(agent.AgentError) as exc:
                agent.execute_operation(self.config, "stop", "stack")
        self.assertEqual(exc.exception.code, "HOST_OPERATION_FAILED")

    def test_verification_requires_the_requested_end_state(self):
        running = ps_lines(("web", "running"), ("api", "running"), ("db", "running"))
        stopped = ps_lines(("web", "exited"), ("api", "exited"), ("db", "exited"))
        partial = ps_lines(("web", "running"), ("api", "exited"))
        with patch.object(agent, "run_fixed", return_value=running):
            self.assertTrue(agent.operation_state_is_satisfied(self.config, "start", "stack"))
            self.assertTrue(agent.operation_state_is_satisfied(self.config, "restart", "web"))
            self.assertFalse(agent.operation_state_is_satisfied(self.config, "stop", "web"))
        with patch.object(agent, "run_fixed", return_value=stopped):
            self.assertTrue(agent.operation_state_is_satisfied(self.config, "stop", "stack"))
            self.assertFalse(agent.operation_state_is_satisfied(self.config, "start", "api"))
        with patch.object(agent, "run_fixed", return_value=partial):
            self.assertFalse(agent.operation_state_is_satisfied(self.config, "start", "stack"))
        # A stopped stack may have no containers left at all.
        with patch.object(agent, "run_fixed", return_value=""):
            self.assertTrue(agent.operation_state_is_satisfied(self.config, "stop", "stack"))
            self.assertFalse(agent.operation_state_is_satisfied(self.config, "restart", "db"))

    def test_wait_for_state_retries_then_gives_up(self):
        with patch.object(agent, "operation_state_is_satisfied", side_effect=[False, False, True]), \
                patch.object(agent, "time") as fake_time:
            self.assertTrue(agent.wait_for_operation_state(self.config, "start", "web"))
        self.assertEqual(fake_time.sleep.call_count, 2)
        with patch.object(agent, "operation_state_is_satisfied", side_effect=agent.AgentError("DOCKER_UNAVAILABLE")), \
                patch.object(agent, "time") as fake_time:
            self.assertFalse(agent.wait_for_operation_state(self.config, "start", "web"))
        self.assertEqual(fake_time.sleep.call_count, agent.OPERATION_VERIFY_ATTEMPTS - 1)

    def test_run_operation_records_a_verified_success(self):
        self.seed()
        with patch.object(agent, "execute_operation") as execute, \
                patch.object(agent, "wait_for_operation_state", return_value=True):
            agent.run_operation(self.config, OPERATION_ID, "restart", "web")
        execute.assert_called_once_with(self.config, "restart", "web")
        result = agent.operation_result(self.config, {
            "protocolVersion": 2, "operation": "system.operationResult", "operationId": OPERATION_ID,
        })
        self.assertEqual(result["state"], "completed")
        self.assertEqual(result["result"], "succeeded")
        self.assertIsNone(result["errorCode"])
        self.assertTrue(result["verified"])
        self.assertRegex(result["finishedAt"], agent.OPERATION_TIMESTAMP)

    def test_run_operation_records_an_unverified_or_failed_outcome(self):
        self.seed()
        with patch.object(agent, "execute_operation", side_effect=agent.AgentError("HOST_OPERATION_FAILED")):
            agent.run_operation(self.config, OPERATION_ID, "restart", "web")
        entry = agent.read_operation_journal(self.config)[OPERATION_ID]
        self.assertEqual((entry["state"], entry["result"]), ("completed", "failed"))
        self.assertEqual(entry["errorCode"], "HOST_OPERATION_FAILED")
        self.assertFalse(entry["verified"])

        self.seed()
        with patch.object(agent, "execute_operation"), \
                patch.object(agent, "wait_for_operation_state", return_value=False):
            agent.run_operation(self.config, OPERATION_ID, "restart", "web")
        entry = agent.read_operation_journal(self.config)[OPERATION_ID]
        self.assertEqual(entry["errorCode"], "OPERATION_UNVERIFIED")
        self.assertFalse(entry["verified"])

    def test_result_is_pending_until_the_outcome_is_journaled(self):
        self.seed(state="running", startedAt="2026-11-22T08:00:01Z")
        pending = agent.operation_result(self.config, {
            "protocolVersion": 2, "operation": "system.operationResult", "operationId": OPERATION_ID,
        })
        self.assertEqual(pending, {"state": "pending"})
        with self.assertRaises(agent.AgentError) as exc:
            agent.operation_result(self.config, {
                "protocolVersion": 2, "operation": "system.operationResult",
                "operationId": "33333333-3333-4333-8333-333333333333",
            })
        self.assertEqual(exc.exception.code, "OPERATION_NOT_FOUND")
        with self.assertRaises(agent.AgentError) as shape:
            agent.operation_result(self.config, {
                "protocolVersion": 2, "operation": "system.operationResult",
                "operationId": OPERATION_ID, "service": "web",
            })
        self.assertEqual(shape.exception.code, "REQUEST_INVALID")

    def test_result_refuses_a_corrupt_journal_entry(self):
        for fields in (
            {"state": "completed", "result": "maybe", "finishedAt": "2026-11-22T08:00:02Z"},
            {"state": "completed", "result": "failed", "errorCode": "bad code", "finishedAt": "2026-11-22T08:00:02Z"},
            {"state": "completed", "result": "failed", "errorCode": "HOST_OPERATION_FAILED", "finishedAt": "later"},
        ):
            self.seed(**fields)
            with self.assertRaises(agent.AgentError) as exc:
                agent.operation_result(self.config, {
                    "protocolVersion": 2, "operation": "system.operationResult", "operationId": OPERATION_ID,
                })
            self.assertEqual(exc.exception.code, "OPERATION_JOURNAL_INVALID")

    def test_journal_is_private_and_rejects_a_symlink(self):
        self.seed()
        path = Path(self.config["operation_state_path"])
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(list(path.parent.glob(".host-operations-*")), [])
        target = path.with_name("elsewhere.json")
        target.write_text('{"version":1,"operations":{}}', encoding="utf-8")
        path.unlink()
        os.symlink(target, path)
        with self.assertRaises(agent.AgentError) as exc:
            agent.read_operation_journal(self.config)
        self.assertEqual(exc.exception.code, "OPERATION_JOURNAL_UNAVAILABLE")

    def test_journal_prunes_settled_entries_but_keeps_unsettled_ones(self):
        entries = {f"settled-{index}": {
            "state": "completed", "finishedAt": f"2026-11-22T08:00:{index:02d}Z",
        } for index in range(agent.OPERATION_STATE_MAX + 5)}
        entries["unsettled"] = {"state": "running"}
        pruned = agent.prune_operation_journal(entries)
        self.assertIn("unsettled", pruned)
        settled = [key for key in pruned if key.startswith("settled-")]
        self.assertEqual(len(settled), agent.OPERATION_STATE_MAX)
        self.assertIn(f"settled-{agent.OPERATION_STATE_MAX + 4}", pruned)
        self.assertNotIn("settled-0", pruned)

    def test_dispatch_maps_refusals_to_the_error_envelope(self):
        refused = agent.dispatch_result(self.config, self.request(action="kill"))
        self.assertEqual(refused, {"state": "error", "errorCode": "OPERATION_ACTION_UNSUPPORTED"})
        invalid = agent.dispatch_result(self.config, self.request(operationId="nope"))
        self.assertEqual(invalid, {"state": "error", "errorCode": "REQUEST_INVALID"})
        stale = agent.dispatch_result(self.config, self.request(protocolVersion=1))
        self.assertEqual(stale, {"state": "error", "errorCode": "PROTOCOL_VERSION_UNSUPPORTED"})
        missing = agent.dispatch_result(self.config, {
            "protocolVersion": 2, "operation": "system.operationResult", "operationId": OPERATION_ID,
        })
        self.assertEqual(missing, {"state": "error", "errorCode": "OPERATION_NOT_FOUND"})


if __name__ == "__main__":
    unittest.main()



import type pg from "pg";
import { createHostDeploymentRequest } from "./deployment-agent-protocol.js";
import { requestHostDeployment } from "./deployment-agent-client.js";

export type DeploymentDispatchOptions = {
  socketPath: string | null;
  timeoutMs?: number;
};

type DeploymentRow = {
  id: string;
  desired_revision: number;
};

function safeErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_]{1,64}$/.test(message) ? message : "HOST_AGENT_FAILURE";
}

/**
 * Dispatch one queued deployment while holding the desired-revision row lock.
 * A concurrent settings save must wait until the host has either verified the
 * endpoint or completed rollback. This prevents a newer revision from being
 * committed between the host's final revision check and API acknowledgement.
 */
export async function dispatchHubDeployment(
  pool: pg.Pool,
  deployment: DeploymentRow,
  options: DeploymentDispatchOptions
): Promise<void> {
  const claimed = await pool.query(
    `UPDATE hub_access_deployments
        SET state='validating',started_at=COALESCE(started_at,now()),updated_at=now()
      WHERE id=$1 AND desired_revision=$2 AND state='queued'
      RETURNING id`,
    [deployment.id, deployment.desired_revision]
  );
  if (!claimed.rowCount) return;

  if (!options.socketPath) {
    await pool.query(
      `UPDATE hub_access_deployments
          SET state='failed',safe_error_code='HOST_AGENT_NOT_CONFIGURED',
              finished_at=now(),updated_at=now()
        WHERE id=$1 AND state='validating'`,
      [deployment.id]
    );
    return;
  }

  await pool.query(
    "UPDATE hub_access_deployments SET state='applying',updated_at=now() WHERE id=$1 AND state='validating'",
    [deployment.id]
  );

  const db = await pool.connect();
  let transactionOpen = false;
  try {
    await db.query("BEGIN");
    transactionOpen = true;
    const current = await db.query<{ desired_revision: number }>(
      "SELECT desired_revision FROM hub_access_deployment_state WHERE id=1 FOR UPDATE"
    );
    if (Number(current.rows[0]?.desired_revision) !== deployment.desired_revision) {
      await db.query(
        `UPDATE hub_access_deployments SET state='failed',safe_error_code='STALE_DEPLOYMENT',
            finished_at=now(),updated_at=now() WHERE id=$1`,
        [deployment.id]
      );
      await db.query("COMMIT");
      transactionOpen = false;
      return;
    }

    const result = await requestHostDeployment(
      options.socketPath,
      createHostDeploymentRequest(deployment.id, deployment.desired_revision),
      options.timeoutMs
    );

    if (result.state === "succeeded") {
      await db.query(
        `UPDATE hub_access_deployments SET state='succeeded',applied_origin=$2,
            rollback_succeeded=NULL,finished_at=now(),updated_at=now() WHERE id=$1`,
        [deployment.id, result.appliedOrigin]
      );
      await db.query(
        `UPDATE hub_access_deployment_state SET applied_revision=$1,applied_at=now(),
            applied_by=(SELECT actor_id FROM hub_access_deployments WHERE id=$2),updated_at=now()
          WHERE id=1 AND desired_revision=$1`,
        [deployment.desired_revision, deployment.id]
      );
    } else {
      await db.query(
        `UPDATE hub_access_deployments SET state=$2,safe_error_code=$3,
            rollback_succeeded=$4,finished_at=now(),updated_at=now() WHERE id=$1`,
        [deployment.id, result.state, result.errorCode, result.rollbackSucceeded]
      );
    }
    await db.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try { await db.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
      transactionOpen = false;
    }
    await pool.query(
      `UPDATE hub_access_deployments SET state='failed',safe_error_code=$2,
          finished_at=now(),updated_at=now() WHERE id=$1 AND state NOT IN ('succeeded','rolled_back')`,
      [deployment.id, safeErrorCode(error)]
    );
  } finally {
    db.release();
  }
}

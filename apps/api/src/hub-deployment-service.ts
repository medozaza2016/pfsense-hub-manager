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
 * Process one queued deployment. The API can only request a deployment by ID
 * and revision. All host paths and operations remain inside the host agent.
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

  try {
    await pool.query(
      "UPDATE hub_access_deployments SET state='applying',updated_at=now() WHERE id=$1 AND state='validating'",
      [deployment.id]
    );
    const result = await requestHostDeployment(
      options.socketPath,
      createHostDeploymentRequest(deployment.id, deployment.desired_revision),
      options.timeoutMs
    );

    if (result.state === "succeeded") {
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const current = await db.query(
          "SELECT desired_revision FROM hub_access_deployment_state WHERE id=1 FOR UPDATE"
        );
        if (Number(current.rows[0]?.desired_revision) !== deployment.desired_revision) {
          await db.query(
            `UPDATE hub_access_deployments SET state='failed',safe_error_code='STALE_DEPLOYMENT',
                finished_at=now(),updated_at=now() WHERE id=$1`,
            [deployment.id]
          );
        } else {
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
        }
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
      return;
    }

    await pool.query(
      `UPDATE hub_access_deployments SET state=$2,safe_error_code=$3,
          rollback_succeeded=$4,finished_at=now(),updated_at=now() WHERE id=$1`,
      [deployment.id, result.state, result.errorCode, result.rollbackSucceeded]
    );
  } catch (error) {
    await pool.query(
      `UPDATE hub_access_deployments SET state='failed',safe_error_code=$2,
          finished_at=now(),updated_at=now() WHERE id=$1 AND state NOT IN ('succeeded','rolled_back')`,
      [deployment.id, safeErrorCode(error)]
    );
  }
}

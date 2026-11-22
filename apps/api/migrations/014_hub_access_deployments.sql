CREATE TABLE IF NOT EXISTS hub_access_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  desired_revision integer NOT NULL UNIQUE CHECK (desired_revision >= 1),
  requested_method text NOT NULL CHECK (requested_method IN ('local', 'tailscale', 'hostname')),
  state text NOT NULL CHECK (state IN ('queued', 'validating', 'applying', 'verifying', 'succeeded', 'rolling_back', 'rolled_back', 'failed')),
  safe_error_code text,
  applied_origin text,
  rollback_succeeded boolean,
  actor_id uuid REFERENCES admin_users(id),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hub_access_deployments_created_at_idx
  ON hub_access_deployments(created_at DESC);

CREATE INDEX IF NOT EXISTS hub_access_deployments_state_idx
  ON hub_access_deployments(state, created_at DESC);

-- The deployment history is intentionally separate from desired/applied state.
-- A queued record is not evidence that host configuration changed or that an
-- endpoint is reachable. Only the host agent may advance a deployment to success.

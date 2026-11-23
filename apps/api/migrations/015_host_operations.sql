CREATE TABLE IF NOT EXISTS host_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_username text,
  action text NOT NULL CHECK (action IN ('start', 'stop', 'restart')),
  target text NOT NULL CHECK (target IN ('web', 'api', 'db', 'stack')),
  state text NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested', 'running', 'succeeded', 'failed', 'unknown')),
  safe_error_code text,
  request_id text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One host operation may run at a time. The partial unique index is the
-- authority: an application-level check alone could race between two admins.
CREATE UNIQUE INDEX IF NOT EXISTS host_operations_single_active
  ON host_operations ((true)) WHERE state IN ('requested', 'running');

CREATE INDEX IF NOT EXISTS host_operations_recent
  ON host_operations (requested_at DESC);

-- Only the operation journal is persisted. Host metrics, service log lines, and
-- container identifiers are never stored, so there is no time-series history,
-- no log content, and nothing to retain or purge beyond this table.
-- A row is evidence that an operation was requested and how it ended; it is not
-- evidence that the firewall fleet changed, which this feature never touches.

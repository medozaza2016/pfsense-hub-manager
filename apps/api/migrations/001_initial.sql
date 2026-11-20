CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS managed_devices (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  location text,
  edition text NOT NULL CHECK (edition IN ('plus', 'ce', 'unknown')),
  api_base_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_runs (
  id uuid PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES managed_devices(id) ON DELETE CASCADE,
  operation_group text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'partial', 'failure')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  error_class text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poll_runs_device_time_idx
  ON poll_runs (device_id, completed_at DESC);

INSERT INTO schema_migrations(version) VALUES ('001_initial')
ON CONFLICT (version) DO NOTHING;

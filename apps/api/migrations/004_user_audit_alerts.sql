ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_username text,
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user','system','anonymous')),
  action text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','failure','denied')),
  target_type text,
  target_id text,
  summary text NOT NULL,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx ON audit_events (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx ON audit_events (action, occurred_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deduplication_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  title text NOT NULL,
  message text NOT NULL,
  source text NOT NULL,
  resource_type text,
  resource_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','acknowledged','resolved')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open_dedup_idx
  ON alerts (deduplication_key) WHERE status IN ('active','acknowledged');
CREATE INDEX IF NOT EXISTS alerts_status_last_seen_idx ON alerts (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS alerts_severity_status_idx ON alerts (severity, status, last_seen_at DESC);

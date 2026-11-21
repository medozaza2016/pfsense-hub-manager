CREATE TABLE IF NOT EXISTS development_seed_runs (
  seed_key text PRIMARY KEY,
  seeded_at timestamptz NOT NULL DEFAULT now(),
  users_inserted integer NOT NULL DEFAULT 0 CHECK (users_inserted >= 0),
  alerts_inserted integer NOT NULL DEFAULT 0 CHECK (alerts_inserted >= 0),
  audit_events_inserted integer NOT NULL DEFAULT 0 CHECK (audit_events_inserted >= 0)
);

-- Runtime-editable background polling cadence (DEC-044).
--
-- One singleton row overrides the environment defaults. A fresh installation has
-- no row, so `PFSENSE_POLLING_*` values stay in effect and are reported with
-- source 'environment'. Bounds mirror `PollScheduler`'s constructor assertions;
-- the scheduler still validates at construction, so this is defence in depth
-- rather than the only guard.
CREATE TABLE IF NOT EXISTS hub_polling_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  interval_ms integer NOT NULL CHECK (interval_ms BETWEEN 15000 AND 3600000),
  concurrency smallint NOT NULL CHECK (concurrency BETWEEN 1 AND 8),
  jitter_ms integer NOT NULL CHECK (jitter_ms BETWEEN 0 AND 60000),
  retention_days smallint NOT NULL CHECK (retention_days BETWEEN 1 AND 365),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT hub_polling_settings_singleton CHECK (id = 1),
  CONSTRAINT hub_polling_settings_jitter_below_interval CHECK (jitter_ms < interval_ms)
);

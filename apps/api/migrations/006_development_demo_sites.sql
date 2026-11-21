ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

ALTER TABLE development_seed_runs
  ADD COLUMN IF NOT EXISTS sites_inserted integer NOT NULL DEFAULT 0 CHECK (sites_inserted >= 0);

INSERT INTO schema_migrations(version) VALUES('006_development_demo_sites')
ON CONFLICT(version) DO NOTHING;

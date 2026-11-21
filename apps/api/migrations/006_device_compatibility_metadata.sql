ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS release text,
  ADD COLUMN IF NOT EXISTS architecture text,
  ADD COLUMN IF NOT EXISTS rest_api_package_version text,
  ADD COLUMN IF NOT EXISTS compatibility_verified_at timestamptz;

INSERT INTO schema_migrations(version) VALUES('006_device_compatibility_metadata')
ON CONFLICT(version) DO NOTHING;

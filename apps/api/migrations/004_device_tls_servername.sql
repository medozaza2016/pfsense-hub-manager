ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS tls_servername text;

INSERT INTO schema_migrations(version) VALUES('004_device_tls_servername')
ON CONFLICT(version) DO NOTHING;

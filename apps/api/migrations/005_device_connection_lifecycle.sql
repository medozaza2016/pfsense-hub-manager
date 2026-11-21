ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'unknown'
    CHECK (connection_status IN ('unknown','online','degraded','offline','authentication_failed','authorization_failed','tls_error','unsupported','error')),
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_class text;

INSERT INTO schema_migrations(version) VALUES('005_device_connection_lifecycle')
ON CONFLICT(version) DO NOTHING;

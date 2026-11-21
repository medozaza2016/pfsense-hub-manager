CREATE TABLE IF NOT EXISTS device_capabilities(
  device_id uuid NOT NULL REFERENCES managed_devices(id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  endpoint text NOT NULL,
  http_method text NOT NULL DEFAULT 'GET' CHECK(http_method='GET'),
  verification_status text NOT NULL DEFAULT 'unknown'
    CHECK(verification_status IN('unknown','verified','unsupported')),
  last_checked_at timestamptz,
  last_error_class text,
  PRIMARY KEY(device_id,operation_key)
);
CREATE INDEX IF NOT EXISTS device_capabilities_status_idx
  ON device_capabilities(device_id,verification_status);

INSERT INTO schema_migrations(version) VALUES('007_device_capability_evidence')
ON CONFLICT(version) DO NOTHING;

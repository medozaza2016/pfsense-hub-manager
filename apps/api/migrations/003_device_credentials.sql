ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS api_key_ciphertext text,
  ADD COLUMN IF NOT EXISTS api_key_iv text,
  ADD COLUMN IF NOT EXISTS api_key_tag text,
  ADD COLUMN IF NOT EXISTS ca_certificate_pem text;

INSERT INTO schema_migrations(version) VALUES('003_device_credentials')
ON CONFLICT(version) DO NOTHING;

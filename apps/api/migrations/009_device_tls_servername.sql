ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS tls_servername text;

ALTER TABLE managed_devices
  DROP CONSTRAINT IF EXISTS managed_devices_tls_servername_length_check;

ALTER TABLE managed_devices
  ADD CONSTRAINT managed_devices_tls_servername_length_check
  CHECK (tls_servername IS NULL OR length(tls_servername) BETWEEN 1 AND 253);

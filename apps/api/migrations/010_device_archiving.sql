ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS managed_devices_active_name_idx
  ON managed_devices (name,id)
  WHERE archived_at IS NULL;

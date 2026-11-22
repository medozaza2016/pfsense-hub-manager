-- Remove synthetic firewall sites from the active inventory without deleting their records.
-- Archival preserves related records and prevents sample endpoints from being polled.
UPDATE managed_devices
SET enabled = false,
    archived_at = COALESCE(archived_at, now()),
    updated_at = now()
WHERE is_demo = true
  AND archived_at IS NULL;

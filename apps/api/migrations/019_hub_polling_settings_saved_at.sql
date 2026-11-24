-- Mark a save independently of who made it (DEC-044).
--
-- Until now `source: "install"` was derived from `updated_by IS NULL`, which made
-- "has anyone saved this?" a side effect of attribution. A save that wrote the
-- install values still reported "hub" (correct, a save did happen), but losing the
-- attribution — retiring the administrator who saved — would have flipped a saved
-- row back to "install" while its values stayed non-default. `saved_at` records the
-- save itself; `updated_by` stays attribution and may become NULL.
--
-- NULL means "still the install values": the `018` seed, a row re-seeded because it
-- was missing, and any repair that restores the defaults. A save always writes a
-- timestamp. The backfill gives rows that already carry attribution their
-- `updated_at`, so a save made before this migration keeps reporting "hub".
--
-- 017's header still describes the superseded "environment default with a stored
-- override" design. It is left untouched because applied migrations keep a
-- checksum the API verifies at boot; this file is the current description.
ALTER TABLE hub_polling_settings ADD COLUMN IF NOT EXISTS saved_at timestamptz;

COMMENT ON COLUMN hub_polling_settings.saved_at IS
  'When an administrator last saved these values; NULL while they are still the install defaults.';

UPDATE hub_polling_settings SET saved_at = updated_at WHERE saved_at IS NULL AND updated_by IS NOT NULL;

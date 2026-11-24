-- Seed the background-polling settings row (DEC-044).
--
-- The row is the only source of the four cadence values: the four
-- `PFSENSE_POLLING_*` cadence variables were removed from `config.ts`, from
-- `.env.example`, from the `.env` that `scripts/install-linux.sh` generates, and
-- from the running deployment's `.env`. Administration > Hub Settings edits this
-- row at runtime.
--
-- Install values: a 60 s cadence, two devices collected at once, up to 15 s of
-- jitter, and 30 days of poll history. `updated_by` stays NULL, which is how the
-- API reports `source: "install"` until an administrator saves.
--
-- 017 created the table and is already applied on existing installations, so the
-- seed is a new migration rather than an edit to it: applied migrations must keep
-- their checksums. `ON CONFLICT DO NOTHING` leaves a saved cadence intact.
INSERT INTO hub_polling_settings (id, interval_ms, concurrency, jitter_ms, retention_days)
VALUES (1, 60000, 2, 15000, 30)
ON CONFLICT (id) DO NOTHING;
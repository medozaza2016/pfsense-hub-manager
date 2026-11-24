-- Stored collection limits (DEC-046).
--
-- `PFSENSE_API_TIMEOUT_MS`, `PFSENSE_OBSERVATION_CACHE_MS`, and
-- `PFSENSE_OBSERVATION_ERROR_CACHE_MS` were the last bounded integers an operator
-- had to edit in `.env` and restart the API to change. They move into this
-- singleton row, seeded with the values those variables defaulted to, and are
-- edited in Administration > Hub Settings.
--
-- The CHECKs mirror `collectionSettingsSchema` in `hub-settings.ts`. The route
-- validates first, so a rejected value never reaches this table; the constraints
-- are defence in depth for a manual `UPDATE`.
--
-- `saved_at` follows migration 019: it records that an administrator saved the
-- row independently of `updated_by`, so retiring the saving account cannot make a
-- saved row read as "install". NULL means the install seed is still in effect.
CREATE TABLE IF NOT EXISTS hub_collection_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  request_timeout_ms integer NOT NULL CHECK (request_timeout_ms BETWEEN 1000 AND 60000),
  success_cache_ttl_ms integer NOT NULL CHECK (success_cache_ttl_ms BETWEEN 1000 AND 60000),
  failure_cache_ttl_ms integer NOT NULL CHECK (failure_cache_ttl_ms BETWEEN 0 AND 60000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  saved_at timestamptz,
  CONSTRAINT hub_collection_settings_singleton CHECK (id = 1),
  CONSTRAINT hub_collection_settings_failure_not_above_success CHECK (failure_cache_ttl_ms <= success_cache_ttl_ms)
);

COMMENT ON COLUMN hub_collection_settings.saved_at IS
  'When an administrator last saved these values; NULL while they are still the install defaults.';

INSERT INTO hub_collection_settings (id, request_timeout_ms, success_cache_ttl_ms, failure_cache_ttl_ms)
VALUES (1, 10000, 10000, 2000)
ON CONFLICT (id) DO NOTHING;

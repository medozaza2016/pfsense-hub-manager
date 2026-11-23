-- Persist only the compatibility metadata the eight approved read-only endpoints
-- can actually report. `api_package_version` stays nullable because no approved
-- endpoint exposes it; do not backfill a guessed value.
ALTER TABLE managed_devices
  ADD COLUMN IF NOT EXISTS release text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS api_package_version text,
  ADD COLUMN IF NOT EXISTS compatibility text NOT NULL DEFAULT 'unknown'
    CHECK (compatibility IN ('unknown', 'verified', 'mismatch')),
  ADD COLUMN IF NOT EXISTS compatibility_checked_at timestamptz;

-- Compatibility is observational evidence, not configuration: a mismatch means
-- the declared edition contradicts the release/platform string reported by the
-- firewall, which an administrator can correct in the site profile.

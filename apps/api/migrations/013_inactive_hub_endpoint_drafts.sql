-- Allow inactive endpoint tabs to retain an address type before an address is entered.
-- The active endpoint still requires a complete address when a non-default type is selected.
ALTER TABLE hub_access_endpoints
  DROP CONSTRAINT IF EXISTS hub_access_endpoints_check1;

ALTER TABLE hub_access_endpoints
  ADD CONSTRAINT hub_access_endpoints_address_pairing_check
  CHECK (
    (address_type IS NULL AND address IS NULL)
    OR (address_type IS NOT NULL AND (address IS NOT NULL OR enabled = false))
  );

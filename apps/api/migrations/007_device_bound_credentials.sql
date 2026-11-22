ALTER TABLE device_credentials
  DROP CONSTRAINT device_credentials_format_version_check;

ALTER TABLE device_credentials
  ADD CONSTRAINT device_credentials_format_version_check
  CHECK (format_version IN (1, 2));

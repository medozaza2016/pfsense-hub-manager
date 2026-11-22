CREATE TABLE device_tls_trust (
  device_id uuid PRIMARY KEY REFERENCES managed_devices(id) ON DELETE CASCADE,
  algorithm text NOT NULL CHECK (algorithm = 'aes-256-gcm'),
  format_version smallint NOT NULL CHECK (format_version = 3),
  key_version integer NOT NULL CHECK (key_version > 0),
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

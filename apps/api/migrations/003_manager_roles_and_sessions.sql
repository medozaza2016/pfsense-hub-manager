-- Establish the manager account/session schema and role authorization.
-- Existing accounts are retained and become administrators by default.
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(64) NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  password_iterations integer NOT NULL CHECK (password_iterations >= 310000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_lower_uidx
  ON admin_users (lower(username));

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';

UPDATE admin_users SET role = 'admin' WHERE role IS NULL;
ALTER TABLE admin_users ALTER COLUMN role SET DEFAULT 'admin';
ALTER TABLE admin_users ALTER COLUMN role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_users_role_check'
      AND conrelid = 'admin_users'::regclass
  ) THEN
    ALTER TABLE admin_users
      ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'user'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash char(64) PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON admin_sessions (expires_at);

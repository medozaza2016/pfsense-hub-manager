CREATE TABLE IF NOT EXISTS manager_users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS manager_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES manager_users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS manager_sessions_user_idx ON manager_sessions(user_id);
CREATE INDEX IF NOT EXISTS manager_sessions_expiry_idx ON manager_sessions(expires_at);
INSERT INTO schema_migrations(version) VALUES('002_manager_users') ON CONFLICT(version) DO NOTHING;

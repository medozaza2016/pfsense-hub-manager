CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  password_iterations integer NOT NULL CHECK (password_iterations >= 310000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_lower_idx ON admin_users (lower(username));

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash text PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS hub_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reachability_method text NOT NULL DEFAULT 'local' CHECK (reachability_method IN ('local', 'tailscale', 'hostname')),
  address_type text CHECK (address_type IN ('magic_dns', 'tailscale_ip', 'hostname', 'ip')),
  address text,
  https_port integer NOT NULL DEFAULT 443 CHECK (https_port BETWEEN 1 AND 65535),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id)
);
INSERT INTO hub_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

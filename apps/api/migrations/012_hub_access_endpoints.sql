CREATE TABLE IF NOT EXISTS hub_access_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text NOT NULL UNIQUE CHECK (method IN ('local', 'tailscale', 'hostname')),
  address_type text CHECK (address_type IN ('magic_dns', 'tailscale_ip', 'hostname', 'ip')),
  address text,
  https_port integer NOT NULL DEFAULT 443 CHECK (https_port BETWEEN 1 AND 65535),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id),
  CHECK (
    (method = 'local' AND (address_type IS NULL OR address_type IN ('hostname', 'ip')))
    OR (method = 'tailscale' AND (address_type IS NULL OR address_type IN ('magic_dns', 'tailscale_ip')))
    OR (method = 'hostname' AND (address_type IS NULL OR address_type IN ('hostname', 'ip')))
  ),
  CHECK ((address_type IS NULL AND address IS NULL) OR (address_type IS NOT NULL AND address IS NOT NULL)),
  CHECK (enabled = false OR method = 'local' OR (address_type IS NOT NULL AND address IS NOT NULL))
);

-- Preserve the existing single-method preference as one endpoint.
INSERT INTO hub_access_endpoints(method, address_type, address, https_port, enabled, updated_at, updated_by)
SELECT reachability_method, address_type, address, https_port, true, updated_at, updated_by
FROM hub_settings
WHERE id = 1
ON CONFLICT (method) DO NOTHING;

CREATE TABLE IF NOT EXISTS hub_access_deployment_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  desired_revision integer NOT NULL DEFAULT 1 CHECK (desired_revision >= 1),
  applied_revision integer NOT NULL DEFAULT 0 CHECK (applied_revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES admin_users(id),
  applied_at timestamptz,
  applied_by uuid REFERENCES admin_users(id),
  CHECK (applied_revision <= desired_revision)
);
INSERT INTO hub_access_deployment_state(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

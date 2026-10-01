-- Core identity tables and row-level security.
-- Policies are written in SQL because the schema tool does not emit them.
-- The application role cannot bypass row-level security.

CREATE SCHEMA IF NOT EXISTS core;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA core TO app;

CREATE OR REPLACE FUNCTION core.current_clinic_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.clinic_id', true), '')::uuid
$$;

CREATE TABLE core.regulatory_profiles (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  record_retention_days integer NOT NULL,
  audit_retention_days integer NOT NULL,
  voice_consent_required boolean NOT NULL DEFAULT true,
  external_processing_allowed boolean NOT NULL DEFAULT false,
  external_ai_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE core.clinics (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  regulatory_profile_id uuid NOT NULL REFERENCES core.regulatory_profiles (id),
  default_locale text NOT NULL DEFAULT 'en',
  currency char(3) NOT NULL,
  timezone text NOT NULL,
  tooth_notation text NOT NULL DEFAULT 'FDI',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE core.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  mfa_secret text,
  status text NOT NULL DEFAULT 'active',
  locale text NOT NULL DEFAULT 'en',
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'locked', 'deactivated'))
);

CREATE TABLE core.permissions (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  description text
);

CREATE TABLE core.roles (
  id uuid PRIMARY KEY,
  clinic_id uuid REFERENCES core.clinics (id),
  key text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roles_clinic_key_unique ON core.roles (clinic_id, key);
CREATE UNIQUE INDEX roles_system_key_unique ON core.roles (key) WHERE clinic_id IS NULL;

CREATE TABLE core.role_permissions (
  role_id uuid NOT NULL REFERENCES core.roles (id),
  permission_id uuid NOT NULL REFERENCES core.permissions (id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE core.memberships (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES core.users (id),
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  role_id uuid NOT NULL REFERENCES core.roles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (user_id, clinic_id)
);

CREATE TABLE core.auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES core.users (id),
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  device text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memberships_clinic_idx ON core.memberships (clinic_id);
CREATE INDEX auth_sessions_user_idx ON core.auth_sessions (user_id);

-- Users, permissions, regulatory profiles and auth sessions are global.
-- Everything that belongs to a clinic is isolated, including when the caller sets no clinic.
ALTER TABLE core.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.clinics FORCE ROW LEVEL SECURITY;
CREATE POLICY clinics_isolation ON core.clinics
  USING (id = core.current_clinic_id())
  WITH CHECK (id = core.current_clinic_id());

ALTER TABLE core.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_isolation ON core.memberships
  USING (clinic_id = core.current_clinic_id())
  WITH CHECK (clinic_id = core.current_clinic_id());

ALTER TABLE core.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_isolation ON core.roles
  USING (clinic_id IS NULL OR clinic_id = core.current_clinic_id())
  WITH CHECK (clinic_id = core.current_clinic_id());

ALTER TABLE core.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_permissions FORCE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_isolation ON core.role_permissions
  USING (
    EXISTS (
      SELECT 1
      FROM core.roles AS role
      WHERE role.id = role_id
        AND (role.clinic_id IS NULL OR role.clinic_id = core.current_clinic_id())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.roles AS role
      WHERE role.id = role_id
        AND role.clinic_id = core.current_clinic_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO app;

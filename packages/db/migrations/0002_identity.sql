-- Identity (F5): permissions, system roles, and the sign-in functions.
--
-- The application role cannot read core.users or cross-clinic memberships. Sign-in runs
-- before a clinic is chosen, so it goes through SECURITY DEFINER functions owned by a
-- NOLOGIN role that bypasses row-level security. Each function returns only what sign-in needs.
-- Creating that role requires the migration to run as a superuser.

-- Seed rows use random UUIDs; there is no v7 generator in PostgreSQL 16.
INSERT INTO core.permissions (id, key, description)
SELECT gen_random_uuid(), key, description
FROM (VALUES
  ('patient.read', 'Search and view patients'),
  ('patient.write', 'Create and edit patients'),
  ('history.write', 'Add and end medical and dental history entries'),
  ('session.read', 'View clinical sessions'),
  ('session.write', 'Start sessions and record findings and notes'),
  ('session.sign', 'Sign a session, making it immutable'),
  ('session.amend', 'Amend a signed session'),
  ('diagnosis.write', 'Record and confirm diagnoses'),
  ('plan.write', 'Edit treatment plans'),
  ('procedure.write', 'Start, complete and cancel procedures'),
  ('usage.write', 'Record material usage'),
  ('cost.read', 'View costs'),
  ('catalog.manage', 'Manage materials, units, suppliers and templates'),
  ('price.read', 'View price history'),
  ('price.manage', 'Set prices'),
  ('voice.use', 'Use voice commands'),
  ('evidence.ask', 'Ask the Evidence Assistant'),
  ('audit.read', 'Read the audit and access history'),
  ('admin.manage', 'Manage users, roles and clinic settings'),
  ('research.export', 'Create de-identified research exports'),
  ('lab.manage', 'Manage the Research Lab'),
  ('lab.review', 'Review answers in the blinded review queue')
) AS seed (key, description)
ON CONFLICT (key) DO NOTHING;

-- System roles have no clinic and are visible to every clinic.
INSERT INTO core.roles (id, clinic_id, key, description)
SELECT gen_random_uuid(), NULL, key, description
FROM (VALUES
  ('dentist', 'All clinical steps; confirms diagnoses and signs sessions'),
  ('assistant', 'Records findings and material usage in an open session'),
  ('receptionist', 'Patient search and demographics'),
  ('manager', 'Prices, materials, cost reports and audit history'),
  ('admin', 'Users, roles and settings'),
  ('researcher', 'Research Lab and de-identified exports only'),
  ('reviewer', 'Blinded review queue only')
) AS seed (key, description)
WHERE NOT EXISTS (
  SELECT 1 FROM core.roles AS existing WHERE existing.clinic_id IS NULL AND existing.key = seed.key
);

-- Must match ROLE_PERMISSIONS in packages/contracts/src/roles.ts.
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM (VALUES
  ('dentist', 'patient.read'), ('dentist', 'patient.write'), ('dentist', 'history.write'),
  ('dentist', 'session.read'), ('dentist', 'session.write'), ('dentist', 'session.sign'),
  ('dentist', 'session.amend'), ('dentist', 'diagnosis.write'), ('dentist', 'plan.write'),
  ('dentist', 'procedure.write'), ('dentist', 'usage.write'), ('dentist', 'cost.read'),
  ('dentist', 'price.read'), ('dentist', 'voice.use'), ('dentist', 'evidence.ask'),
  ('assistant', 'patient.read'), ('assistant', 'session.read'), ('assistant', 'session.write'),
  ('assistant', 'usage.write'), ('assistant', 'voice.use'),
  ('receptionist', 'patient.read'), ('receptionist', 'patient.write'),
  ('manager', 'catalog.manage'), ('manager', 'price.read'), ('manager', 'price.manage'),
  ('manager', 'cost.read'), ('manager', 'audit.read'),
  ('admin', 'admin.manage'), ('admin', 'audit.read'),
  ('researcher', 'research.export'), ('researcher', 'lab.manage'),
  ('reviewer', 'lab.review')
) AS seed (role_key, permission_key)
JOIN core.roles AS role ON role.key = seed.role_key AND role.clinic_id IS NULL
JOIN core.permissions AS permission ON permission.key = seed.permission_key
ON CONFLICT DO NOTHING;

-- The clinic a refresh-token family signs in to, so a refresh keeps the same clinic.
ALTER TABLE core.auth_sessions ADD COLUMN clinic_id uuid REFERENCES core.clinics (id);
CREATE INDEX auth_sessions_family_idx ON core.auth_sessions (family_id);

-- The application role reaches users only through the functions below. Sessions hold
-- token hashes only; rows are revoked, never deleted, so the history of a family survives.
REVOKE ALL ON core.users FROM app;
REVOKE DELETE ON core.auth_sessions FROM app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dental_auth') THEN
    CREATE ROLE dental_auth NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA core TO dental_auth;
GRANT SELECT ON core.users, core.memberships, core.roles, core.role_permissions,
  core.permissions, core.clinics TO dental_auth;
GRANT UPDATE (failed_login_count, locked_until, updated_at) ON core.users TO dental_auth;

CREATE FUNCTION core.auth_find_user(p_email text)
RETURNS TABLE (
  id uuid,
  email text,
  password_hash text,
  status text,
  locale text,
  failed_login_count integer,
  locked_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  SELECT u.id, u.email, u.password_hash, u.status, u.locale, u.failed_login_count, u.locked_until
  FROM core.users AS u
  WHERE lower(u.email) = lower(p_email)
$$;

-- Counts a failed sign-in. From p_threshold failures on, the account locks for p_base_seconds,
-- doubling with each further failure, up to one day. Returns the lock expiry, if any.
CREATE FUNCTION core.auth_record_failure(p_user uuid, p_threshold integer, p_base_seconds integer)
RETURNS timestamptz
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  UPDATE core.users AS u
  SET failed_login_count = u.failed_login_count + 1,
      locked_until = CASE
        WHEN u.failed_login_count + 1 >= p_threshold THEN now() + least(
          make_interval(secs => p_base_seconds * power(2, u.failed_login_count + 1 - p_threshold)),
          interval '1 day'
        )
        ELSE u.locked_until
      END,
      updated_at = now()
  WHERE u.id = p_user
  RETURNING u.locked_until
$$;

CREATE FUNCTION core.auth_record_success(p_user uuid)
RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  UPDATE core.users
  SET failed_login_count = 0, locked_until = NULL, updated_at = now()
  WHERE id = p_user
$$;

CREATE FUNCTION core.auth_user(p_user uuid)
RETURNS TABLE (id uuid, email text, status text, locale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  SELECT u.id, u.email, u.status, u.locale FROM core.users AS u WHERE u.id = p_user
$$;

CREATE FUNCTION core.auth_memberships(p_user uuid)
RETURNS TABLE (clinic_id uuid, clinic_name text, role_key text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  SELECT c.id, c.name, r.key
  FROM core.memberships AS m
  JOIN core.clinics AS c ON c.id = m.clinic_id
  JOIN core.roles AS r ON r.id = m.role_id
  WHERE m.user_id = p_user
  ORDER BY c.name
$$;

CREATE FUNCTION core.auth_permissions(p_user uuid, p_clinic uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  SELECT p.key
  FROM core.memberships AS m
  JOIN core.role_permissions AS rp ON rp.role_id = m.role_id
  JOIN core.permissions AS p ON p.id = rp.permission_id
  WHERE m.user_id = p_user AND m.clinic_id = p_clinic
  ORDER BY p.key
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'core.auth_find_user(text)',
    'core.auth_record_failure(uuid, integer, integer)',
    'core.auth_record_success(uuid)',
    'core.auth_user(uuid)',
    'core.auth_memberships(uuid)',
    'core.auth_permissions(uuid, uuid)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO dental_auth', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app', fn);
  END LOOP;
END
$$;

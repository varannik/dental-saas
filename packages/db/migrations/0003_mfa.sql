-- Second factor (F5): TOTP for dentist, manager and admin roles (spec section L).
--
-- Secrets are stored encrypted by the API (AES-256-GCM); the database never sees them in clear.
-- mfa_secret holds the confirmed secret. mfa_pending_secret holds one offered at enrolment
-- until the first valid code confirms it. mfa_last_step records the last accepted time step,
-- so a code cannot be used twice.

ALTER TABLE core.users
  ADD COLUMN mfa_pending_secret text,
  ADD COLUMN mfa_enrolled_at timestamptz,
  ADD COLUMN mfa_last_step bigint;

GRANT UPDATE (mfa_secret, mfa_pending_secret, mfa_enrolled_at, mfa_last_step) ON core.users
  TO dental_auth;

CREATE FUNCTION core.auth_mfa_state(p_user uuid)
RETURNS TABLE (
  secret text,
  pending_secret text,
  enrolled_at timestamptz,
  last_step bigint,
  locked_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  SELECT u.mfa_secret, u.mfa_pending_secret, u.mfa_enrolled_at, u.mfa_last_step, u.locked_until
  FROM core.users AS u
  WHERE u.id = p_user
$$;

-- Offers a new secret. Ignored once the user is enrolled, so enrolment cannot be redone this way.
CREATE FUNCTION core.auth_mfa_offer(p_user uuid, p_secret text)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  UPDATE core.users
  SET mfa_pending_secret = p_secret, updated_at = now()
  WHERE id = p_user AND mfa_enrolled_at IS NULL
  RETURNING true
$$;

-- Confirms the offered secret with the step of the first valid code.
CREATE FUNCTION core.auth_mfa_confirm(p_user uuid, p_step bigint)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  UPDATE core.users
  SET mfa_secret = mfa_pending_secret,
      mfa_pending_secret = NULL,
      mfa_enrolled_at = now(),
      mfa_last_step = p_step,
      updated_at = now()
  WHERE id = p_user AND mfa_enrolled_at IS NULL AND mfa_pending_secret IS NOT NULL
  RETURNING true
$$;

-- Accepts a time step only if it is later than the last one used: each code works once.
CREATE FUNCTION core.auth_mfa_use_step(p_user uuid, p_step bigint)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = core, pg_temp
AS $$
  UPDATE core.users
  SET mfa_last_step = p_step, updated_at = now()
  WHERE id = p_user
    AND mfa_enrolled_at IS NOT NULL
    AND (mfa_last_step IS NULL OR mfa_last_step < p_step)
  RETURNING true
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'core.auth_mfa_state(uuid)',
    'core.auth_mfa_offer(uuid, text)',
    'core.auth_mfa_confirm(uuid, bigint)',
    'core.auth_mfa_use_step(uuid, bigint)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO dental_auth', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app', fn);
  END LOOP;
END
$$;

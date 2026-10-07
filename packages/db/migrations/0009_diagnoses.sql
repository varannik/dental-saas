-- Diagnoses (C4, spec section F). Assistants suggest; only dentists confirm (spec section I).
--
-- A diagnosis moves suggested -> confirmed or rejected, or confirmed -> retracted when it was
-- entered in error. What was diagnosed never changes; a trigger allows only these transitions.

INSERT INTO core.permissions (id, key, description)
VALUES (gen_random_uuid(), 'diagnosis.suggest', 'Suggest a diagnosis for a dentist to confirm')
ON CONFLICT (key) DO NOTHING;

-- Must match ROLE_PERMISSIONS in packages/contracts/src/roles.ts.
INSERT INTO core.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM (VALUES ('dentist', 'diagnosis.suggest'), ('assistant', 'diagnosis.suggest')) AS seed (role_key, permission_key)
JOIN core.roles AS role ON role.key = seed.role_key AND role.clinic_id IS NULL
JOIN core.permissions AS permission ON permission.key = seed.permission_key
ON CONFLICT DO NOTHING;

CREATE TABLE clinical.diagnoses (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  -- Null for a diagnosis of the whole mouth.
  tooth text,
  code text NOT NULL,
  label text,
  certainty text,
  status text NOT NULL,
  suggested_by uuid REFERENCES core.users (id),
  suggested_at timestamptz NOT NULL DEFAULT now(),
  -- Who confirmed, rejected or retracted it, when, and why.
  decided_by uuid REFERENCES core.users (id),
  decided_at timestamptz,
  reason text,
  CONSTRAINT diagnoses_tooth_check CHECK (tooth IS NULL OR tooth ~ '^[1-8][1-8]$'),
  CONSTRAINT diagnoses_status_check CHECK (status IN ('suggested', 'confirmed', 'rejected', 'retracted')),
  CONSTRAINT diagnoses_certainty_check CHECK (certainty IS NULL OR certainty IN ('possible', 'probable', 'definite')),
  CONSTRAINT diagnoses_decided_check CHECK ((status = 'suggested') = (decided_at IS NULL)),
  CONSTRAINT diagnoses_retract_reason_check CHECK (status <> 'retracted' OR reason IS NOT NULL)
);

CREATE INDEX diagnoses_session_idx ON clinical.diagnoses (clinic_id, session_id);
CREATE INDEX diagnoses_patient_idx ON clinical.diagnoses (clinic_id, patient_id, status);

CREATE FUNCTION clinical.diagnosis_transitions_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'diagnoses are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.clinic_id, NEW.session_id, NEW.patient_id, NEW.tooth, NEW.code, NEW.label,
      NEW.certainty, NEW.suggested_by, NEW.suggested_at)
       IS DISTINCT FROM
     (OLD.id, OLD.clinic_id, OLD.session_id, OLD.patient_id, OLD.tooth, OLD.code, OLD.label,
      OLD.certainty, OLD.suggested_by, OLD.suggested_at)
     OR NOT (
       (OLD.status = 'suggested' AND NEW.status IN ('confirmed', 'rejected'))
       OR (OLD.status = 'confirmed' AND NEW.status = 'retracted')
     )
  THEN
    RAISE EXCEPTION 'a diagnosis only moves from suggested to confirmed or rejected, or from confirmed to retracted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER diagnoses_transitions_only BEFORE UPDATE OR DELETE ON clinical.diagnoses
  FOR EACH ROW EXECUTE FUNCTION clinical.diagnosis_transitions_only();

ALTER TABLE clinical.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.diagnoses FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON clinical.diagnoses
  USING (clinic_id = core.current_clinic_id())
  WITH CHECK (clinic_id = core.current_clinic_id());

GRANT SELECT, INSERT, UPDATE ON clinical.diagnoses TO app;

-- Medical and dental history (C2, spec section F): conditions, medications, allergies and risk
-- factors. One table for the four kinds, which share one lifecycle (ADR 0002).
--
-- Entries are ended, not overwritten. Content never changes after insert; the only update
-- allowed is ending an active entry, as resolved, stopped or entered in error, with who, when
-- and why. A trigger enforces this for every role.

CREATE TABLE clinical.history_entries (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  kind text NOT NULL,
  label text NOT NULL,
  -- A coded term (for example SNOMED CT) once a terminology is chosen.
  code text,
  -- Dose and frequency for a medication, reaction for an allergy, or any detail.
  detail text,
  -- Allergies only.
  severity text,
  onset_date date,
  status text NOT NULL DEFAULT 'active',
  noted_at timestamptz NOT NULL DEFAULT now(),
  noted_by uuid REFERENCES core.users (id),
  ended_at timestamptz,
  ended_by uuid REFERENCES core.users (id),
  end_reason text,
  end_note text,
  CONSTRAINT history_kind_check CHECK (kind IN ('condition', 'medication', 'allergy', 'risk_factor')),
  CONSTRAINT history_status_check CHECK (status IN ('active', 'ended')),
  CONSTRAINT history_severity_check CHECK (
    severity IS NULL OR (kind = 'allergy' AND severity IN ('mild', 'moderate', 'severe', 'unknown'))
  ),
  CONSTRAINT history_end_reason_check CHECK (
    end_reason IS NULL OR end_reason IN ('resolved', 'stopped', 'entered_in_error')
  ),
  CONSTRAINT history_ended_check CHECK (
    (status = 'active' AND ended_at IS NULL AND end_reason IS NULL)
    OR (status = 'ended' AND ended_at IS NOT NULL AND end_reason IS NOT NULL)
  )
);

CREATE INDEX history_patient_idx ON clinical.history_entries (clinic_id, patient_id, kind, status);

CREATE FUNCTION clinical.history_end_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'history entries are ended, not deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'active' OR NEW.status <> 'ended'
     OR (NEW.id, NEW.clinic_id, NEW.patient_id, NEW.kind, NEW.label, NEW.code, NEW.detail,
         NEW.severity, NEW.onset_date, NEW.noted_at, NEW.noted_by)
        IS DISTINCT FROM
        (OLD.id, OLD.clinic_id, OLD.patient_id, OLD.kind, OLD.label, OLD.code, OLD.detail,
         OLD.severity, OLD.onset_date, OLD.noted_at, OLD.noted_by)
  THEN
    RAISE EXCEPTION 'history entries are ended, not overwritten' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER history_end_only BEFORE UPDATE OR DELETE ON clinical.history_entries
  FOR EACH ROW EXECUTE FUNCTION clinical.history_end_only();

ALTER TABLE clinical.history_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.history_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON clinical.history_entries
  USING (clinic_id = core.current_clinic_id())
  WITH CHECK (clinic_id = core.current_clinic_id());

GRANT SELECT, INSERT, UPDATE ON clinical.history_entries TO app;

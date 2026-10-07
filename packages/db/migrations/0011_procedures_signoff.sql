-- Procedures, sign-off and amendments (C6, spec sections F and G).
--
-- A signed session is immutable. Every table that records something in a session refuses
-- inserts and updates once the session is signed, for every role including the owner, unless
-- the row belongs to an amendment of that same session. Amendments are created only by the
-- session.amend command, which needs a reason and the session.amend permission.

ALTER TABLE clinical.clinical_sessions
  ADD COLUMN signed_at timestamptz,
  ADD COLUMN signed_by uuid REFERENCES core.users (id),
  ADD CONSTRAINT sessions_signed_check CHECK ((status = 'signed') = (signed_at IS NOT NULL));

CREATE TABLE clinical.session_amendments (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  reason text NOT NULL,
  command_id uuid,
  amended_at timestamptz NOT NULL DEFAULT now(),
  amended_by uuid REFERENCES core.users (id)
);

CREATE INDEX amendments_session_idx ON clinical.session_amendments (clinic_id, session_id);

CREATE TABLE clinical.procedures (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  plan_item_id uuid REFERENCES clinical.treatment_plan_items (id),
  procedure_type_id uuid NOT NULL REFERENCES catalog.procedure_types (id),
  tooth text,
  surfaces text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'in_progress',
  note text,
  started_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid REFERENCES core.users (id),
  ended_at timestamptz,
  ended_by uuid REFERENCES core.users (id),
  cancel_reason text,
  CONSTRAINT procedures_tooth_check CHECK (tooth IS NULL OR tooth ~ '^[1-8][1-8]$'),
  CONSTRAINT procedures_status_check CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  CONSTRAINT procedures_ended_check CHECK ((status = 'in_progress') = (ended_at IS NULL))
);

CREATE INDEX procedures_session_idx ON clinical.procedures (clinic_id, session_id);
-- A plan item is being performed at most once at a time.
CREATE UNIQUE INDEX procedures_one_open_per_item
  ON clinical.procedures (plan_item_id) WHERE status = 'in_progress' AND plan_item_id IS NOT NULL;

CREATE FUNCTION clinical.procedure_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'procedures are cancelled, not deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.clinic_id, NEW.session_id, NEW.patient_id, NEW.plan_item_id,
      NEW.procedure_type_id, NEW.tooth, NEW.surfaces, NEW.started_at, NEW.started_by)
       IS DISTINCT FROM
     (OLD.id, OLD.clinic_id, OLD.session_id, OLD.patient_id, OLD.plan_item_id,
      OLD.procedure_type_id, OLD.tooth, OLD.surfaces, OLD.started_at, OLD.started_by)
     OR NOT (OLD.status = 'in_progress' AND NEW.status IN ('completed', 'cancelled'))
  THEN
    RAISE EXCEPTION 'a procedure only moves from in progress to completed or cancelled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER procedures_guard BEFORE UPDATE OR DELETE ON clinical.procedures
  FOR EACH ROW EXECUTE FUNCTION clinical.procedure_guard();

-- Rows recorded in an amendment say so.
ALTER TABLE clinical.findings ADD COLUMN amendment_id uuid REFERENCES clinical.session_amendments (id);
ALTER TABLE clinical.clinical_notes ADD COLUMN amendment_id uuid REFERENCES clinical.session_amendments (id);
ALTER TABLE clinical.diagnoses ADD COLUMN amendment_id uuid REFERENCES clinical.session_amendments (id);

-- The signed lock. A row of a signed session is refused unless it carries an amendment of that
-- session; a chart event passes when its finding does.
CREATE FUNCTION clinical.reject_if_signed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_status text;
  amendment uuid;
BEGIN
  SELECT status INTO session_status FROM clinical.clinical_sessions WHERE id = NEW.session_id;
  IF session_status IS DISTINCT FROM 'signed' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'chart_events' THEN
    SELECT f.amendment_id INTO amendment FROM clinical.findings AS f WHERE f.id = NEW.finding_id;
  ELSE
    amendment := (to_jsonb(NEW) ->> 'amendment_id')::uuid;
  END IF;
  IF amendment IS NOT NULL AND EXISTS (
    SELECT 1 FROM clinical.session_amendments AS a
    WHERE a.id = amendment AND a.session_id = NEW.session_id
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'session % is signed; changes need an amendment', NEW.session_id
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'findings', 'chart_events', 'perio_measurements', 'clinical_notes', 'diagnoses', 'procedures'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON clinical.%I '
      'FOR EACH ROW EXECUTE FUNCTION clinical.reject_if_signed()',
      tbl || '_signed_lock', tbl
    );
  END LOOP;
END
$$;

CREATE TRIGGER amendments_insert_only BEFORE UPDATE OR DELETE ON clinical.session_amendments
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clinical.procedures', 'clinical.session_amendments'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY clinic_isolation ON %s USING (clinic_id = core.current_clinic_id()) '
      'WITH CHECK (clinic_id = core.current_clinic_id())',
      tbl
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON clinical.procedures TO app;
GRANT SELECT, INSERT ON clinical.session_amendments TO app;

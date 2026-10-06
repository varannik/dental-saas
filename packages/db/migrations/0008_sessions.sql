-- Clinical sessions and examination (C3, spec section F).
--
-- A session is one visit. Findings, chart events, periodontal readings and notes are
-- insert-only: a correction is a new row. The chart is event-sourced: chart_events is the
-- record, and chart_entries is a projection of it that can be rebuilt from the events alone.

CREATE TABLE clinical.clinical_sessions (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  provider_id uuid REFERENCES core.users (id),
  status text NOT NULL DEFAULT 'open',
  chief_complaint text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT sessions_status_check CHECK (status IN ('open', 'completed', 'signed')),
  CONSTRAINT sessions_ended_check CHECK ((status = 'open') = (ended_at IS NULL))
);

-- One open session per patient (spec section G: 409 if the patient has an open session).
CREATE UNIQUE INDEX sessions_one_open_per_patient
  ON clinical.clinical_sessions (patient_id) WHERE status = 'open';
CREATE INDEX sessions_patient_idx ON clinical.clinical_sessions (clinic_id, patient_id, started_at);

-- Sessions move forward only: open, completed, then signed (C6). Nothing else changes.
CREATE FUNCTION clinical.session_forward_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sessions are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.clinic_id, NEW.patient_id, NEW.provider_id, NEW.chief_complaint, NEW.started_at)
       IS DISTINCT FROM
     (OLD.id, OLD.clinic_id, OLD.patient_id, OLD.provider_id, OLD.chief_complaint, OLD.started_at)
     OR NOT (
       (OLD.status = 'open' AND NEW.status = 'completed')
       OR (OLD.status = 'completed' AND NEW.status = 'signed')
     )
  THEN
    RAISE EXCEPTION 'a session only moves from open to completed to signed'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER sessions_forward_only BEFORE UPDATE OR DELETE ON clinical.clinical_sessions
  FOR EACH ROW EXECUTE FUNCTION clinical.session_forward_only();

CREATE TABLE clinical.findings (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  tooth text NOT NULL,
  -- Null for a whole-tooth finding.
  surface text,
  code text NOT NULL,
  value text,
  note text,
  supersedes_id uuid REFERENCES clinical.findings (id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES core.users (id),
  CONSTRAINT findings_tooth_check CHECK (tooth ~ '^[1-8][1-8]$'),
  CONSTRAINT findings_surface_check CHECK (surface IS NULL OR surface IN ('M', 'O', 'I', 'D', 'B', 'L'))
);

CREATE INDEX findings_session_idx ON clinical.findings (clinic_id, session_id);

-- The chart's record: one event per place a finding touched. state is null when it cleared.
CREATE TABLE clinical.chart_events (
  id uuid PRIMARY KEY,
  -- The order events happened in. UUIDv7 ids made in the same millisecond do not sort reliably,
  -- and replaying the chart needs an exact order.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  tooth text NOT NULL,
  surface text,
  state text,
  finding_id uuid NOT NULL REFERENCES clinical.findings (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chart_events_patient_idx ON clinical.chart_events (clinic_id, patient_id, seq);

-- The current chart, derived from chart_events; surface '' stands for the whole tooth so the
-- key can be a primary key. Kept up to date in the same transaction as each event.
CREATE TABLE clinical.chart_entries (
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  tooth text NOT NULL,
  surface text NOT NULL DEFAULT '',
  state text NOT NULL,
  finding_id uuid NOT NULL REFERENCES clinical.findings (id),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (patient_id, tooth, surface)
);

CREATE TABLE clinical.perio_measurements (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  tooth text NOT NULL,
  site text NOT NULL,
  pocket_depth smallint NOT NULL,
  bleeding boolean NOT NULL DEFAULT false,
  recession smallint,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES core.users (id),
  CONSTRAINT perio_tooth_check CHECK (tooth ~ '^[1-8][1-8]$'),
  CONSTRAINT perio_site_check CHECK (site IN ('MB', 'B', 'DB', 'ML', 'L', 'DL')),
  CONSTRAINT perio_depth_check CHECK (pocket_depth BETWEEN 0 AND 20),
  CONSTRAINT perio_recession_check CHECK (recession IS NULL OR recession BETWEEN -5 AND 15)
);

CREATE INDEX perio_session_idx ON clinical.perio_measurements (clinic_id, session_id, tooth, site);

CREATE TABLE clinical.clinical_notes (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  session_id uuid NOT NULL REFERENCES clinical.clinical_sessions (id),
  type text NOT NULL,
  body text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES core.users (id),
  CONSTRAINT notes_type_check CHECK (type IN ('clinical', 'plan', 'consent', 'other'))
);

CREATE INDEX notes_session_idx ON clinical.clinical_notes (clinic_id, session_id);

-- Insert-only records, also for the owner.
CREATE TRIGGER findings_insert_only BEFORE UPDATE OR DELETE ON clinical.findings
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER chart_events_insert_only BEFORE UPDATE OR DELETE ON clinical.chart_events
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER perio_insert_only BEFORE UPDATE OR DELETE ON clinical.perio_measurements
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER notes_insert_only BEFORE UPDATE OR DELETE ON clinical.clinical_notes
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'clinical.clinical_sessions', 'clinical.findings', 'clinical.chart_events',
    'clinical.chart_entries', 'clinical.perio_measurements', 'clinical.clinical_notes'
  ] LOOP
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

GRANT SELECT, INSERT, UPDATE ON clinical.clinical_sessions TO app;
GRANT SELECT, INSERT ON clinical.findings, clinical.chart_events, clinical.perio_measurements,
  clinical.clinical_notes TO app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA clinical TO app;
-- The projection is rebuilt by deleting and re-deriving it.
GRANT SELECT, INSERT, UPDATE, DELETE ON clinical.chart_entries TO app;

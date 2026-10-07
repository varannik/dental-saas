-- Procedure catalog and treatment plans (C5, spec section F; ADR 0003).
--
-- The catalog ships with generic procedures under language-neutral codes, not CDT codes,
-- which are licensed. A clinic can map its own coding system through external_code, and add
-- its own procedures once the catalog module exists (M1). System entries have no clinic.

CREATE SCHEMA IF NOT EXISTS catalog;
GRANT USAGE ON SCHEMA catalog TO app;

CREATE TABLE catalog.procedure_types (
  id uuid PRIMARY KEY,
  clinic_id uuid REFERENCES core.clinics (id),
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  scope text NOT NULL,
  allows_missing_tooth boolean NOT NULL DEFAULT false,
  aliases text[] NOT NULL DEFAULT '{}',
  external_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procedure_types_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT procedure_types_category_check CHECK (category IN (
    'diagnostic', 'preventive', 'restorative', 'endodontic', 'periodontic', 'prosthodontic',
    'oral_surgery', 'implant', 'other'
  )),
  CONSTRAINT procedure_types_scope_check CHECK (scope IN ('tooth', 'surfaces', 'mouth'))
);

CREATE UNIQUE INDEX procedure_types_system_code ON catalog.procedure_types (code) WHERE clinic_id IS NULL;
CREATE UNIQUE INDEX procedure_types_clinic_code ON catalog.procedure_types (clinic_id, code) WHERE clinic_id IS NOT NULL;

INSERT INTO catalog.procedure_types (id, code, name, category, scope, allows_missing_tooth, aliases)
SELECT gen_random_uuid(), code, name, category, scope, missing, aliases
FROM (VALUES
  ('examination', 'Examination', 'diagnostic', 'mouth', false, ARRAY['exam', 'check-up', 'checkup']),
  ('radiograph_bitewing', 'Bitewing radiographs', 'diagnostic', 'mouth', false, ARRAY['bitewings', 'bitewing x-ray']),
  ('radiograph_periapical', 'Periapical radiograph', 'diagnostic', 'tooth', true, ARRAY['periapical', 'PA', 'x-ray']),
  ('scale_polish', 'Scale and polish', 'preventive', 'mouth', false, ARRAY['scale and polish', 'cleaning', 'scaling']),
  ('fluoride_application', 'Fluoride application', 'preventive', 'mouth', false, ARRAY['fluoride', 'fluoride varnish']),
  ('fissure_sealant', 'Fissure sealant', 'preventive', 'tooth', false, ARRAY['sealant', 'fissure seal']),
  ('composite_filling', 'Composite filling', 'restorative', 'surfaces', false, ARRAY['composite', 'white filling', 'filling']),
  ('amalgam_filling', 'Amalgam filling', 'restorative', 'surfaces', false, ARRAY['amalgam', 'silver filling', 'filling']),
  ('glass_ionomer_filling', 'Glass ionomer filling', 'restorative', 'surfaces', false, ARRAY['glass ionomer', 'GIC']),
  ('inlay_onlay', 'Inlay or onlay', 'restorative', 'surfaces', false, ARRAY['inlay', 'onlay']),
  ('veneer', 'Veneer', 'restorative', 'tooth', false, ARRAY['veneer']),
  ('pulpotomy', 'Pulpotomy', 'endodontic', 'tooth', false, ARRAY['pulpotomy']),
  ('root_canal_anterior', 'Root canal treatment, anterior', 'endodontic', 'tooth', false, ARRAY['root canal', 'RCT', 'endo']),
  ('root_canal_premolar', 'Root canal treatment, premolar', 'endodontic', 'tooth', false, ARRAY['root canal', 'RCT', 'endo']),
  ('root_canal_molar', 'Root canal treatment, molar', 'endodontic', 'tooth', false, ARRAY['root canal', 'RCT', 'endo']),
  ('scaling_root_planing', 'Scaling and root planing, per quadrant', 'periodontic', 'mouth', false, ARRAY['deep cleaning', 'root planing']),
  ('post_and_core', 'Post and core', 'prosthodontic', 'tooth', false, ARRAY['post', 'core build-up']),
  ('crown', 'Crown', 'prosthodontic', 'tooth', false, ARRAY['crown', 'cap']),
  ('bridge_pontic', 'Bridge pontic', 'prosthodontic', 'tooth', true, ARRAY['pontic', 'bridge']),
  ('denture_partial', 'Partial denture', 'prosthodontic', 'mouth', true, ARRAY['partial denture', 'partial']),
  ('denture_complete', 'Complete denture', 'prosthodontic', 'mouth', true, ARRAY['full denture', 'complete denture']),
  ('extraction_simple', 'Extraction', 'oral_surgery', 'tooth', false, ARRAY['extraction', 'extract', 'pull']),
  ('extraction_surgical', 'Surgical extraction', 'oral_surgery', 'tooth', false, ARRAY['surgical extraction']),
  ('implant_placement', 'Implant placement', 'implant', 'tooth', true, ARRAY['implant']),
  ('implant_crown', 'Implant crown', 'implant', 'tooth', true, ARRAY['implant crown']),
  ('whitening', 'Whitening', 'other', 'mouth', false, ARRAY['whitening', 'bleaching'])
) AS seed (code, name, category, scope, missing, aliases)
ON CONFLICT DO NOTHING;

ALTER TABLE catalog.procedure_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.procedure_types FORCE ROW LEVEL SECURITY;
-- System procedures are visible to every clinic; a clinic's own only to that clinic.
CREATE POLICY procedure_types_visibility ON catalog.procedure_types
  USING (clinic_id IS NULL OR clinic_id = core.current_clinic_id())
  WITH CHECK (clinic_id = core.current_clinic_id());

GRANT SELECT ON catalog.procedure_types TO app;

CREATE TABLE clinical.treatment_plans (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  patient_id uuid NOT NULL REFERENCES clinical.patients (id),
  title text,
  status text NOT NULL DEFAULT 'proposed',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES core.users (id),
  decided_at timestamptz,
  decided_by uuid REFERENCES core.users (id),
  reason text,
  CONSTRAINT plans_status_check CHECK (status IN ('proposed', 'accepted', 'completed', 'cancelled'))
);

-- One open plan per patient, so "add a crown afterward" always has one target.
CREATE UNIQUE INDEX plans_one_open_per_patient
  ON clinical.treatment_plans (patient_id) WHERE status IN ('proposed', 'accepted');

CREATE TABLE clinical.treatment_plan_items (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  plan_id uuid NOT NULL REFERENCES clinical.treatment_plans (id),
  procedure_type_id uuid NOT NULL REFERENCES catalog.procedure_types (id),
  tooth text,
  surfaces text[] NOT NULL DEFAULT '{}',
  sequence integer NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES core.users (id),
  cancel_reason text,
  CONSTRAINT plan_items_tooth_check CHECK (tooth IS NULL OR tooth ~ '^[1-8][1-8]$'),
  CONSTRAINT plan_items_surfaces_check CHECK (surfaces <@ ARRAY['M', 'O', 'I', 'D', 'B', 'L']),
  CONSTRAINT plan_items_sequence_check CHECK (sequence > 0),
  CONSTRAINT plan_items_status_check CHECK (status IN ('planned', 'done', 'cancelled')),
  -- Checked at commit, so a reorder can move items through each other's positions.
  CONSTRAINT plan_items_sequence_unique UNIQUE (plan_id, sequence) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX plan_items_plan_idx ON clinical.treatment_plan_items (clinic_id, plan_id, sequence);

-- What an item is never changes; only its position and its status (planned -> done or
-- cancelled) do. Nothing is deleted.
CREATE FUNCTION clinical.plan_item_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'plan items are cancelled, not deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.clinic_id, NEW.plan_id, NEW.procedure_type_id, NEW.tooth, NEW.surfaces,
      NEW.note, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
     (OLD.id, OLD.clinic_id, OLD.plan_id, OLD.procedure_type_id, OLD.tooth, OLD.surfaces,
      OLD.note, OLD.created_at, OLD.created_by)
     OR (NEW.status <> OLD.status AND NOT (OLD.status = 'planned' AND NEW.status IN ('done', 'cancelled')))
  THEN
    RAISE EXCEPTION 'a plan item only moves position or from planned to done or cancelled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER plan_items_guard BEFORE UPDATE OR DELETE ON clinical.treatment_plan_items
  FOR EACH ROW EXECUTE FUNCTION clinical.plan_item_guard();

CREATE FUNCTION clinical.plan_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'plans are cancelled, not deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.clinic_id, NEW.patient_id, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM (OLD.id, OLD.clinic_id, OLD.patient_id, OLD.created_at, OLD.created_by)
     OR (NEW.status <> OLD.status AND NOT (
       (OLD.status = 'proposed' AND NEW.status IN ('accepted', 'cancelled'))
       OR (OLD.status = 'accepted' AND NEW.status IN ('completed', 'cancelled'))
     ))
  THEN
    RAISE EXCEPTION 'a plan only moves proposed -> accepted -> completed, or to cancelled'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER plans_guard BEFORE UPDATE OR DELETE ON clinical.treatment_plans
  FOR EACH ROW EXECUTE FUNCTION clinical.plan_guard();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clinical.treatment_plans', 'clinical.treatment_plan_items'] LOOP
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

GRANT SELECT, INSERT, UPDATE ON clinical.treatment_plans, clinical.treatment_plan_items TO app;

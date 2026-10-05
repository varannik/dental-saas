-- Command log and audit trail (F6, spec sections E, F and L).
--
-- Every state change is a command. The command row and the audit rows of its changes commit
-- in the same transaction as the change, or not at all. All three tables are insert-only for
-- the application role, and isolated per clinic by row-level security.

CREATE SCHEMA IF NOT EXISTS voice;
CREATE SCHEMA IF NOT EXISTS audit;
GRANT USAGE ON SCHEMA voice, audit TO app;

CREATE TABLE voice.commands (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  type text NOT NULL,
  payload jsonb NOT NULL,
  -- SHA-256 of the canonical type and payload; a retry must match it to reuse the key.
  request_hash text NOT NULL,
  source text NOT NULL,
  actor_id uuid NOT NULL REFERENCES core.users (id),
  risk_tier text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  -- Set for voice commands once the voice layer exists (V4).
  interpretation_id uuid,
  result jsonb,
  -- For a refused command: status, code, title and extra members, replayed on retry.
  error jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commands_source_check CHECK (source IN ('gui', 'voice', 'system')),
  CONSTRAINT commands_risk_tier_check CHECK (risk_tier IN ('R0', 'R1', 'R2', 'R3')),
  CONSTRAINT commands_status_check CHECK (
    status IN ('proposed', 'confirmed', 'executed', 'rejected', 'expired', 'failed', 'undone')
  ),
  CONSTRAINT commands_idempotency_unique UNIQUE (clinic_id, idempotency_key)
);

CREATE INDEX commands_clinic_created_idx ON voice.commands (clinic_id, created_at);

-- One row per clinic holding the end of its audit chain. Appending locks this row, so
-- concurrent transactions extend the chain one at a time and it can never fork.
CREATE TABLE audit.chain_heads (
  clinic_id uuid PRIMARY KEY REFERENCES core.clinics (id),
  last_seq bigint NOT NULL,
  last_hash text NOT NULL
);

-- Each row's hash covers its content and the previous row's hash, so editing or removing a
-- row breaks every later link. The API computes hashes; audit:verify recomputes them.
CREATE TABLE audit.audit_log (
  id uuid NOT NULL,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  seq bigint NOT NULL,
  at timestamptz NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  command_id uuid,
  request_id text,
  ip text,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);

CREATE INDEX audit_log_clinic_seq_idx ON audit.audit_log (clinic_id, seq);
CREATE INDEX audit_log_entity_idx ON audit.audit_log (clinic_id, entity, entity_id);

-- Monthly partitions. This migration creates thirteen; the worker is to create each next
-- month ahead of time. Rows outside every partition land in the default partition, and a
-- month's partition cannot be created once the default holds rows for that month.
CREATE FUNCTION audit.create_month_partition(p_month date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  start_at date := date_trunc('month', p_month)::date;
  name text := format('audit_log_%s', to_char(start_at, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS audit.%I PARTITION OF audit.audit_log FOR VALUES FROM (%L) TO (%L)',
    name, start_at, (start_at + interval '1 month')::date
  );
END
$$;

CREATE TABLE audit.audit_log_default PARTITION OF audit.audit_log DEFAULT;

SELECT audit.create_month_partition((date_trunc('month', now()) + make_interval(months => n))::date)
FROM generate_series(0, 12) AS n;

-- Who viewed which patient, and other reads that must be traceable, such as reading the audit
-- trail itself. patient_id gains its foreign key when the patients table exists (C1).
CREATE TABLE audit.access_log (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  actor_id uuid NOT NULL REFERENCES core.users (id),
  patient_id uuid,
  purpose text NOT NULL,
  request_id text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX access_log_clinic_at_idx ON audit.access_log (clinic_id, at);
CREATE INDEX access_log_patient_idx ON audit.access_log (clinic_id, patient_id);

-- Insert-only, also for the owner: a change has to drop the trigger, which is itself visible.
CREATE FUNCTION audit.reject_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is insert-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER audit_log_insert_only BEFORE UPDATE OR DELETE ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER access_log_insert_only BEFORE UPDATE OR DELETE ON audit.access_log
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER commands_insert_only BEFORE UPDATE OR DELETE ON voice.commands
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'voice.commands', 'audit.chain_heads', 'audit.audit_log', 'audit.access_log'
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

GRANT SELECT, INSERT ON voice.commands, audit.audit_log, audit.access_log TO app;
GRANT SELECT, INSERT, UPDATE ON audit.chain_heads TO app;

-- Utterances and their interpretations (V4, spec section H).
--
-- Every spoken or typed utterance and what the model made of it are kept, so any proposal can
-- be traced to the words, the model, the prompt and the context behind it. Both tables are
-- insert-only, for the owner too. Transcripts are clinical content: they stay in the clinic's
-- rows under row-level security.

CREATE TABLE voice.utterances (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  user_id uuid NOT NULL REFERENCES core.users (id),
  source text NOT NULL,
  transcript text NOT NULL,
  -- From speech recognition; null for typed text.
  stt_confidence real,
  stream_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utterances_source_check CHECK (source IN ('speech', 'text')),
  CONSTRAINT utterances_transcript_check CHECK (length(transcript) BETWEEN 1 AND 2000)
);

CREATE INDEX utterances_user_idx ON voice.utterances (clinic_id, user_id, created_at);

CREATE TABLE voice.interpretations (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  utterance_id uuid NOT NULL REFERENCES voice.utterances (id),
  -- intent: a registered command; none: not a command; rejected: output outside the registry
  -- or its schema; failed: the provider did not answer.
  outcome text NOT NULL,
  command_type text,
  entities jsonb,
  confidence real,
  reason text,
  -- Entities the model returned that were not in what was said, and so were not kept.
  dropped jsonb,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version integer NOT NULL,
  -- SHA-256 of the exact system prompt and tool list sent.
  prompt_fingerprint text NOT NULL,
  context_version integer NOT NULL,
  context_snapshot jsonb NOT NULL,
  latency_ms integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interpretations_outcome_check CHECK (outcome IN ('intent', 'none', 'rejected', 'failed')),
  CONSTRAINT interpretations_intent_check CHECK ((outcome = 'intent') = (command_type IS NOT NULL)),
  CONSTRAINT interpretations_confidence_check CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);

CREATE INDEX interpretations_utterance_idx ON voice.interpretations (clinic_id, utterance_id);

CREATE TRIGGER utterances_insert_only BEFORE UPDATE OR DELETE ON voice.utterances
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();
CREATE TRIGGER interpretations_insert_only BEFORE UPDATE OR DELETE ON voice.interpretations
  FOR EACH ROW EXECUTE FUNCTION audit.reject_change();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['voice.utterances', 'voice.interpretations'] LOOP
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

GRANT SELECT, INSERT ON voice.utterances, voice.interpretations TO app;

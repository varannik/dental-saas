-- Patients (C1, spec section F).
--
-- Names are searched with trigram similarity on a normalised form, and with Double Metaphone
-- codes for Latin-script names, so a misspelt or misheard name still finds the patient.
-- Normalisation strips Latin accents and unifies Persian and Arabic letter variants. The
-- national ID is encrypted by the API; national_id_index is a keyed hash for exact matching.
-- Patients are archived, never deleted, and every profile read is recorded in the access log.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS clinical;
GRANT USAGE ON SCHEMA clinical TO app;

-- Lower case, no Latin accents or Arabic diacritics, one Persian form per letter, single spaces.
-- Marked immutable so generated columns can use it; the unaccent dictionary does not change.
CREATE FUNCTION clinical.normalize_name(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(public.unaccent(
        'public.unaccent'::regdictionary,
        -- Arabic yeh, kaf, teh marbuta, waw and alef forms and hamza seat become their Persian
        -- forms; ZWNJ (U+200C) and hyphens become spaces, so a double surname is two words.
        translate(
          coalesce(p_text, ''),
          U&'\064A\0643\0629\0624\0625\0623\0622\0626\200C-',
          U&'\06CC\06A9\0647\0648\0627\0627\0627\06CC  '
        )
      )),
      -- Arabic diacritics (U+064B to U+065F), superscript alef, tatweel and punctuation.
      '[\u064B-\u065F\u0670\u0640.,''"()_/\\]', '', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- Double Metaphone codes of the Latin-script words of a name.
CREATE FUNCTION clinical.phonetic_tokens(p_text text)
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT coalesce(array_agg(DISTINCT code) FILTER (WHERE code <> ''), '{}')
  FROM (
    SELECT public.dmetaphone(word) AS code
    FROM regexp_split_to_table(clinical.normalize_name(p_text), ' ') AS word
    WHERE word ~ '^[a-z]'
  ) AS codes
$$;

CREATE TABLE clinical.patients (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  -- The number staff say and write; sequential per clinic.
  file_number integer NOT NULL,
  given_name text NOT NULL,
  family_name text NOT NULL,
  birth_date date NOT NULL,
  sex text NOT NULL,
  phone text,
  phone_digits text,
  email text,
  national_id_encrypted text,
  national_id_index text,
  status text NOT NULL DEFAULT 'active',
  search_name text GENERATED ALWAYS AS (clinical.normalize_name(given_name || ' ' || family_name)) STORED,
  phonetic_tokens text[] GENERATED ALWAYS AS (clinical.phonetic_tokens(given_name || ' ' || family_name)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES core.users (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT patients_sex_check CHECK (sex IN ('female', 'male', 'other', 'unknown')),
  CONSTRAINT patients_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT patients_file_number_unique UNIQUE (clinic_id, file_number)
);

CREATE INDEX patients_search_name_trgm ON clinical.patients USING gin (search_name gin_trgm_ops);
CREATE INDEX patients_phonetic_idx ON clinical.patients USING gin (phonetic_tokens);
CREATE INDEX patients_phone_idx ON clinical.patients (clinic_id, phone_digits);
CREATE INDEX patients_national_id_idx ON clinical.patients (clinic_id, national_id_index);
CREATE INDEX patients_birth_date_idx ON clinical.patients (clinic_id, birth_date);

-- The last file number given out per clinic. Taking a number locks the row.
CREATE TABLE clinical.patient_numbers (
  clinic_id uuid PRIMARY KEY REFERENCES core.clinics (id),
  last_number integer NOT NULL
);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clinical.patients', 'clinical.patient_numbers'] LOOP
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

-- Archived, never deleted.
GRANT SELECT, INSERT, UPDATE ON clinical.patients, clinical.patient_numbers TO app;

ALTER TABLE audit.access_log
  ADD CONSTRAINT access_log_patient_fk FOREIGN KEY (patient_id) REFERENCES clinical.patients (id);

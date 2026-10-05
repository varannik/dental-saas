-- Clinic onboarding (F10).
--
-- A clinic chooses its country, regulatory profile, language, currency, time zone and tooth
-- notation (spec section L). The platform assumes none of them; the constraints below only
-- keep the values well-formed. Deciding a country's rules remains a legal task per clinic.

ALTER TABLE core.clinics
  ADD CONSTRAINT clinics_country_check CHECK (country ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT clinics_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT clinics_locale_check CHECK (default_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  ADD CONSTRAINT clinics_tooth_notation_check CHECK (tooth_notation IN ('FDI', 'Universal', 'Palmer'));

-- A conservative starting profile: ten-year retention, voice consent required, and no
-- processing or AI outside the country until the clinic's legal review allows it. With
-- external AI forbidden, the clinic's voice bar and Evidence Assistant stay off.
INSERT INTO core.regulatory_profiles
  (id, key, name, record_retention_days, audit_retention_days, voice_consent_required,
   external_processing_allowed, external_ai_allowed)
VALUES
  (gen_random_uuid(), 'standard', 'Standard (conservative until reviewed)', 3650, 3650, true, false, false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO core.permissions (id, key, description)
VALUES (gen_random_uuid(), 'platform.manage', 'Onboard clinics (operator CLI only; no clinic role)')
ON CONFLICT (key) DO NOTHING;

-- Platform commands, such as onboarding, are run by the operator CLI as the system actor.
ALTER TABLE voice.commands ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE voice.commands
  ADD CONSTRAINT commands_actor_check CHECK (actor_id IS NOT NULL OR source = 'system');

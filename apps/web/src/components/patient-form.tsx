'use client';

import { PATIENT_SEX } from '@dental/contracts';
import type { FormEvent, ReactNode } from 'react';
import messages from '../messages/en.json';
import type { PatientForm } from '../lib/patients';

/** The patient details form, shared by registration and editing. */

const t = messages.patients;

export const inputClass =
  'h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-lg outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 aria-[invalid=true]:border-red-600';
export const primaryButton =
  'h-12 rounded-lg bg-neutral-900 px-5 text-lg font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400';
export const secondaryButton =
  'h-12 rounded-lg border border-neutral-300 bg-white px-5 font-medium hover:bg-neutral-50 disabled:opacity-50';

export function PatientFormFields({
  form,
  onChange,
  errors,
  nationalIdMasked,
}: {
  form: PatientForm;
  onChange: (form: PatientForm) => void;
  errors: Record<string, string>;
  /** The stored, masked national ID when editing. */
  nationalIdMasked?: string | null;
}) {
  const field = (key: keyof PatientForm) => ({
    value: form[key],
    'aria-invalid': errors[key] ? true : undefined,
    onChange: (event: { target: { value: string } }) =>
      onChange({ ...form, [key]: event.target.value }),
  });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label={t.givenName} error={errors.givenName}>
        <input className={inputClass} autoComplete="off" required {...field('givenName')} />
      </Field>
      <Field label={t.familyName} error={errors.familyName}>
        <input className={inputClass} autoComplete="off" required {...field('familyName')} />
      </Field>
      <Field label={t.birthDate} error={errors.birthDate}>
        <input className={inputClass} type="date" required {...field('birthDate')} />
      </Field>
      <Field label={t.sex} error={errors.sex}>
        <select className={inputClass} required {...field('sex')}>
          <option value="" disabled>
            {t.choose}
          </option>
          {PATIENT_SEX.map((sex) => (
            <option key={sex} value={sex}>
              {t.sexOptions[sex]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.phone} optional error={errors.phone}>
        <input className={inputClass} type="tel" autoComplete="off" {...field('phone')} />
      </Field>
      <Field label={t.email} optional error={errors.email}>
        <input className={inputClass} type="email" autoComplete="off" {...field('email')} />
      </Field>
      <Field
        label={t.nationalId}
        optional
        error={errors.nationalId}
        hint={nationalIdMasked ? `${nationalIdMasked} · ${t.nationalIdReplace}` : t.nationalIdHint}
      >
        <input className={inputClass} autoComplete="off" {...field('nationalId')} />
      </Field>
    </div>
  );
}

function Field({
  label,
  optional,
  error,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-neutral-500">({t.optional})</span>}
      </span>
      {children}
      {error ? (
        <span className="text-sm text-red-700">{error}</span>
      ) : (
        hint && <span className="text-sm text-neutral-500">{hint}</span>
      )}
    </label>
  );
}

export function FormActions({
  busy,
  onCancel,
  saveLabel = t.save,
}: {
  busy: boolean;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? t.saving : saveLabel}
      </button>
      {onCancel && (
        <button type="button" className={secondaryButton} onClick={onCancel} disabled={busy}>
          {t.cancel}
        </button>
      )}
    </div>
  );
}

export type FormSubmit = (event: FormEvent) => void;

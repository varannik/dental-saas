'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import messages from '../../messages/en.json';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { afterError, afterLogin, START, type SignInStep } from '../../lib/sign-in-flow';

const t = messages.auth;

const inputClass =
  'h-12 w-full rounded-lg border border-neutral-300 px-3 text-lg outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10';
const buttonClass =
  'h-12 w-full rounded-lg bg-neutral-900 px-4 text-lg font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400';

export default function SignInPage() {
  const router = useRouter();
  const { state, setSession } = useSession();
  const [step, setStep] = useState<SignInStep>(START);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === 'signed_in') router.replace('/');
  }, [router, state.status]);

  useEffect(() => {
    if (step.step === 'done') setSession(step.session);
  }, [setSession, step]);

  async function run(action: () => Promise<SignInStep>) {
    setBusy(true);
    try {
      setStep(await action());
    } catch (error) {
      setStep(afterError(error, step));
    } finally {
      setBusy(false);
    }
  }

  const signIn = (clinicId?: string) =>
    run(async () => afterLogin(await api.login({ email, password, clinicId })));

  const verify = (challengeToken: string) =>
    run(async () => ({ step: 'done', session: await api.verifyMfa({ challengeToken, code }) }));

  const restart = () => {
    setStep(START);
    setPassword('');
    setCode('');
  };

  // The password is kept only until a session is issued or the user starts again.
  useEffect(() => {
    if (step.step === 'done') setPassword('');
    if (step.step !== 'code' && step.step !== 'enroll') setCode('');
  }, [step.step]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="mb-6 text-sm font-medium uppercase tracking-wide text-neutral-500">
          {messages.app.name}
        </p>

        {step.step === 'credentials' && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <Heading title={t.title} hint={t.subtitle} />
            <Field label={t.email}>
              <input
                className={inputClass}
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label={t.password}>
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <ErrorText error={step.error} />
            <button className={buttonClass} disabled={busy} type="submit">
              {busy ? t.signingIn : t.signIn}
            </button>
          </form>
        )}

        {step.step === 'clinic' && (
          <div className="flex flex-col gap-5">
            <Heading title={t.chooseClinic} hint={t.chooseClinicHint} />
            <ul className="flex flex-col gap-3">
              {step.clinics.map((clinic) => (
                <li key={clinic.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signIn(clinic.id)}
                    className="flex min-h-14 w-full items-center justify-between rounded-lg border border-neutral-300 px-4 py-3 text-left hover:border-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <span className="text-lg font-medium">{clinic.name}</span>
                    <span className="text-sm capitalize text-neutral-500">{clinic.role}</span>
                  </button>
                </li>
              ))}
            </ul>
            <ErrorText error={step.error} />
            <BackButton onClick={restart} />
          </div>
        )}

        {(step.step === 'code' || step.step === 'enroll') && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void verify(step.challengeToken);
            }}
          >
            {step.step === 'enroll' ? (
              <>
                <Heading title={t.enrollTitle} hint={t.enrollHint} />
                <QrCode value={step.otpauthUrl} />
                <div className="text-sm text-neutral-600">
                  <p>{t.enrollManual}</p>
                  <code className="mt-1 block break-all rounded bg-neutral-100 px-2 py-1 font-mono text-base tracking-wider text-neutral-900">
                    {step.secret.match(/.{1,4}/g)?.join(' ')}
                  </code>
                </div>
              </>
            ) : (
              <Heading title={t.codeTitle} hint={t.codeHint} />
            )}
            <Field label={t.code}>
              <input
                className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <ErrorText error={step.error} />
            <button className={buttonClass} disabled={busy || code.length !== 6} type="submit">
              {busy ? t.verifying : t.verify}
            </button>
            <BackButton onClick={restart} />
          </form>
        )}
      </div>
    </main>
  );
}

function Heading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-neutral-600">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function ErrorText({ error }: { error?: string }) {
  return (
    <p role="alert" aria-live="polite" className={error ? 'text-red-700' : 'hidden'}>
      {error}
    </p>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline"
    >
      {t.back}
    </button>
  );
}

/** QR code for the otpauth link, drawn in the browser; the secret never leaves the page. */
function QrCode({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: 'svg', margin: 1, width: 208 })
      .then((markup) => active && setSvg(markup))
      .catch(() => active && setSvg(null));
    return () => {
      active = false;
    };
  }, [value]);
  return (
    <div
      className="mx-auto size-52 rounded-lg border border-neutral-200 bg-white p-1"
      role="img"
      aria-label={t.enrollTitle}
      // Markup generated locally by the qrcode library from the otpauth link.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

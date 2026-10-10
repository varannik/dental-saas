import type { VoiceContext } from '@dental/contracts';
import { expect, test, type Page } from '@playwright/test';
import { signInNewDentist } from './sign-in';

/**
 * V3 in the browser: the voice context follows what is on screen. Opening a patient, a session
 * and a tooth moves the focus; going to another patient starts a new context version with
 * nothing carried over.
 */

/** Runs the action and returns the context the server answered the next focus change with. */
async function focusAfter(page: Page, action: () => Promise<unknown>): Promise<VoiceContext> {
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/v1/voice/context/focus') && r.request().method() === 'PUT'
  );
  await action();
  const answered = await response;
  expect(answered.status()).toBe(200);
  return (await answered.json()) as VoiceContext;
}

async function register(page: Page, givenName: string) {
  await page.goto('/patients/new');
  await page.getByLabel('Given name').fill(givenName);
  await page.getByLabel('Family name').fill(`Focus ${Date.now().toString(36)}`);
  await page.getByLabel('Date of birth').fill('1979-06-15');
  await page.getByLabel('Sex').selectOption('female');
  await page.getByLabel(/^Phone/).fill(`+44 7700 ${String(Date.now()).slice(-6)}`);
  await page.getByRole('button', { name: 'Register patient' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  return page.url().split('/').pop()!;
}

test('the voice context follows the screen, and never crosses patients', async ({ page }) => {
  await signInNewDentist(page, 'CONTEXT');
  const omid = await register(page, 'Omid');
  const sara = await register(page, 'Sara');

  const onSara = await focusAfter(page, () => page.reload());
  expect(onSara).toMatchObject({ patientId: sara, sessionId: null, tooth: null });

  const inSession = await focusAfter(page, async () => {
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.waitForURL(/\/sessions\//);
  });
  expect(inSession).toMatchObject({ patientId: sara, sessionId: expect.any(String) });
  expect(inSession.version).toBe(onSara.version + 1);

  const onTooth = await focusAfter(page, () =>
    page.getByRole('button', { name: /^Tooth 16(,|$)/ }).click()
  );
  expect(onTooth).toMatchObject({ patientId: sara, sessionId: inSession.sessionId, tooth: '16' });
  // Only the tooth moved: same version, so a proposal made now would still stand.
  expect(onTooth.version).toBe(inSession.version);

  // Typed text goes through the same interpreter as speech, and the voice bar shows the result.
  const interpreted = page.waitForResponse((r) => r.url().endsWith('/v1/voice/interpret'));
  await page.getByLabel('Type a command').fill('Tooth 16 occlusal caries');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  const interpretation = await (await interpreted).json();
  expect(interpretation).toMatchObject({
    utteranceId: expect.any(String),
    contextVersion: onTooth.version,
  });
  // What was understood, or, when it is ready, the proposal waiting for confirmation (V6).
  await expect(
    page.getByLabel('Understood').or(page.getByRole('region', { name: 'Waiting for confirmation' }))
  ).toBeVisible();

  const onOmid = await focusAfter(page, () => page.goto(`/patients/${omid}`));
  expect(onOmid).toMatchObject({
    patientId: omid,
    sessionId: null,
    procedureId: null,
    tooth: null,
    pending: null,
  });
  expect(onOmid.version).toBe(onTooth.version + 1);

  const home = await focusAfter(page, () =>
    page.getByRole('link', { name: 'Home', exact: true }).click()
  );
  expect(home).toMatchObject({ patientId: null, sessionId: null, tooth: null });
});

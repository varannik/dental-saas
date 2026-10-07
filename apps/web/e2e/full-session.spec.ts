import { expect, test, type Page } from '@playwright/test';
import { totp } from './totp';

/**
 * C7 acceptance: a dentist completes and signs a full session by clicking only. Registers a
 * patient, plans a root canal, examines, diagnoses, performs the planned procedure, writes a
 * note, completes, reviews the summary and signs.
 */

const section = (page: Page, heading: string) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) });

test('a full session, from sign-in to signature, by click', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());
  const suffix = Date.now().toString(36);
  const givenName = 'Elena';
  const familyName = `Kovacs ${suffix}`;

  await test.step('sign in and enrol the authenticator', async () => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(process.env.E2E_EMAIL!);
    await page.getByLabel('Password').fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'Set up your authenticator app' }).waitFor();
    const secret = (await page.locator('code').innerText()).replace(/\s/g, '');
    await page.getByLabel('6-digit code').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByLabel('Find a patient')).toBeVisible();
    await expect(page.getByText(process.env.E2E_CLINIC!)).toBeVisible();
  });

  await test.step('register the patient', async () => {
    await page.getByRole('link', { name: 'Patients', exact: true }).click();
    await page.getByRole('link', { name: 'Register patient' }).click();
    await page.getByLabel('Given name').fill(givenName);
    await page.getByLabel('Family name').fill(familyName);
    await page.getByLabel('Date of birth').fill('1984-03-12');
    await page.getByLabel('Sex').selectOption('female');
    await page.getByLabel(/^Phone/).fill(`+44 7700 ${String(Date.now()).slice(-6)}`);
    await page.getByRole('button', { name: 'Register patient' }).click();
    await expect(page.getByRole('region', { name: 'Patient' })).toContainText(
      `${givenName} ${familyName}`
    );
  });

  await test.step('plan a root canal on 16 and record the acceptance', async () => {
    const plan = section(page, 'Treatment plan');
    await plan.getByRole('button', { name: 'Create plan' }).click();
    await plan.getByLabel('Procedure').selectOption({ label: 'Root canal treatment, molar' });
    await plan.getByLabel('Tooth', { exact: true }).fill('16');
    await plan.getByRole('button', { name: 'Add to plan' }).click();
    await expect(plan.locator('ol > li')).toHaveCount(1);
    await plan.getByRole('button', { name: 'Patient accepted' }).click();
    await expect(plan.getByText('Accepted', { exact: true })).toBeVisible();
  });

  await test.step('start the session, and resume it from the dashboard', async () => {
    await page.getByLabel(/Chief complaint/).fill('Pain upper right');
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.waitForURL(/\/sessions\/[0-9a-f-]{36}$/);
    const sessionUrl = page.url();
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('link', { name: `Resume ${givenName} ${familyName}` }).click();
    await expect(page).toHaveURL(sessionUrl);
    await expect(page.getByRole('region', { name: 'Session' })).toContainText('Pain upper right');
  });

  await test.step('examine tooth 16', async () => {
    await page.getByRole('button', { name: /^Tooth 16(,|$)/ }).click();
    const tooth = section(page, 'Tooth 16');
    await expect(page.getByRole('region', { name: 'Session' })).toContainText('Tooth 16');
    await tooth.getByRole('combobox', { name: /^Finding/ }).selectOption('caries');
    await tooth.locator('label[title="Occlusal"]').click();
    await tooth.getByRole('button', { name: 'Record', exact: true }).click();
    await expect(tooth.getByRole('listitem').filter({ hasText: 'Caries' })).toHaveCount(1);

    const perio = section(page, 'Periodontal probing');
    await perio.getByLabel('Mesio-buccal mm', { exact: true }).fill('4');
    await perio.getByLabel('Mesio-buccal Bleeding').check();
    await perio.getByRole('button', { name: 'Save probing' }).click();
    await expect(perio.getByText('Saved.')).toBeVisible();
  });

  await test.step('diagnose', async () => {
    const diagnoses = section(page, 'Diagnoses');
    await diagnoses
      .getByRole('combobox', { name: /^Diagnosis/ })
      .selectOption('irreversible_pulpitis');
    await diagnoses.getByRole('button', { name: 'Record diagnosis' }).click();
    await expect(
      diagnoses.getByRole('listitem').filter({ hasText: 'Irreversible pulpitis' })
    ).toContainText('Confirmed');
  });

  await test.step('perform the planned root canal', async () => {
    const procedures = section(page, 'Procedures');
    await procedures.getByRole('button', { name: 'Start Root canal treatment, molar 16' }).click();
    await expect(page.getByRole('region', { name: 'Session' })).toContainText(
      'Now: Root canal treatment, molar 16'
    );
    await expect(page.getByRole('button', { name: 'Complete session' })).toBeDisabled();
    await procedures
      .getByRole('button', { name: 'Complete Root canal treatment, molar 16' })
      .click();
    await expect(procedures.getByText('Completed', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Tooth 16,.*root canal treated/i })
    ).toBeVisible();
  });

  await test.step('write the note and complete the session', async () => {
    await page.getByRole('textbox', { name: 'Add note' }).fill('RCT 16 under local anaesthetic.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(section(page, 'Notes').getByText('RCT 16 under local anaesthetic.')).toBeVisible();
    await page.getByRole('button', { name: 'Complete session' }).click();
  });

  await test.step('review the summary and sign', async () => {
    const summary = section(page, 'Session summary');
    await expect(summary).toContainText('Root canal treatment, molar 16');
    await expect(summary).toContainText('Irreversible pulpitis Tooth 16');
    await expect(summary).toContainText('16O caries');
    await expect(summary).toContainText('1 note');
    await page.getByRole('button', { name: 'Sign session' }).click();
    await expect(page.getByText(/^Signed by you on/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Session' })).toContainText('Session signed');
    await expect(
      page.getByRole('button', { name: /^(Record|Add note|Save probing|Complete session)$/ })
    ).toHaveCount(0);
  });

  await test.step('the activity rail shows the work, newest first', async () => {
    const rail = page.getByRole('complementary', { name: 'Activity' });
    await expect(rail.getByRole('listitem').first()).toContainText('Session signed');
    await expect(rail).toContainText('Procedure completed');
  });
});

import { expect, type Page } from '@playwright/test';
import { totp } from './totp';

/** Signs in a freshly seeded dentist, enrolling the authenticator on the way. */
export async function signInNewDentist(page: Page, account: 'SESSION' | 'VOICE' | 'CONTEXT') {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(process.env[`E2E_${account}_EMAIL`]!);
  await page.getByLabel('Password').fill(process.env[`E2E_${account}_PASSWORD`]!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Set up your authenticator app' }).waitFor();
  const secret = (await page.locator('code').innerText()).replace(/\s/g, '');
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText(process.env[`E2E_${account}_CLINIC`]!)).toBeVisible();
}

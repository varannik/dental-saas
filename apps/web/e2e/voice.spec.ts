import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { signInNewDentist } from './sign-in';

/**
 * V1 acceptance in the browser: push to talk streams the microphone to the server, and speech
 * recorded while the network is down reaches the server once it is back.
 */

/** A looping "voice" for Chrome's fake microphone: tone bursts with pauses, 48 kHz mono. */
function writeFakeVoice(): string {
  const rate = 48_000;
  const seconds = 10;
  const samples = new Int16Array(rate * seconds);
  for (let i = 0; i < samples.length; i += 1) {
    const inBurst = i % rate < rate * 0.7;
    samples[i] = inBurst ? Math.round(12_000 * Math.sin((2 * Math.PI * 220 * i) / rate)) : 0;
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.byteLength, 40);
  const path = join(tmpdir(), 'dental-e2e-voice.wav');
  writeFileSync(path, Buffer.concat([header, Buffer.from(samples.buffer)]));
  return path;
}

test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${writeFakeVoice()}`,
    ],
  },
});

const bar = (page: Page) => page.getByRole('contentinfo', { name: 'Voice' });

async function talk(page: Page, ms: number) {
  await page.keyboard.down('Space');
  await expect(bar(page).getByRole('button', { name: /Listening/ })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
}

const heardSeconds = async (page: Page) =>
  Number(
    (
      await bar(page)
        .getByText(/^Heard /)
        .innerText()
    ).match(/([\d.]+) s/)![1]
  );

test('push to talk streams speech, and speech survives the network going down', async ({
  page,
  context,
}) => {
  await signInNewDentist(page, 'VOICE');
  await expect(bar(page).getByRole('status')).toHaveText(/Voice connected/);

  await test.step('hold space: the server hears the speech', async () => {
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await talk(page, 2_000);
    await expect(bar(page).getByText(/^Heard /)).toBeVisible();
    // Bursts are 70% of the time, plus pre-roll, hangover and the release tail.
    expect(await heardSeconds(page)).toBeGreaterThan(1);
    await expect(bar(page).getByRole('meter', { name: 'Input level' })).toBeVisible();
  });

  await test.step('the network drops in the middle of speaking, and comes back', async () => {
    await page.keyboard.down('Space');
    await page.waitForTimeout(600);
    await context.setOffline(true);
    await expect(bar(page).getByRole('status')).toHaveText(/Offline/);
    await page.waitForTimeout(2_400);
    await page.keyboard.up('Space');
    await expect(bar(page).getByRole('status')).toHaveText(/waiting to send/);

    await context.setOffline(false);
    await expect(bar(page).getByRole('status')).toHaveText(/Voice connected/, { timeout: 10_000 });
    await expect(bar(page).getByRole('status')).not.toHaveText(/waiting to send/);
    // The utterance spanning the outage arrived whole: 3 s held, against about 2.3 s before.
    await expect.poll(() => heardSeconds(page)).toBeGreaterThan(2.8);
    await expect(bar(page).getByRole('alert')).toHaveCount(0);
  });

  await test.step('the stream continues across pages', async () => {
    await page.getByRole('link', { name: 'Patients', exact: true }).click();
    await expect(bar(page).getByRole('status')).toHaveText(/Voice connected/);
  });
});

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Seeds a fresh clinic and dentist per spec file and hands the credentials to the tests as
 * E2E_<NAME>_EMAIL and E2E_<NAME>_PASSWORD, so no two tests share a user or data.
 */

const ACCOUNTS = ['SESSION', 'VOICE', 'CONTEXT'];

export default function globalSetup() {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  for (const name of ACCOUNTS) {
    const output = execFileSync('pnpm', ['--filter', '@dental/api', '-s', 'e2e:seed'], {
      cwd: root,
      encoding: 'utf8',
    });
    const seeded = JSON.parse(output.trim().split('\n').pop()!) as {
      clinicName: string;
      email: string;
      password: string;
    };
    process.env[`E2E_${name}_CLINIC`] = seeded.clinicName;
    process.env[`E2E_${name}_EMAIL`] = seeded.email;
    process.env[`E2E_${name}_PASSWORD`] = seeded.password;
  }
}

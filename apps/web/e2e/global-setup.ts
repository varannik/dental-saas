import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Seeds a fresh clinic and dentist and hands the credentials to the tests. */
export default function globalSetup() {
  const root = fileURLToPath(new URL('../../..', import.meta.url));
  const output = execFileSync('pnpm', ['--filter', '@dental/api', '-s', 'e2e:seed'], {
    cwd: root,
    encoding: 'utf8',
  });
  const seeded = JSON.parse(output.trim().split('\n').pop()!) as {
    clinicName: string;
    email: string;
    password: string;
  };
  process.env.E2E_CLINIC = seeded.clinicName;
  process.env.E2E_EMAIL = seeded.email;
  process.env.E2E_PASSWORD = seeded.password;
}

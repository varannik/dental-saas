import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** Password hashing with argon2id at the library defaults (19 MiB, 2 passes, 1 lane). */

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash never matches.
    return false;
  }
}

/**
 * A hash to verify against when the email is unknown, so a missing account takes as long as
 * a wrong password and response times do not reveal which emails exist.
 */
export function createDummyHash(): Promise<string> {
  return hash(randomBytes(32).toString('hex'));
}

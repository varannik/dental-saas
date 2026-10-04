import { describe, expect, it } from 'vitest';
import { SecretBox } from '../../platform/secret-box.js';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUrl,
  timeStep,
  totpAt,
  verifyTotp,
} from './totp.js';

// RFC 6238 appendix B, SHA-1: the ASCII secret "12345678901234567890", eight digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP', () => {
  it.each(RFC_VECTORS)('matches the RFC 6238 vector at %i seconds', (seconds, code) => {
    expect(totpAt(RFC_SECRET, timeStep(seconds * 1000), 8)).toBe(code);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from('any bytes \x00\xff here');
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Decode('gezd gnbv-gy3t qojq')).toEqual(Buffer.from('1234567890'));
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it('generates 160-bit secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(secret).not.toBe(generateTotpSecret());
  });

  it('accepts the current step and one step either side, and returns the step', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = timeStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step + 2), now)).toBeNull();
    expect(verifyTotp(secret, ' ' + totpAt(secret, step).replace(/(\d{3})/, '$1 '), now)).toBe(
      step
    );
  });

  it('rejects malformed codes', () => {
    const secret = generateTotpSecret();
    for (const code of ['', '12345', '1234567', 'abcdef']) {
      expect(verifyTotp(secret, code)).toBeNull();
    }
  });

  it('builds a provisioning link for authenticator apps', () => {
    const url = new URL(otpauthUrl('Dental Platform', 'a@b.test', 'JBSWY3DPEHPK3PXP'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Dental Platform:a@b.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Dental Platform',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});

describe('SecretBox', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('encrypts with a fresh nonce and decrypts', () => {
    const box = SecretBox.fromBase64(key);
    const a = box.encrypt('JBSWY3DPEHPK3PXP');
    const b = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).toMatch(/^v1\./);
    expect(a).not.toBe(b);
    expect(box.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses tampered values, other keys and short keys', () => {
    const box = SecretBox.fromBase64(key);
    const sealed = box.encrypt('secret');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
    expect(() => SecretBox.development().decrypt(sealed)).toThrow();
    expect(() => SecretBox.fromBase64(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

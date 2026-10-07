import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createDummyHash, hashPassword, verifyPassword } from './passwords.js';
import { hashRefreshToken, loadSigningKeys, newRefreshToken, TokenService } from './tokens.js';

const claims = {
  userId: '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f70',
  clinicId: '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f71',
  sessionId: '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f72',
  role: 'dentist',
  permissions: ['patient.read', 'session.write'],
};

describe('TokenService', () => {
  it('signs and verifies an access token', async () => {
    const tokens = new TokenService(loadSigningKeys(), 600);
    const token = await tokens.signAccess(claims);
    expect(token.split('.')).toHaveLength(3);
    expect(JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString())).toMatchObject({
      alg: 'EdDSA',
    });
    const now = Math.floor(Date.now() / 1000);
    const verified = await tokens.verifyAccess(token);
    expect(verified).toEqual({ ...claims, expiresAt: expect.any(Number) });
    expect(verified!.expiresAt! - now).toBeGreaterThanOrEqual(599);
    expect(verified!.expiresAt! - now).toBeLessThanOrEqual(601);
  });

  it('rejects a token signed with another key', async () => {
    const token = await new TokenService(loadSigningKeys(), 600).signAccess(claims);
    expect(await new TokenService(loadSigningKeys(), 600).verifyAccess(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const keys = loadSigningKeys();
    const expired = await new SignJWT({
      cid: claims.clinicId,
      sid: claims.sessionId,
      role: 'x',
      perms: [],
    })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(claims.userId)
      .setIssuer('dental-api')
      .setAudience('dental-app')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(keys.privateKey);
    expect(await new TokenService(keys, 600).verifyAccess(expired)).toBeNull();
  });

  it('rejects garbage and tampered tokens', async () => {
    const tokens = new TokenService(loadSigningKeys(), 600);
    expect(await tokens.verifyAccess('not-a-token')).toBeNull();
    const [header, , signature] = (await tokens.signAccess(claims)).split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'admin' })).toString('base64url');
    expect(await tokens.verifyAccess(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('loads a PEM key from an environment value with escaped newlines', async () => {
    const pem = generateKeyPairSync('ed25519')
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const keys = loadSigningKeys(pem.replace(/\n/g, '\\n'));
    expect(keys.ephemeral).toBe(false);
    const tokens = new TokenService(keys, 600);
    expect(await tokens.verifyAccess(await tokens.signAccess(claims))).toEqual({
      ...claims,
      expiresAt: expect.any(Number),
    });
  });

  it('refuses a key that is not Ed25519', () => {
    const pem = generateKeyPairSync('ec', { namedCurve: 'P-256' })
      .privateKey.export({ type: 'pkcs8', format: 'pem' })
      .toString();
    expect(() => loadSigningKeys(pem)).toThrow(/Ed25519/);
  });
});

describe('refresh tokens', () => {
  it('are random and stored only as a hash', () => {
    const token = newRefreshToken();
    expect(token).not.toBe(newRefreshToken());
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });
});

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('never matches a malformed hash or the dummy hash', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
    expect(await verifyPassword(await createDummyHash(), '')).toBe(false);
  });
});

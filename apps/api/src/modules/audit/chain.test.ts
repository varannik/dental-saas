import { describe, expect, it } from 'vitest';
import { canonicalJson, entryHash, GENESIS_HASH } from './chain.js';

describe('canonicalJson', () => {
  it('sorts keys at every level and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, e: undefined })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}'
    );
  });

  it('serialises equal values identically whatever the key order', () => {
    expect(canonicalJson({ x: 1, y: 'two' })).toBe(canonicalJson({ y: 'two', x: 1 }));
  });

  it('handles scalars', () => {
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
    expect(canonicalJson(1.5)).toBe('1.5');
  });
});

describe('entryHash', () => {
  const fields = {
    clinicId: '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f70',
    seq: 1,
    at: '2026-10-05T10:00:00.000Z',
    actorId: null,
    action: 'clinic.update_settings',
    entity: 'clinic',
    entityId: '0192f3a1-7c1e-7d7a-9b0e-3d2a4c5e6f70',
    before: { name: 'Old', version: 1 },
    after: { name: 'New', version: 2 },
    commandId: null,
    requestId: 'req-1',
    ip: '127.0.0.1',
    prevHash: GENESIS_HASH,
  };

  it('is a stable SHA-256 of the content', () => {
    expect(entryHash(fields)).toMatch(/^[0-9a-f]{64}$/);
    expect(entryHash(fields)).toBe(entryHash({ ...fields }));
  });

  it('changes when any field or the previous hash changes', () => {
    const base = entryHash(fields);
    expect(entryHash({ ...fields, after: { name: 'Newer', version: 2 } })).not.toBe(base);
    expect(entryHash({ ...fields, seq: 2 })).not.toBe(base);
    expect(entryHash({ ...fields, prevHash: 'f'.repeat(64) })).not.toBe(base);
  });
});

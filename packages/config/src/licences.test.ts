import { describe, expect, it } from 'vitest';
import { isLicenceApproved, loadAllowList } from './licences.js';

describe('licence allow-list', () => {
  const { approved } = loadAllowList();

  it('includes the licences named in the dependency policy', () => {
    for (const licence of ['MIT', 'BSD-3-Clause', 'Apache-2.0', 'ISC', 'MPL-2.0', 'PostgreSQL']) {
      expect(approved).toContain(licence);
    }
  });

  it('accepts a single approved licence and a dual licence', () => {
    expect(isLicenceApproved('MIT', approved)).toBe(true);
    expect(isLicenceApproved('(MIT OR Apache-2.0)', approved)).toBe(true);
    expect(isLicenceApproved('MIT AND Apache-2.0', approved)).toBe(true);
  });

  it('only records reviewed exceptions that are themselves approved', () => {
    const list = loadAllowList();
    for (const entry of list.manifestExceptions ?? []) {
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(isLicenceApproved(entry.licence, approved)).toBe(true);
    }
  });

  it('rejects copyleft and unknown licences', () => {
    expect(isLicenceApproved('GPL-3.0', approved)).toBe(false);
    expect(isLicenceApproved('AGPL-3.0', approved)).toBe(false);
    expect(isLicenceApproved('MIT AND GPL-3.0', approved)).toBe(false);
    expect(isLicenceApproved('UNKNOWN', approved)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isValidFdi, parseTooth } from './tooth.js';

describe('parseTooth (FDI)', () => {
  it.each([
    ['16', '16'],
    ['tooth 16', '16'],
    ['#26', '26'],
    ['sixteen', '16'],
    ['tooth sixteen', '16'],
    ['twenty six', '26'],
    ['twenty-six', '26'],
    ['thirty one', '31'],
    ['forty eight', '48'],
    ['one six', '16'],
    ['two 6', '26'],
    ['1 6', '16'],
    ['upper right first molar', '16'],
    ['upper left canine', '23'],
    ['lower left third molar', '38'],
    ['lower right wisdom tooth', '48'],
    ['maxillary right central incisor', '11'],
    ['lower right second premolar', '45'],
    ['upper left six', '26'],
    ['lower right 7', '47'],
    ['fifty five', '55'],
  ])('reads "%s" as %s', (spoken, code) => {
    expect(parseTooth(spoken)).toBe(code);
  });

  it.each(['19', 'ten', 'twenty', '59', '00', 'upper molar', 'banana', '', 'one hundred'])(
    'rejects "%s"',
    (spoken) => {
      expect(parseTooth(spoken)).toBeNull();
    }
  );

  it('validates FDI codes', () => {
    expect(isValidFdi('18')).toBe(true);
    expect(isValidFdi('85')).toBe(true);
    expect(isValidFdi('86')).toBe(false);
    expect(isValidFdi('9')).toBe(false);
  });
});

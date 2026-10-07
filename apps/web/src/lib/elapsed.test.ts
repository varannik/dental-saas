import { describe, expect, it } from 'vitest';
import { formatElapsed } from './elapsed';

describe('formatElapsed', () => {
  it('shows minutes and seconds, then hours', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_400)).toBe('1:05');
    expect(formatElapsed(3_600_000 + 2 * 60_000 + 9_000)).toBe('1:02:09');
  });

  it('never goes negative when the clocks disagree', () => {
    expect(formatElapsed(-5_000)).toBe('0:00');
  });
});

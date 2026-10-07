import { describe, expect, it } from 'vitest';
import { mixAtSnr, seeded, speechRms, surgeryNoise } from './noise.js';

const RATE = 16_000;
/** One second of silence, one of a 300 Hz "voice", one of silence. */
const speech = Int16Array.from({ length: RATE * 3 }, (_, i) =>
  i >= RATE && i < RATE * 2 ? Math.round(8_000 * Math.sin((2 * Math.PI * 300 * i) / RATE)) : 0
);

describe('surgery noise', () => {
  it('is the same for the same seed and different for another', () => {
    expect(seeded(7)()).toBe(seeded(7)());
    expect(surgeryNoise(100, RATE, 1)).toEqual(surgeryNoise(100, RATE, 1));
    expect(surgeryNoise(100, RATE, 1)).not.toEqual(surgeryNoise(100, RATE, 2));
  });

  it('measures speech loudness without the silence around it', () => {
    expect(speechRms(speech, RATE)).toBeCloseTo(8_000 / Math.SQRT2, -1);
  });

  it('mixes noise at the requested signal-to-noise ratio', () => {
    for (const snr of [20, 10, 0]) {
      const mixed = mixAtSnr(speech, RATE, snr);
      const noise = Float64Array.from(mixed, (value, i) => value - speech[i]!);
      const noiseRms = Math.sqrt(noise.reduce((sum, v) => sum + v * v, 0) / noise.length);
      const measured = 20 * Math.log10(speechRms(speech, RATE) / noiseRms);
      expect(measured).toBeCloseTo(snr, 0);
    }
  });
});

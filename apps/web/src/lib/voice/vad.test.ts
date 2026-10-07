import { describe, expect, it } from 'vitest';
import { EnergyVad, frameDb } from './vad';

const FRAME = 320;
const silence = (level = 30) =>
  Int16Array.from({ length: FRAME }, (_, i) => (i % 2 ? level : -level));
const tone = (amplitude = 8000) =>
  Int16Array.from({ length: FRAME }, (_, i) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 200 * i) / 16000))
  );

describe('frameDb', () => {
  it('measures the level in dBFS', () => {
    expect(frameDb(new Int16Array(FRAME))).toBe(-120);
    expect(frameDb(Int16Array.from({ length: FRAME }, () => 32767))).toBeCloseTo(0, 1);
    expect(frameDb(tone(16384))).toBeCloseTo(-9, 0);
  });
});

describe('EnergyVad', () => {
  it('sends nothing during silence', () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 100; i += 1) expect(vad.push(silence())).toEqual([]);
    expect(vad.speaking).toBe(false);
  });

  it('sends the pre-roll with the first frame of speech, then speech, then the hangover', () => {
    const vad = new EnergyVad({ preRollFrames: 5, hangoverFrames: 3 });
    for (let i = 0; i < 20; i += 1) vad.push(silence());
    const onset = vad.push(tone());
    expect(onset).toHaveLength(6);
    expect(vad.speaking).toBe(true);
    expect(vad.push(tone())).toHaveLength(1);
    const tail = [
      vad.push(silence()),
      vad.push(silence()),
      vad.push(silence()),
      vad.push(silence()),
    ];
    expect(tail.map((frames) => frames.length)).toEqual([1, 1, 1, 0]);
    expect(vad.speaking).toBe(false);
  });

  it('keeps hearing speech over steady background noise', () => {
    const vad = new EnergyVad();
    // A noisy surgery: within a few seconds the floor rises to the noise, which then stops
    // counting as speech, and speech still stands out above it.
    for (let i = 0; i < 300; i += 1) vad.push(tone(600));
    for (let i = 0; i < 50; i += 1) expect(vad.push(tone(600))).toEqual([]);
    expect(vad.push(tone(8000)).length).toBeGreaterThan(0);
  });

  it('does not let long speech lift the floor until speech is lost', () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 20; i += 1) vad.push(silence());
    let sent = 0;
    for (let i = 0; i < 250; i += 1) sent += vad.push(tone()).length;
    expect(sent).toBeGreaterThanOrEqual(250);
    expect(vad.speaking).toBe(true);
  });

  it('reports a level for the meter', () => {
    const vad = new EnergyVad();
    vad.push(new Int16Array(FRAME));
    expect(vad.level).toBe(0);
    vad.push(tone(16384));
    expect(vad.level).toBeGreaterThan(0.8);
  });
});

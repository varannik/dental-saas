/**
 * Synthetic surgery noise for the speech benchmark (V2, ADR 0005): room hiss, suction and an
 * intermittent drill whine, from a seeded generator so every run hears the same noise.
 */

/** mulberry32: small, fast and seedable. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function surgeryNoise(length: number, sampleRate: number, seed = 1): Float64Array {
  const random = seeded(seed);
  const noise = new Float64Array(length);
  const drillPhase = random() * 2;
  let low = 0;
  let pink = 0;
  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1;
    // Room: brown-ish noise, most energy low.
    pink = 0.98 * pink + 0.02 * white;
    // Suction: white noise with the lows removed.
    low = 0.9 * low + 0.1 * white;
    const suction = white - low;
    // Drill: a whine near 2.8 kHz with vibrato, on for 0.8 s of every 2 s, starting at a
    // point that depends on the seed, so it does not always cover the first word.
    const t = i / sampleRate;
    const drillOn = (t + drillPhase) % 2 < 0.8 ? 1 : 0;
    const drill = drillOn * Math.sin(2 * Math.PI * (2_800 * t + 3 * Math.sin(2 * Math.PI * 5 * t)));
    noise[i] = 2.5 * pink + 0.6 * suction + 0.35 * drill;
  }
  return noise;
}

const rms = (values: ArrayLike<number>, from = 0, to = values.length) => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += values[i]! ** 2;
  return Math.sqrt(sum / Math.max(1, to - from));
};

/** Loudness of speech only: 20 ms frames above a silence threshold. */
export function speechRms(samples: Int16Array, sampleRate: number): number {
  const frame = Math.round(sampleRate / 50);
  const levels: number[] = [];
  for (let start = 0; start + frame <= samples.length; start += frame) {
    levels.push(rms(samples, start, start + frame));
  }
  const loudest = Math.max(...levels, 1);
  const voiced = levels.filter((level) => level > loudest * 0.1);
  return Math.sqrt(voiced.reduce((sum, level) => sum + level ** 2, 0) / Math.max(1, voiced.length));
}

/** Speech plus noise at the given signal-to-noise ratio, in dB, clipped to 16 bits. */
export function mixAtSnr(
  speech: Int16Array,
  sampleRate: number,
  snrDb: number,
  seed = 1
): Int16Array {
  const noise = surgeryNoise(speech.length, sampleRate, seed);
  const gain = speechRms(speech, sampleRate) / 10 ** (snrDb / 20) / Math.max(rms(noise), 1e-9);
  const mixed = new Int16Array(speech.length);
  for (let i = 0; i < speech.length; i += 1) {
    mixed[i] = Math.max(-32768, Math.min(32767, Math.round(speech[i]! + noise[i]! * gain)));
  }
  return mixed;
}

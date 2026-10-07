import { describe, expect, it } from 'vitest';
import { AUDIO_FRAME, decodeAudioFrame, encodeAudioFrame, VOICE_FRAME_SAMPLES } from './voice.js';

describe('voice audio frames', () => {
  it('round-trip the sequence and the samples', () => {
    const samples = Int16Array.from(
      { length: VOICE_FRAME_SAMPLES },
      (_, i) => ((i * 97) % 65536) - 32768
    );
    const encoded = encodeAudioFrame(4_000_000_000, samples);
    expect(encoded[0]).toBe(AUDIO_FRAME);
    expect(encoded.byteLength).toBe(5 + VOICE_FRAME_SAMPLES * 2);
    const decoded = decodeAudioFrame(encoded);
    expect(decoded?.seq).toBe(4_000_000_000);
    expect(Array.from(decoded!.samples)).toEqual(Array.from(samples));
  });

  it('decode from a view into a larger buffer', () => {
    const encoded = encodeAudioFrame(7, Int16Array.of(1, -1));
    const padded = new Uint8Array(encoded.byteLength + 8);
    padded.set(encoded, 4);
    expect(decodeAudioFrame(padded.subarray(4, 4 + encoded.byteLength))).toMatchObject({ seq: 7 });
  });

  it('reject anything that is not a whole frame', () => {
    expect(decodeAudioFrame(new Uint8Array([AUDIO_FRAME, 0, 0, 0, 1]))).toBeNull();
    expect(decodeAudioFrame(new Uint8Array([AUDIO_FRAME, 0, 0, 0, 1, 0, 0, 0]))).toBeNull();
    expect(decodeAudioFrame(new Uint8Array([9, 0, 0, 0, 1, 0, 0]))).toBeNull();
  });
});

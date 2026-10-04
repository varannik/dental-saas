import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWavPcm16 } from './wav.js';

function wav(rate: number, channels: number, samples: number): Buffer {
  const data = Buffer.alloc(samples * 2 * channels);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2 * channels, 28);
  header.writeUInt16LE(2 * channels, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('readWavPcm16', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wav-'));

  it('returns the PCM data of a 16 kHz mono file', () => {
    const path = join(dir, 'ok.wav');
    writeFileSync(path, wav(16000, 1, 1600));
    expect(readWavPcm16(path).length).toBe(3200);
  });

  it('rejects other formats with a conversion hint', () => {
    const path = join(dir, 'stereo.wav');
    writeFileSync(path, wav(44100, 2, 10));
    expect(() => readWavPcm16(path)).toThrow(/ffmpeg/);
  });
});

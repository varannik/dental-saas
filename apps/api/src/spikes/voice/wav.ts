import { readFileSync } from 'node:fs';
import { SAMPLE_RATE } from './route.js';

/** Reads 16-bit mono PCM at 16 kHz from a WAV file. */
export function readWavPcm16(path: string): Buffer {
  const file = readFileSync(path);
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a WAV file`);
  }
  let offset = 12;
  let format: { channels: number; rate: number; bits: number; code: number } | undefined;
  while (offset + 8 <= file.length) {
    const id = file.toString('ascii', offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        code: file.readUInt16LE(body),
        channels: file.readUInt16LE(body + 2),
        rate: file.readUInt32LE(body + 4),
        bits: file.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (
        !format ||
        format.code !== 1 ||
        format.channels !== 1 ||
        format.rate !== SAMPLE_RATE ||
        format.bits !== 16
      ) {
        throw new Error(
          `${path} must be 16-bit PCM, mono, ${SAMPLE_RATE} Hz. ` +
            `Convert with: ffmpeg -i in.wav -ac 1 -ar ${SAMPLE_RATE} -sample_fmt s16 out.wav`
        );
      }
      return file.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${path} has no data chunk`);
}

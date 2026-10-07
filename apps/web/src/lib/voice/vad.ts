/**
 * Voice-activity detection on 20 ms frames, in the browser (V1). While push-to-talk is held,
 * only speech is sent: silence is dropped, with a short pre-roll so the first syllable is not
 * clipped and a hangover so the last word is not cut (ADR 0001 found a word lost without
 * trailing audio).
 *
 * This is an energy detector with an adaptive noise floor. ADR 0004 records why it stands in
 * for Silero VAD for now; the interface is what a Silero detector would implement.
 */

export interface VoiceActivityDetector {
  /** Frames to send now: nothing during silence, the pre-roll and the frame at speech onset. */
  push(frame: Int16Array): Int16Array[];
  /** Level of the last frame, 0 to 1, for the meter. */
  readonly level: number;
  readonly speaking: boolean;
  reset(): void;
}

export interface EnergyVadOptions {
  /** Speech must be this far above the noise floor, in dB. */
  marginDb: number;
  /** Nothing quieter than this is speech, in dBFS. */
  minimumDb: number;
  /** Frames kept from before speech starts. */
  preRollFrames: number;
  /** Frames still sent after speech stops. */
  hangoverFrames: number;
}

const DEFAULTS: EnergyVadOptions = {
  marginDb: 9,
  minimumDb: -50,
  preRollFrames: 10,
  hangoverFrames: 15,
};

const FLOOR_START_DB = -60;
/** The floor follows quieter frames quickly and louder ones slowly, so speech does not lift it. */
const FLOOR_FALL = 0.2;
const FLOOR_RISE = 0.005;

export function frameDb(frame: Int16Array): number {
  if (frame.length === 0) return -120;
  let sum = 0;
  for (const sample of frame) sum += (sample / 32768) ** 2;
  const rms = Math.sqrt(sum / frame.length);
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

export class EnergyVad implements VoiceActivityDetector {
  private readonly options: EnergyVadOptions;
  private floorDb = FLOOR_START_DB;
  private preRoll: Int16Array[] = [];
  private hangover = 0;
  level = 0;
  speaking = false;

  constructor(options: Partial<EnergyVadOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  push(frame: Int16Array): Int16Array[] {
    const db = frameDb(frame);
    this.level = Math.min(1, Math.max(0, (db + 60) / 60));
    const loud = db > this.options.minimumDb && db > this.floorDb + this.options.marginDb;
    this.floorDb += (db - this.floorDb) * (db < this.floorDb ? FLOOR_FALL : FLOOR_RISE);

    if (loud) {
      this.hangover = this.options.hangoverFrames;
      if (!this.speaking) {
        this.speaking = true;
        const out = [...this.preRoll, frame];
        this.preRoll = [];
        return out;
      }
      return [frame];
    }
    if (this.speaking) {
      this.hangover -= 1;
      if (this.hangover <= 0) this.speaking = false;
      return [frame];
    }
    this.preRoll.push(frame);
    if (this.preRoll.length > this.options.preRollFrames) this.preRoll.shift();
    return [];
  }

  reset() {
    this.preRoll = [];
    this.hangover = 0;
    this.speaking = false;
  }
}

/* global sampleRate, registerProcessor, AudioWorkletProcessor */
/**
 * Converts microphone audio to 16 kHz, 16-bit mono PCM in 20 ms frames.
 * Runs at the context's native rate and averages down, because Firefox cannot connect a
 * microphone to an AudioContext created at a different sample rate.
 */
const TARGET_RATE = 16000;
const FRAME = 320;

class Pcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Int16Array(FRAME);
    this.length = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        const rest = this.frame.slice(0, this.length);
        this.length = 0;
        this.port.postMessage({ type: 'flushed', buffer: rest.buffer }, [rest.buffer]);
      }
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.position += 1;
      if (this.position < this.ratio) continue;
      this.position -= this.ratio;
      const sample = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.frame[this.length++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      if (this.length === FRAME) {
        const full = this.frame;
        this.frame = new Int16Array(FRAME);
        this.length = 0;
        this.port.postMessage({ type: 'frame', buffer: full.buffer }, [full.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('pcm16', Pcm16Processor);

/**
 * The microphone, as 20 ms frames of 16 kHz PCM16 from the capture worklet
 * (public/worklets/pcm16.js). It is opened on the first push-to-talk, a user gesture, and stays
 * open until turned off, so later presses lose no speech to start-up and the voice-activity
 * detector keeps learning the room's noise.
 */

export class Microphone {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private starting: Promise<void> | null = null;

  constructor(private readonly onFrame: (frame: Int16Array) => void) {}

  get open() {
    return this.stream !== null;
  }

  /** Asks for the microphone the first time; rejects when the user or browser refuses. */
  async start(): Promise<void> {
    if (this.context) {
      await this.context.resume();
      return;
    }
    this.starting ??= this.open_();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private async open_() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const context = new AudioContext();
    await context.audioWorklet.addModule('/worklets/pcm16.js');
    const node = new AudioWorkletNode(context, 'pcm16');
    // A silent path to the output keeps the worklet running in every browser.
    const mute = context.createGain();
    mute.gain.value = 0;
    context
      .createMediaStreamSource(stream)
      .connect(node)
      .connect(mute)
      .connect(context.destination);
    node.port.onmessage = (event: MessageEvent<{ type: string; buffer: ArrayBuffer }>) => {
      if (event.data.type === 'frame') this.onFrame(new Int16Array(event.data.buffer));
    };
    await context.resume();
    this.stream = stream;
    this.context = context;
    this.node = node;
  }

  stop() {
    this.node?.port.close();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.stream = null;
    this.context = null;
    this.node = null;
  }
}

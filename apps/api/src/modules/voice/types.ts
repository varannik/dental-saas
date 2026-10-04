/**
 * Provider-neutral contracts for the voice layer (spec section H).
 * Speech and LLM providers sit behind these interfaces so they can be swapped,
 * including for self-hosted models later, without touching command logic.
 */

export interface SttResult {
  transcript: string;
  /** Mean confidence of the final segments, 0 to 1. Zero when nothing was heard. */
  confidence: number;
}

export interface SttStreamOptions {
  sampleRate: number;
  /** Domain words that bias recognition, such as procedure and material names. */
  keyterms: string[];
  onPartial?: (text: string) => void;
  onError?: (error: Error) => void;
  /** The provider closed the stream without the caller asking. */
  onClose?: () => void;
}

export interface SttStream {
  /** 16-bit little-endian mono PCM. Chunks sent before the connection opens are buffered. */
  send(chunk: Buffer): void;
  /** Ends the utterance and resolves with the final transcript. */
  finish(): Promise<SttResult>;
  close(): void;
}

export interface SpeechToText {
  readonly provider: string;
  open(options: SttStreamOptions): SttStream;
}

export interface InterpretContext {
  /** Tooth in focus, already in the clinic's notation. */
  activeTooth?: string;
}

export type RawIntent =
  | {
      intent: 'procedure.add';
      /** The treatment as the clinician said it. Resolved to a catalog id in code. */
      procedure: string;
      /** The tooth as the clinician said it, if they said one. */
      tooth?: string;
      confidence: number;
    }
  | { intent: 'none'; reason: string };

export interface Interpreter {
  readonly model: string;
  readonly promptVersion: number;
  interpret(transcript: string, context: InterpretContext): Promise<RawIntent>;
}

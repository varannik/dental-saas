import type { FastifyBaseLogger } from 'fastify';
import { VOICE_SAMPLE_RATE } from '@dental/contracts';
import type { SpeechToText, SttStream } from '../types.js';
import type { Emit, StreamSink } from './streams.js';

/**
 * Speech-to-text for a voice stream (V2). Each utterance gets its own provider stream; a
 * connected one is kept ready, so the provider handshake (about 1.8 s in ADR 0001) is never in
 * the latency path. Partials go to the browser as they come; the final transcript is kept and
 * delivered even if the socket was down meanwhile.
 *
 * Logs carry timings only, never what was said (spec section M).
 */

export interface SpeechSinkDeps {
  stt: SpeechToText;
  /** The clinic's vocabulary; utterances before it has loaded go without biasing. */
  keyterms: Promise<string[]>;
  log: FastifyBaseLogger;
  /** The clinician started speaking: a chance to warm what follows (V4). */
  onStart?: () => void;
  /** A final transcript with words in it, for the interpreter (V4). */
  onFinal?: (utteranceId: string, text: string, confidence: number) => void;
}

/** A provider stream and where its partials go; set when an utterance takes it. */
interface Lane {
  stream: SttStream;
  partial: ((text: string) => void) | null;
}

export function createSpeechSink(deps: SpeechSinkDeps, emit: Emit): StreamSink {
  let keyterms: string[] = [];
  let closed = false;
  let standby: Lane | undefined;
  let current: { id: string; lane: Lane } | undefined;

  const open = (): Lane => {
    const lane: Lane = { stream: undefined as unknown as SttStream, partial: null };
    lane.stream = deps.stt.open({
      sampleRate: VOICE_SAMPLE_RATE,
      keyterms,
      onPartial: (text) => lane.partial?.(text),
      onError: (error) => {
        deps.log.warn({ err: error, provider: deps.stt.provider }, 'speech-to-text stream error');
        if (standby === lane) standby = undefined;
      },
      onClose: () => {
        if (standby === lane) standby = undefined;
      },
    });
    return lane;
  };

  const warm = () => {
    if (!closed && !standby) standby = open();
  };

  void deps.keyterms.then(
    (terms) => {
      keyterms = terms;
      // Reopen the standby with the vocabulary.
      standby?.stream.close();
      standby = undefined;
      warm();
    },
    (error: unknown) => {
      deps.log.warn({ err: error }, 'voice vocabulary failed to load');
      warm();
    }
  );

  return {
    utteranceStart(utteranceId) {
      current?.lane.stream.close();
      const lane = standby ?? open();
      standby = undefined;
      lane.partial = (text) => emit({ type: 'transcript.partial', utteranceId, text });
      current = { id: utteranceId, lane };
      deps.onStart?.();
    },

    audio(samples) {
      current?.lane.stream.send(
        Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
      );
    },

    utteranceEnd(utteranceId) {
      if (current?.id !== utteranceId) return;
      const { lane } = current;
      current = undefined;
      // Ready the next one while this is finalised.
      warm();
      const ended = performance.now();
      lane.stream
        .finish()
        .then((result) => {
          const finalizeMs = Math.round(performance.now() - ended);
          deps.log.info(
            {
              voice: {
                finalizeMs,
                confidence: result.confidence,
                heard: result.transcript.length > 0,
              },
            },
            'utterance transcribed'
          );
          lane.partial = null;
          emit({
            type: 'transcript.final',
            utteranceId,
            text: result.transcript,
            confidence: result.confidence,
            finalizeMs,
          });
          if (result.transcript.trim())
            deps.onFinal?.(utteranceId, result.transcript, result.confidence);
        })
        .catch((error: unknown) => {
          deps.log.warn({ err: error }, 'speech-to-text failed');
          emit({
            type: 'error',
            code: 'speech_failed',
            message: 'Speech recognition failed. Please say it again.',
          });
        })
        .finally(() => lane.stream.close());
    },

    close() {
      closed = true;
      current?.lane.stream.close();
      standby?.stream.close();
      current = undefined;
      standby = undefined;
    },
  };
}

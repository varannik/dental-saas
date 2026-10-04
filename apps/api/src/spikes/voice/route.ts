import { performance } from 'node:perf_hooks';
import type { FastifyInstance } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { z } from 'zod';
import {
  INTERPRETER_IDS,
  type InterpreterId,
  type InterpreterRegistry,
} from '../../modules/voice/interpreters.js';
import type { SpeechToText, SttStream } from '../../modules/voice/types.js';
import { SPIKE_KEYTERMS } from './catalog.js';
import { runAfterSpeech } from './pipeline.js';

/**
 * Voice spike endpoint (F7): microphone audio in, proposed command and stage timings out.
 * Development only and unauthenticated; the production gateway with tickets is V1.
 *
 * Client to server: {"type":"start","interpreter":"openai","context":{...}}, binary 16 kHz
 * PCM16 frames, {"type":"stop"}. The interpreter is optional and defaults to the server's.
 * Server to client: hello (available interpreters), ready, partial, transcript,
 * result (with timings and the interpreter used), error.
 */

export const SAMPLE_RATE = 16_000;

export interface VoiceSpikeDeps {
  stt: SpeechToText;
  interpreters: InterpreterRegistry;
}

const controlMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    interpreter: z.enum(INTERPRETER_IDS).optional(),
    context: z.object({ activeTooth: z.string().max(40).optional() }).default({}),
  }),
  z.object({ type: z.literal('stop') }),
]);

function send(socket: WebSocket, message: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

export async function registerVoiceSpike(app: FastifyInstance, deps: VoiceSpikeDeps) {
  app.get('/v1/voice/spike', { websocket: true }, (socket, request) => {
    let stream: SttStream | undefined;
    // A connected stream kept ready so the provider handshake is not in the latency path.
    let standby: SttStream | undefined;
    let context: { activeTooth?: string } = {};
    let interpreterId: InterpreterId | undefined;
    let audioBytes = 0;
    let busy = false;
    let closed = false;

    const openStream = (): SttStream => {
      const opened: SttStream = deps.stt.open({
        sampleRate: SAMPLE_RATE,
        keyterms: SPIKE_KEYTERMS,
        onPartial: (text) => {
          if (stream === opened) send(socket, { type: 'partial', text });
        },
        onError: (error) => {
          request.log.warn({ err: error }, 'speech-to-text stream error');
          if (standby === opened) standby = undefined;
          if (stream === opened) {
            send(socket, { type: 'error', message: 'Speech recognition failed.' });
          }
        },
        onClose: () => {
          if (standby === opened) standby = undefined;
        },
      });
      return opened;
    };

    const warmUp = () => {
      if (!closed && !standby) standby = openStream();
    };
    warmUp();

    send(socket, {
      type: 'hello',
      interpreters: deps.interpreters.list(),
      defaultInterpreter: deps.interpreters.defaultId,
    });

    socket.on('message', async (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (stream) {
          const chunk = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as Buffer);
          audioBytes += chunk.length;
          stream.send(chunk);
        }
        return;
      }

      let parsed;
      try {
        parsed = controlMessage.safeParse(JSON.parse(data.toString()));
      } catch {
        parsed = undefined;
      }
      if (!parsed?.success) {
        send(socket, { type: 'error', message: 'Unrecognised control message.' });
        return;
      }

      if (parsed.data.type === 'start') {
        if (busy) {
          send(socket, { type: 'error', message: 'Still processing the last utterance.' });
          return;
        }
        if (!deps.interpreters.get(parsed.data.interpreter)) {
          send(socket, {
            type: 'error',
            message: `Interpreter "${parsed.data.interpreter}" is not configured on the server.`,
          });
          return;
        }
        stream?.close();
        interpreterId = parsed.data.interpreter;
        // Refresh the interpreter connection while the clinician speaks. Failures surface on
        // the real call, so a failed warm-up is only logged.
        deps.interpreters
          .get(interpreterId)
          ?.interpreter.warm?.()
          .catch((error: unknown) =>
            request.log.debug({ err: error }, 'interpreter warm-up failed')
          );
        context = parsed.data.context;
        audioBytes = 0;
        stream = standby ?? openStream();
        standby = undefined;
        send(socket, { type: 'ready' });
        return;
      }

      // stop
      const current = stream;
      if (!current) {
        send(socket, { type: 'error', message: 'No utterance in progress.' });
        return;
      }
      const chosen = deps.interpreters.get(interpreterId)!;
      busy = true;
      const endOfSpeech = performance.now();
      // Warm the next stream while this utterance is finalised and interpreted.
      warmUp();
      try {
        const outcome = await runAfterSpeech(
          endOfSpeech,
          () => current.finish(),
          chosen.interpreter,
          context,
          (transcript) => send(socket, { type: 'transcript', ...transcript })
        );
        const audioMs = Math.round((audioBytes / 2 / SAMPLE_RATE) * 1000);
        // Timings only: no transcript or patient content in logs (spec section M).
        request.log.info(
          {
            voiceSpike: {
              ...outcome.timings,
              audioMs,
              kind: outcome.result.kind,
              interpreter: chosen.id,
              model: chosen.interpreter.model,
            },
          },
          'voice spike utterance'
        );
        send(socket, {
          type: 'result',
          result: outcome.result,
          timings: { ...outcome.timings, audioMs },
          interpreter: { id: chosen.id, model: chosen.interpreter.model },
        });
      } catch (error) {
        request.log.error({ err: error, interpreter: chosen.id }, 'voice spike pipeline failed');
        // Development only: the provider's message (for example a billing or key error) helps.
        const detail = error instanceof Error ? error.message.slice(0, 300) : '';
        send(socket, {
          type: 'error',
          message: `Interpretation failed (${chosen.id}${detail ? `: ${detail}` : ''}).`,
        });
      } finally {
        if (stream === current) stream = undefined;
        current.close();
        busy = false;
      }
    });

    socket.on('close', () => {
      closed = true;
      stream?.close();
      standby?.close();
    });
  });
}

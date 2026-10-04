import { performance } from 'node:perf_hooks';
import { buildProposal, type InterpretResult } from '../../modules/voice/proposal.js';
import type { InterpretContext, Interpreter, SttResult } from '../../modules/voice/types.js';
import { SPIKE_CATALOG } from './catalog.js';

/** Stage timings in milliseconds, measured from the end of speech. */
export interface StageTimings {
  /** End of speech to final transcript. */
  sttFinalizeMs: number;
  interpretMs: number;
  resolveMs: number;
  /** End of speech to proposal ready on the server. */
  serverTotalMs: number;
}

export interface PipelineOutcome {
  transcript: SttResult;
  result: InterpretResult;
  timings: StageTimings;
}

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * Runs everything after the clinician stops speaking: final transcript, interpretation,
 * resolution and proposal. Shared by the WebSocket route and the benchmark.
 */
export async function runAfterSpeech(
  endOfSpeech: number,
  finish: () => Promise<SttResult>,
  interpreter: Interpreter,
  context: InterpretContext,
  onTranscript?: (transcript: SttResult) => void
): Promise<PipelineOutcome> {
  const transcript = await finish();
  const transcribed = performance.now();
  onTranscript?.(transcript);

  if (!transcript.transcript.trim()) {
    const done = performance.now();
    return {
      transcript,
      result: { kind: 'no_command', reason: 'Nothing was heard.' },
      timings: {
        sttFinalizeMs: round(transcribed - endOfSpeech),
        interpretMs: 0,
        resolveMs: 0,
        serverTotalMs: round(done - endOfSpeech),
      },
    };
  }

  const intent = await interpreter.interpret(transcript.transcript, context);
  const interpreted = performance.now();
  const result = buildProposal({
    intent,
    transcript: transcript.transcript,
    sttConfidence: transcript.confidence,
    context,
    catalog: SPIKE_CATALOG,
    notation: 'FDI',
    model: interpreter.model,
    promptVersion: interpreter.promptVersion,
  });
  const resolved = performance.now();

  return {
    transcript,
    result,
    timings: {
      sttFinalizeMs: round(transcribed - endOfSpeech),
      interpretMs: round(interpreted - transcribed),
      resolveMs: round(resolved - interpreted),
      serverTotalMs: round(resolved - endOfSpeech),
    },
  };
}

import '../../platform/env.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { ClaudeInterpreter } from '../../modules/voice/adapters/claude.js';
import { DeepgramStt } from '../../modules/voice/adapters/deepgram.js';
import type { InterpretResult } from '../../modules/voice/proposal.js';
import { SPIKE_KEYTERMS } from './catalog.js';
import { runAfterSpeech, type StageTimings } from './pipeline.js';
import { SAMPLE_RATE } from './route.js';
import { readWavPcm16 } from './wav.js';

/**
 * Voice spike benchmark (F7). Streams recorded WAV files to the speech provider at real-time
 * pace, then runs interpretation and resolution, and reports stage timings and accuracy.
 *
 *   pnpm --filter @dental/api voice:bench --dir ../../tests/voice/spike [--runs 3] [--text]
 *
 * --text skips audio and sends each sample's transcript straight to the interpreter.
 * --tail-ms appends silence after each recording (default 300), like a pause before release.
 * --connect-ms waits for the provider handshake before streaming (default 2500), as the
 *   server's warm standby stream does.
 */

const sampleSchema = z.object({
  file: z.string().optional(),
  transcript: z.string().optional(),
  context: z.object({ activeTooth: z.string().optional() }).default({}),
  expect: z.object({
    kind: z.enum(['proposal', 'no_command']),
    procedureTypeId: z.string().optional(),
    tooth: z.string().nullable().optional(),
  }),
});
const manifestSchema = z.object({ samples: z.array(sampleSchema).min(1) });
type Sample = z.infer<typeof sampleSchema>;

const envSchema = z.object({
  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  DEEPGRAM_MODEL: z.string().min(1).default('nova-3'),
  ANTHROPIC_API_KEY: z.string().min(1),
  VOICE_LLM_MODEL: z.string().min(1).default('claude-haiku-4-5'),
});

const CHUNK_MS = 20;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

/** Sends audio in 20 ms frames on a real-time schedule and returns when the last frame is sent. */
async function streamRealtime(pcm: Buffer, send: (chunk: Buffer) => void) {
  const bytesPerChunk = (SAMPLE_RATE / 1000) * CHUNK_MS * 2;
  const start = performance.now();
  for (let index = 0, sent = 0; sent < pcm.length; index++, sent += bytesPerChunk) {
    send(pcm.subarray(sent, sent + bytesPerChunk));
    await sleep(start + (index + 1) * CHUNK_MS - performance.now());
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]!;
}

function matches(result: InterpretResult, expected: Sample['expect']): boolean {
  if (result.kind !== expected.kind) return false;
  if (result.kind === 'no_command') return true;
  const { payload } = result.command;
  if (expected.procedureTypeId && payload.procedureTypeId !== expected.procedureTypeId) {
    return false;
  }
  if (expected.tooth !== undefined && payload.tooth !== expected.tooth) return false;
  return true;
}

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      runs: { type: 'string', default: '3' },
      text: { type: 'boolean', default: false },
      'no-warmup': { type: 'boolean', default: false },
      'tail-ms': { type: 'string', default: '300' },
      'connect-ms': { type: 'string', default: '2500' },
      out: { type: 'string' },
    },
  });
  if (!values.dir) throw new Error('Pass --dir with a manifest.json inside.');
  const dir = resolve(values.dir);
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  );
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    const missing = parsedEnv.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Set ${missing} in .env (repository root or apps/api) or the environment.`);
  }
  const env = parsedEnv.data;
  const runs = Number(values.runs);
  const textMode = values.text;
  if (!textMode && !env.DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY is required unless --text is passed.');
  }

  const interpreter = new ClaudeInterpreter({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.VOICE_LLM_MODEL,
  });
  const stt = new DeepgramStt({ apiKey: env.DEEPGRAM_API_KEY ?? '', model: env.DEEPGRAM_MODEL });

  // A long-running server keeps its provider connections warm; exclude the first handshake.
  if (!values['no-warmup']) await interpreter.interpret('warm up', {});

  const rows: {
    sample: string;
    run: number;
    transcript: string;
    correct: boolean;
    timings: StageTimings;
    result: InterpretResult;
  }[] = [];

  for (let run = 1; run <= runs; run++) {
    for (const sample of manifest.samples) {
      const name = sample.file ?? sample.transcript ?? '?';
      let outcome;
      if (textMode) {
        if (!sample.transcript) throw new Error(`Sample ${name} has no transcript for --text.`);
        const transcript = sample.transcript;
        outcome = await runAfterSpeech(
          performance.now(),
          async () => ({ transcript, confidence: 1 }),
          interpreter,
          sample.context
        );
      } else {
        if (!sample.file) throw new Error('Audio mode needs a file for every sample.');
        // Recordings that stop the instant speech ends lose their last word; a person
        // releasing push-to-talk leaves a short pause, so append that much silence.
        const tail = Buffer.alloc(Math.round((Number(values['tail-ms']) / 1000) * SAMPLE_RATE) * 2);
        const pcm = Buffer.concat([readWavPcm16(join(dir, sample.file)), tail]);
        const stream = stt.open({ sampleRate: SAMPLE_RATE, keyterms: SPIKE_KEYTERMS });
        // The server keeps a connected stream ready; let the handshake finish before speaking.
        await sleep(Number(values['connect-ms']));
        await streamRealtime(pcm, (chunk) => stream.send(chunk));
        outcome = await runAfterSpeech(
          performance.now(),
          () => stream.finish(),
          interpreter,
          sample.context
        );
        stream.close();
      }
      const correct = matches(outcome.result, sample.expect);
      rows.push({
        sample: name,
        run,
        transcript: outcome.transcript.transcript,
        correct,
        timings: outcome.timings,
        result: outcome.result,
      });
      console.log(
        `${correct ? 'ok  ' : 'MISS'} run ${run} ${name}: ${outcome.timings.serverTotalMs} ms` +
          ` (stt ${outcome.timings.sttFinalizeMs}, llm ${outcome.timings.interpretMs})` +
          ` "${outcome.transcript.transcript}"`
      );
    }
  }

  const stages: (keyof StageTimings)[] = [
    'sttFinalizeMs',
    'interpretMs',
    'resolveMs',
    'serverTotalMs',
  ];
  const summary = Object.fromEntries(
    stages.map((stage) => {
      const series = rows.map((row) => row.timings[stage]);
      return [
        stage,
        { p50: percentile(series, 50), p95: percentile(series, 95), max: Math.max(...series) },
      ];
    })
  );
  const accuracy = rows.filter((row) => row.correct).length / rows.length;

  console.log(`\n${rows.length} utterances, accuracy ${(accuracy * 100).toFixed(1)}%`);
  console.table(summary);
  console.log(
    'Server-side only. Add network time from the browser (measured on the spike page) ' +
      'before comparing with the 2-second target.'
  );

  const out = values.out ?? join(dir, `results-${textMode ? 'text' : 'audio'}-${Date.now()}.json`);
  writeFileSync(
    out,
    JSON.stringify(
      {
        mode: textMode ? 'text' : 'audio',
        sttProvider: textMode ? null : stt.provider,
        sttModel: textMode ? null : env.DEEPGRAM_MODEL,
        llmModel: interpreter.model,
        promptVersion: interpreter.promptVersion,
        runs,
        accuracy,
        summary,
        rows,
      },
      null,
      2
    )
  );
  console.log(`Results written to ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

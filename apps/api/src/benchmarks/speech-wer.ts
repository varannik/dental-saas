import '../platform/env.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { DeepgramStt } from '../modules/voice/adapters/deepgram.js';
import { mixAtSnr } from '../modules/voice/noise.js';
import { allTerms, buildKeyterms, type VocabularyProcedure } from '../modules/voice/vocabulary.js';
import { criticalWords, rates, score, type Score } from '../modules/voice/wer.js';
import { readWavPcm16 } from '../spikes/voice/wav.js';

/**
 * Speech recognition benchmark (V2, ADR 0005): pnpm --filter @dental/api voice:wer
 *
 * Streams every phrase of tests/voice/corpus/<locale> through the production speech adapter in
 * real time, under three conditions, and scores word error rate and critical-term error rate
 * against the bar. Recordings in recordings/<speaker>/<phrase>.wav are used when present;
 * otherwise the synthetic audio from make-audio.sh.
 *
 * Options: --locale en  --snr 10  --concurrency 6  --conditions noisy-biased,noisy-plain,clean-biased
 *          --keyterms-file <results.json> to bias with the keyterms of an earlier run (A/B)
 *          --label <name> to add to the results file name
 */

const SAMPLE_RATE = 16_000;
const FRAME_MS = 20;
/** Push-to-talk keeps sending this long after release (ADR 0001, finding 4). */
const TAIL_MS = 300;
const BAR = { criticalErrorRate: 0.05, wer: 0.1 };

type Condition = 'noisy-biased' | 'noisy-plain' | 'clean-biased';

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1]! : fallback;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const locale = option('locale', 'en');
const snr = Number(option('snr', '10'));
const concurrency = Number(option('concurrency', '6'));
const conditions = option('conditions', 'noisy-biased,noisy-plain,clean-biased').split(
  ','
) as Condition[];
const corpus = join(root, 'tests/voice/corpus', locale);

interface Manifest {
  voices: { id: string }[];
  phrases: { id: string; group: string; text: string }[];
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

async function catalog(): Promise<VocabularyProcedure[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_MIGRATION_URL });
  await client.connect();
  try {
    const { rows } = await client.query<VocabularyProcedure>(
      `SELECT name, aliases FROM catalog.procedure_types
       WHERE clinic_id IS NULL AND active ORDER BY name`
    );
    return rows;
  } finally {
    await client.end();
  }
}

/** Recorded speakers first; synthetic voices when nothing has been recorded. */
function sources(manifest: Manifest) {
  const recorded = join(corpus, 'recordings');
  const out: {
    speaker: string;
    phrase: Manifest['phrases'][number];
    file: string;
    recorded: boolean;
  }[] = [];
  for (const phrase of manifest.phrases) {
    for (const voice of manifest.voices) {
      const file = join(corpus, 'audio', voice.id, `${phrase.id}.wav`);
      if (existsSync(file)) out.push({ speaker: voice.id, phrase, file, recorded: false });
    }
  }
  if (existsSync(recorded)) {
    for (const speaker of readdirSync(recorded)) {
      for (const phrase of manifest.phrases) {
        const file = join(recorded, speaker, `${phrase.id}.wav`);
        if (existsSync(file)) out.push({ speaker, phrase, file, recorded: true });
      }
    }
  }
  return out;
}

/** Rejects when the provider fails, so a failed connection is never scored as silence. */
async function transcribe(stt: DeepgramStt, pcm: Int16Array, keyterms: string[]) {
  let failure: Error | null = null;
  const stream = stt.open({
    sampleRate: SAMPLE_RATE,
    keyterms,
    onError: (error) => {
      failure = error;
    },
  });
  const bytes = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const frame = (SAMPLE_RATE / 1000) * FRAME_MS * 2;
  const start = performance.now();
  for (let index = 0, sent = 0; sent < bytes.length; index += 1, sent += frame) {
    stream.send(bytes.subarray(sent, sent + frame));
    await sleep(start + (index + 1) * FRAME_MS - performance.now());
  }
  try {
    const { transcript } = await stream.finish();
    if (failure) throw failure;
    return transcript;
  } finally {
    stream.close();
  }
}

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('Set DEEPGRAM_API_KEY in .env.');
  const model = process.env.DEEPGRAM_MODEL ?? 'nova-3';
  const manifest = JSON.parse(readFileSync(join(corpus, 'manifest.json'), 'utf8')) as Manifest;
  const procedures = await catalog();
  const keytermsFile = option('keyterms-file', '');
  const keyterms = keytermsFile
    ? (JSON.parse(readFileSync(keytermsFile, 'utf8')) as { keyterms: string[] }).keyterms
    : buildKeyterms(procedures);
  const critical = criticalWords(allTerms(procedures));
  const stt = new DeepgramStt({ apiKey, model, finalizeTimeoutMs: 4_000 });
  // A synthetic voice that spells words out or skips them is broken, not hard to recognise;
  // its files are left out and listed. Recordings are always kept.
  const implausible: string[] = [];
  const items = sources(manifest).filter((item) => {
    if (item.recorded) return true;
    const seconds = readWavPcm16(item.file).length / 2 / SAMPLE_RATE;
    const perWord = seconds / item.phrase.text.split(/\s+/).length;
    if (perWord >= 0.12 && perWord <= 0.9) return true;
    implausible.push(`${item.speaker}/${item.phrase.id} (${perWord.toFixed(2)} s per word)`);
    return false;
  });
  if (implausible.length)
    console.warn(`left out, implausible synthetic audio: ${implausible.join(', ')}`);
  if (items.length === 0) throw new Error(`No audio in ${corpus}; run make-audio.sh first.`);

  const jobs = conditions.flatMap((condition) => items.map((item) => ({ condition, ...item })));
  console.log(
    `${jobs.length} utterances (${items.length} per condition), ${keyterms.length} keyterms, model ${model}, SNR ${snr} dB`
  );
  const rows: {
    condition: Condition;
    speaker: string;
    recorded: boolean;
    phrase: string;
    group: string;
    reference: string;
    transcript: string;
    score: Score;
  }[] = [];
  let next = 0;
  let done = 0;
  /** Utterances the provider failed three times: reported, never scored. */
  const failed: string[] = [];
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const speech = readWavPcm16(job.file);
      const samples = new Int16Array(speech.buffer, speech.byteOffset, speech.byteLength / 2);
      const padded = new Int16Array(samples.length + (SAMPLE_RATE * TAIL_MS) / 1000);
      padded.set(samples);
      // Seeded per file: the same noise every run, a different drill timing per file.
      const seed = [...`${job.speaker}/${job.phrase.id}`].reduce(
        (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
        7
      );
      const audio = job.condition.startsWith('noisy')
        ? mixAtSnr(padded, SAMPLE_RATE, snr, seed)
        : padded;
      let transcript: string | null = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          transcript = await transcribe(
            stt,
            audio,
            job.condition.endsWith('biased') ? keyterms : []
          );
          break;
        } catch (error) {
          if (attempt === 3) {
            failed.push(`${job.condition} ${job.speaker}/${job.phrase.id}: ${String(error)}`);
          } else await sleep(2_000 * attempt);
        }
      }
      done += 1;
      if (transcript === null) continue;
      rows.push({
        condition: job.condition,
        speaker: job.speaker,
        recorded: job.recorded,
        phrase: job.phrase.id,
        group: job.phrase.group,
        reference: job.phrase.text,
        transcript,
        score: score(job.phrase.text, transcript, critical),
      });
      if (done % 25 === 0) console.log(`  ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const summary = Object.fromEntries(
    conditions.map((condition) => {
      const mine = rows.filter((row) => row.condition === condition);
      const groups = [...new Set(mine.map((row) => row.group))];
      const speakers = [...new Set(mine.map((row) => row.speaker))];
      return [
        condition,
        {
          ...rates(mine.map((row) => row.score)),
          utterances: mine.length,
          byGroup: Object.fromEntries(
            groups.map((g) => [g, rates(mine.filter((r) => r.group === g).map((r) => r.score))])
          ),
          bySpeaker: Object.fromEntries(
            speakers.map((s) => [s, rates(mine.filter((r) => r.speaker === s).map((r) => r.score))])
          ),
        },
      ];
    })
  ) as Partial<Record<Condition, ReturnType<typeof rates>>>;

  const primary = summary['noisy-biased'];
  const plain = summary['noisy-plain'];
  const verdict = primary
    ? {
        criticalErrorRate: primary.criticalErrorRate <= BAR.criticalErrorRate,
        wer: primary.wer <= BAR.wer,
        biasingHelps: plain ? primary.criticalErrorRate <= plain.criticalErrorRate : null,
      }
    : null;

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  console.log('\ncondition       WER     critical  utterances');
  for (const condition of conditions) {
    const s = summary[condition]!;
    console.log(
      `${condition.padEnd(15)} ${pct(s.wer).padStart(6)}  ${pct(s.criticalErrorRate).padStart(7)}   ${rows.filter((r) => r.condition === condition).length}`
    );
  }
  console.log(
    `\nbar: critical ≤ ${pct(BAR.criticalErrorRate)}, WER ≤ ${pct(BAR.wer)} on noisy-biased`
  );
  console.log('verdict:', verdict);
  if (failed.length)
    console.warn(`${failed.length} utterances failed at the provider and were not scored`);

  const resultsDir = join(corpus, 'results');
  mkdirSync(resultsDir, { recursive: true });
  const file = join(
    resultsDir,
    `${new Date().toISOString().slice(0, 10)}-${model}-snr${snr}${option('label', '') ? `-${option('label', '')}` : ''}.json`
  );
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        model,
        locale,
        snrDb: snr,
        keyterms,
        bar: BAR,
        verdict,
        summary,
        leftOut: implausible,
        failed,
        // Only the rows with errors, to keep the file readable.
        errors: rows
          .filter((row) => row.score.errors > 0)
          .map(({ condition, speaker, phrase, reference, transcript, score: s }) => ({
            condition,
            speaker,
            phrase,
            reference,
            transcript,
            errors: s.errors,
            criticalErrors: s.criticalErrors,
          })),
      },
      null,
      2
    )}\n`
  );
  console.log(`results: ${file}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

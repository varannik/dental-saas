import type { VoiceServerMessage } from '@dental/contracts';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { SpeechToText, SttResult, SttStream, SttStreamOptions } from '../types.js';
import { createSpeechSink } from './speech-sink.js';

/** A provider that records each stream and lets the test drive its partials and result. */
class FakeStt implements SpeechToText {
  readonly provider = 'fake';
  streams: {
    options: SttStreamOptions;
    bytes: number;
    closed: boolean;
    finish: (result: SttResult | Error) => void;
  }[] = [];

  open(options: SttStreamOptions): SttStream {
    let settle: ((result: SttResult | Error) => void) | undefined;
    const record = {
      options,
      bytes: 0,
      closed: false,
      finish: (result: SttResult | Error) => settle?.(result),
    };
    this.streams.push(record);
    return {
      send: (chunk) => {
        record.bytes += chunk.length;
      },
      finish: () =>
        new Promise<SttResult>((resolve, reject) => {
          settle = (result) => (result instanceof Error ? reject(result) : resolve(result));
        }),
      close: () => {
        record.closed = true;
      },
    };
  }
}

/** Fastify without a logger configured logs nothing. */
const log = Fastify().log;
const tick = () => new Promise((done) => setTimeout(done, 0));

function setup(keyterms: Promise<string[]> = Promise.resolve(['pulpitis'])) {
  const stt = new FakeStt();
  const sent: VoiceServerMessage[] = [];
  const sink = createSpeechSink({ stt, keyterms, log }, (message) => sent.push(message));
  return { stt, sent, sink };
}

describe('speech sink', () => {
  it('keeps a stream ready with the clinic vocabulary, and uses it for the next utterance', async () => {
    const { stt, sink } = setup();
    await tick();
    // The first standby opened before the vocabulary loaded is replaced by one with it.
    const ready = stt.streams.at(-1)!;
    expect(ready.options.keyterms).toEqual(['pulpitis']);
    sink.utteranceStart('u1');
    sink.audio(new Int16Array(320));
    expect(ready.bytes).toBe(640);
    // A fresh standby is not opened until the utterance ends.
    expect(stt.streams.filter((s) => !s.closed)).toHaveLength(1);
    sink.utteranceEnd('u1');
    expect(stt.streams.filter((s) => !s.closed)).toHaveLength(2);
    sink.close();
  });

  it('streams partials and the final transcript of each utterance to its own id', async () => {
    const { stt, sent, sink } = setup();
    await tick();
    sink.utteranceStart('u1');
    const first = stt.streams.at(-1)!;
    first.options.onPartial?.('irreversible');
    sink.utteranceEnd('u1');
    sink.utteranceStart('u2');
    // A late partial from the first stream still belongs to u1.
    first.options.onPartial?.('irreversible pulpitis');
    first.finish({ transcript: 'irreversible pulpitis on sixteen', confidence: 0.92 });
    await tick();
    expect(sent).toEqual([
      { type: 'transcript.partial', utteranceId: 'u1', text: 'irreversible' },
      { type: 'transcript.partial', utteranceId: 'u1', text: 'irreversible pulpitis' },
      {
        type: 'transcript.final',
        utteranceId: 'u1',
        text: 'irreversible pulpitis on sixteen',
        confidence: 0.92,
        finalizeMs: expect.any(Number),
      },
    ]);
    expect(first.closed).toBe(true);
    sink.close();
  });

  it('transcribes without the vocabulary when it fails to load', async () => {
    const { stt, sink } = setup(Promise.reject(new Error('database down')));
    await tick();
    sink.utteranceStart('u1');
    expect(stt.streams.at(-1)!.options.keyterms).toEqual([]);
    sink.close();
  });

  it('says so when recognition fails, so the clinician repeats it', async () => {
    const { stt, sent, sink } = setup();
    await tick();
    const taken = stt.streams.at(-1)!;
    sink.utteranceStart('u1');
    sink.utteranceEnd('u1');
    taken.finish(new Error('provider down'));
    await tick();
    expect(sent.at(-1)).toMatchObject({ type: 'error', code: 'speech_failed' });
    sink.close();
  });

  it('closes every provider stream with the voice stream', async () => {
    const { stt, sink } = setup();
    await tick();
    sink.utteranceStart('u1');
    sink.close();
    expect(stt.streams.every((s) => s.closed)).toBe(true);
  });
});

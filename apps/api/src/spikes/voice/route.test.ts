import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { Interpreter, SpeechToText } from '../../modules/voice/types.js';
import { buildServer } from '../../server.js';

const fakeStt = (transcript: string): SpeechToText & { audioBytes: number; opened: number } => {
  const fake = {
    provider: 'fake',
    audioBytes: 0,
    opened: 0,
    open: ({ onPartial }: { onPartial?: (text: string) => void }) => (
      fake.opened++,
      {
        send(chunk: Buffer) {
          fake.audioBytes += chunk.length;
          onPartial?.(transcript.slice(0, 5));
        },
        finish: async () => ({ transcript, confidence: 0.92 }),
        close() {},
      }
    ),
  };
  return fake;
};

const fakeInterpreter: Interpreter = {
  model: 'fake-model',
  promptVersion: 1,
  interpret: async (transcript, context) =>
    transcript.includes('crown')
      ? { intent: 'procedure.add', procedure: 'crown', confidence: 0.9 }
      : context.activeTooth
        ? { intent: 'none', reason: 'unused' }
        : { intent: 'none', reason: 'Not a command.' },
};

function collect(socket: WebSocket, until: string) {
  const messages: { type: string; [key: string]: unknown }[] = [];
  return new Promise<typeof messages>((done) => {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      messages.push(message);
      if (message.type === until) done(messages);
    });
  });
}

describe('voice spike route', () => {
  it('is not registered unless enabled', async () => {
    const app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/v1/voice/spike' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('turns an utterance into a proposal with timings', async () => {
    const stt = fakeStt('a crown please');
    const app = await buildServer({ voiceSpike: { stt, interpreter: fakeInterpreter } });
    await app.ready();
    const socket = await app.injectWS('/v1/voice/spike');
    const received = collect(socket, 'result');

    socket.send(JSON.stringify({ type: 'start', context: { activeTooth: '26' } }));
    socket.send(Buffer.alloc(640));
    socket.send(JSON.stringify({ type: 'stop' }));

    const messages = await received;
    expect(messages.map((message) => message.type)).toEqual([
      'ready',
      'partial',
      'transcript',
      'result',
    ]);
    const result = messages.at(-1)!;
    expect(result).toMatchObject({
      result: {
        kind: 'proposal',
        command: { payload: { procedureTypeId: 'spike-crown', tooth: '26' } },
      },
      timings: { audioMs: 20 },
    });
    expect((result.timings as { serverTotalMs: number }).serverTotalMs).toBeGreaterThanOrEqual(0);
    expect(stt.audioBytes).toBe(640);
    // One stream warmed on connect and used for the utterance, one warmed for the next.
    expect(stt.opened).toBe(2);
    socket.terminate();
    await app.close();
  });

  it('rejects malformed control messages', async () => {
    const app = await buildServer({
      voiceSpike: { stt: fakeStt('x'), interpreter: fakeInterpreter },
    });
    await app.ready();
    const socket = await app.injectWS('/v1/voice/spike');
    const received = collect(socket, 'error');
    socket.send('{"type":"explode"}');
    expect((await received)[0]).toEqual({
      type: 'error',
      message: 'Unrecognised control message.',
    });
    socket.terminate();
    await app.close();
  });
});

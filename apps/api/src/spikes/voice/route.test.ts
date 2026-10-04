import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import { InterpreterRegistry } from '../../modules/voice/interpreters.js';
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

const fakeInterpreter = (model: string): Interpreter & { calls: number; warmed: number } => {
  const fake = {
    model,
    promptVersion: 1,
    calls: 0,
    warmed: 0,
    warm: async () => {
      fake.warmed++;
    },
    interpret: async (transcript: string) => {
      fake.calls++;
      return transcript.includes('crown')
        ? ({ intent: 'procedure.add', procedure: 'crown', confidence: 0.9 } as const)
        : ({ intent: 'none', reason: 'Not a command.' } as const);
    },
  };
  return fake;
};

type Message = { type: string; [key: string]: unknown };

/** Connects and records every server message, including the hello sent on connect. */
async function connect(app: FastifyInstance) {
  const messages: Message[] = [];
  const waiters: { type: string; done: (messages: Message[]) => void }[] = [];
  const socket: WebSocket = await app.injectWS('/v1/voice/spike', undefined, {
    onInit: (ws) =>
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as Message;
        messages.push(message);
        for (const waiter of waiters.filter((entry) => entry.type === message.type)) {
          waiter.done([...messages]);
        }
      }),
  });
  const until = (type: string) =>
    messages.some((message) => message.type === type)
      ? Promise.resolve([...messages])
      : new Promise<Message[]>((done) => waiters.push({ type, done }));
  return { socket, messages, until };
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('voice spike route', () => {
  it('is not registered unless enabled', async () => {
    app = await buildServer();
    const response = await app.inject({ method: 'GET', url: '/v1/voice/spike' });
    expect(response.statusCode).toBe(404);
  });

  it('announces the configured interpreters on connect', async () => {
    const interpreters = new InterpreterRegistry(
      { anthropic: fakeInterpreter('claude-x'), openai: fakeInterpreter('gpt-x') },
      'openai'
    );
    app = await buildServer({ voiceSpike: { stt: fakeStt('x'), interpreters } });
    await app.ready();
    const { socket, until } = await connect(app);
    const [hello] = await until('hello');
    expect(hello).toEqual({
      type: 'hello',
      interpreters: [
        { id: 'anthropic', label: 'Anthropic Claude', model: 'claude-x' },
        { id: 'openai', label: 'OpenAI', model: 'gpt-x' },
      ],
      defaultInterpreter: 'openai',
    });
    socket.terminate();
  });

  it('turns an utterance into a proposal with the chosen interpreter', async () => {
    const stt = fakeStt('a crown please');
    const claude = fakeInterpreter('claude-x');
    const gpt = fakeInterpreter('gpt-x');
    const interpreters = new InterpreterRegistry({ anthropic: claude, openai: gpt }, 'anthropic');
    app = await buildServer({ voiceSpike: { stt, interpreters } });
    await app.ready();
    const { socket, until } = await connect(app);
    await until('hello');

    socket.send(
      JSON.stringify({ type: 'start', interpreter: 'openai', context: { activeTooth: '26' } })
    );
    socket.send(Buffer.alloc(640));
    socket.send(JSON.stringify({ type: 'stop' }));

    const messages = await until('result');
    expect(messages.map((message) => message.type)).toEqual([
      'hello',
      'ready',
      'partial',
      'transcript',
      'result',
    ]);
    const result = messages.at(-1)!;
    expect(result).toMatchObject({
      result: {
        kind: 'proposal',
        command: {
          payload: { procedureTypeId: 'spike-crown', tooth: '26' },
          interpretation: { model: 'gpt-x' },
        },
      },
      timings: { audioMs: 20 },
      interpreter: { id: 'openai', model: 'gpt-x' },
    });
    expect(gpt.calls).toBe(1);
    expect(claude.calls).toBe(0);
    // The chosen interpreter's connection is warmed when speech starts.
    expect(gpt.warmed).toBe(1);
    expect(claude.warmed).toBe(0);
    expect(stt.audioBytes).toBe(640);
    // One stream warmed on connect and used for the utterance, one warmed for the next.
    expect(stt.opened).toBe(2);
    socket.terminate();
  });

  it('uses the default interpreter when none is chosen', async () => {
    const claude = fakeInterpreter('claude-x');
    const interpreters = new InterpreterRegistry({ anthropic: claude }, 'anthropic');
    app = await buildServer({ voiceSpike: { stt: fakeStt('a crown'), interpreters } });
    await app.ready();
    const { socket, until } = await connect(app);
    socket.send(JSON.stringify({ type: 'start' }));
    socket.send(JSON.stringify({ type: 'stop' }));
    const messages = await until('result');
    expect(messages.at(-1)).toMatchObject({ interpreter: { id: 'anthropic' } });
    expect(claude.calls).toBe(1);
    socket.terminate();
  });

  it('refuses an interpreter that is not configured', async () => {
    const interpreters = new InterpreterRegistry(
      { anthropic: fakeInterpreter('claude-x') },
      'anthropic'
    );
    app = await buildServer({ voiceSpike: { stt: fakeStt('x'), interpreters } });
    await app.ready();
    const { socket, until } = await connect(app);
    socket.send(JSON.stringify({ type: 'start', interpreter: 'openai' }));
    const messages = await until('error');
    expect(messages.at(-1)).toEqual({
      type: 'error',
      message: 'Interpreter "openai" is not configured on the server.',
    });
    socket.terminate();
  });

  it('rejects malformed control messages', async () => {
    const interpreters = new InterpreterRegistry(
      { anthropic: fakeInterpreter('claude-x') },
      'anthropic'
    );
    app = await buildServer({ voiceSpike: { stt: fakeStt('x'), interpreters } });
    await app.ready();
    const { socket, until } = await connect(app);
    socket.send('{"type":"explode"}');
    expect((await until('error')).at(-1)).toEqual({
      type: 'error',
      message: 'Unrecognised control message.',
    });
    socket.terminate();
  });
});

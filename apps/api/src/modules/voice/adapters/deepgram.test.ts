import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { DeepgramStt } from './deepgram.js';

/** A stand-in for Deepgram's live API that records what it receives. */
async function fakeDeepgram(onFinalize: (socket: WebSocket) => void, handshakeDelayMs = 0) {
  const server = new WebSocketServer({
    port: 0,
    verifyClient: (_info, accept) => setTimeout(() => accept(true), handshakeDelayMs),
  });
  await new Promise<void>((ready) => server.once('listening', () => ready()));
  const received = { audioBytes: 0, controls: [] as string[], url: '', auth: '' };
  server.on('connection', (socket, request) => {
    received.url = request.url ?? '';
    received.auth = request.headers.authorization ?? '';
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        received.audioBytes += (data as Buffer).length;
        return;
      }
      const control = JSON.parse(data.toString()) as { type: string };
      received.controls.push(control.type);
      if (control.type === 'Finalize') onFinalize(socket);
    });
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/v1/listen`;
  return { server, url, received };
}

const results = (transcript: string, extra: Record<string, unknown>) =>
  JSON.stringify({
    type: 'Results',
    channel: { alternatives: [{ transcript, confidence: 0.9 }] },
    ...extra,
  });

/** Polls until the condition holds, so timing tests do not depend on machine load. */
async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
    await new Promise((done) => setTimeout(done, 10));
  }
}

let close: (() => void) | undefined;
afterEach(() => close?.());

describe('DeepgramStt', () => {
  it('buffers audio until open and resolves on the finalised transcript', async () => {
    const fake = await fakeDeepgram((socket) => {
      socket.send(results('add a root canal', { is_final: true }));
      socket.send(results('on sixteen', { is_final: true, from_finalize: true }));
    });
    close = () => fake.server.close();

    const partials: string[] = [];
    const stt = new DeepgramStt({ apiKey: 'key', url: fake.url });
    const stream = stt.open({
      sampleRate: 16000,
      keyterms: ['root canal'],
      onPartial: (text) => partials.push(text),
    });
    // Sent while the socket is still connecting.
    stream.send(Buffer.alloc(640));
    stream.send(Buffer.alloc(640));

    const result = await stream.finish();
    expect(result).toEqual({ transcript: 'add a root canal on sixteen', confidence: 0.9 });
    expect(fake.received.audioBytes).toBe(1280);
    expect(fake.received.controls).toContain('Finalize');
    expect(fake.received.auth).toBe('Token key');
    expect(fake.received.url).toContain('keyterm=root+canal');
    expect(fake.received.url).toContain('sample_rate=16000');
    expect(partials.at(-1)).toBe('add a root canal on sixteen');
    stream.close();
  });

  it('falls back to what it has when the finalised result never arrives', async () => {
    const fake = await fakeDeepgram((socket) => {
      socket.send(results('crown on twenty six', { is_final: false }));
    });
    close = () => fake.server.close();

    const stt = new DeepgramStt({ apiKey: 'key', url: fake.url, finalizeTimeoutMs: 500 });
    const stream = stt.open({ sampleRate: 16000, keyterms: [] });
    stream.send(Buffer.alloc(640));
    const result = await stream.finish();
    expect(result).toEqual({ transcript: 'crown on twenty six', confidence: 0 });
    stream.close();
  });

  it('waits for a slow handshake instead of timing out', async () => {
    const fake = await fakeDeepgram((socket) => {
      socket.send(results('crown on twenty six', { is_final: true, from_finalize: true }));
    }, 1000);
    close = () => fake.server.close();

    const errors: Error[] = [];
    const stt = new DeepgramStt({ apiKey: 'key', url: fake.url, finalizeTimeoutMs: 400 });
    const stream = stt.open({ sampleRate: 16000, keyterms: [], onError: (e) => errors.push(e) });
    stream.send(Buffer.alloc(640));
    // Finish is called long before the connection opens; the finalize timeout must not run yet.
    const result = await stream.finish();
    expect(result.transcript).toBe('crown on twenty six');
    expect(errors).toEqual([]);
    stream.close();
  });

  it('stays quiet when the caller closes a connecting stream', async () => {
    const fake = await fakeDeepgram(() => {}, 300);
    close = () => fake.server.close();

    const errors: Error[] = [];
    const closes: number[] = [];
    const stt = new DeepgramStt({ apiKey: 'key', url: fake.url });
    const stream = stt.open({
      sampleRate: 16000,
      keyterms: [],
      onError: (e) => errors.push(e),
      onClose: () => closes.push(1),
    });
    stream.close();
    await new Promise((done) => setTimeout(done, 50));
    expect(errors).toEqual([]);
    expect(closes).toEqual([]);
  });

  it('reports one error when the connection times out', async () => {
    const fake = await fakeDeepgram(() => {}, 500);
    close = () => fake.server.close();

    const errors: Error[] = [];
    const stt = new DeepgramStt({ apiKey: 'key', url: fake.url, connectTimeoutMs: 50 });
    stt.open({ sampleRate: 16000, keyterms: [], onError: (e) => errors.push(e) });
    await waitFor(() => errors.length > 0);
    // Give a duplicate error from the socket the chance to arrive, which it must not.
    await new Promise((done) => setTimeout(done, 50));
    expect(errors.map((error) => error.message)).toEqual(['Speech-to-text connection timed out']);
  });

  it('sends KeepAlive while idle', async () => {
    const fake = await fakeDeepgram(() => {});
    close = () => fake.server.close();

    const stt = new DeepgramStt({ apiKey: 'key', url: fake.url, keepAliveMs: 20 });
    const stream = stt.open({ sampleRate: 16000, keyterms: [] });
    await waitFor(() => fake.received.controls.includes('KeepAlive'));
    stream.close();
  });
});

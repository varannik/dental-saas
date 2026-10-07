import WebSocket from 'ws';
import type { SpeechToText, SttResult, SttStream, SttStreamOptions } from '../types.js';

/** Streaming speech-to-text over Deepgram's live WebSocket API. */

export interface DeepgramOptions {
  apiKey: string;
  model?: string;
  language?: string;
  /** Overridable for tests. */
  url?: string;
  /** How long to wait for the finalised transcript once Finalize has been sent. */
  finalizeTimeoutMs?: number;
  /** How long the connection may take to open before the stream fails. */
  connectTimeoutMs?: number;
  /** Interval for KeepAlive messages, which stop Deepgram closing an idle stream. */
  keepAliveMs?: number;
}

interface DeepgramResults {
  type: 'Results';
  is_final?: boolean;
  from_finalize?: boolean;
  channel?: { alternatives?: { transcript?: string; confidence?: number }[] };
}

export class DeepgramStt implements SpeechToText {
  readonly provider = 'deepgram';

  constructor(private readonly options: DeepgramOptions) {}

  open(stream: SttStreamOptions): SttStream {
    const params = new URLSearchParams({
      model: this.options.model ?? 'nova-3',
      language: this.options.language ?? 'en',
      encoding: 'linear16',
      sample_rate: String(stream.sampleRate),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
    });
    for (const term of stream.keyterms) params.append('keyterm', term);

    const url = `${this.options.url ?? 'wss://api.deepgram.com/v1/listen'}?${params}`;
    const socket = new WebSocket(url, {
      headers: { Authorization: `Token ${this.options.apiKey}` },
    });
    const finalizeTimeoutMs = this.options.finalizeTimeoutMs ?? 2000;

    const pending: Buffer[] = [];
    const finals: { text: string; confidence: number }[] = [];
    let interim = '';
    let settle: ((result: SttResult) => void) | undefined;
    let finishing: Promise<SttResult> | undefined;
    let finalizeTimer: NodeJS.Timeout | undefined;
    let keepAlive: NodeJS.Timeout | undefined;
    let closedByCaller = false;
    let errorReported = false;
    // Audio handed to the socket: when the first chunk went, and how much in total.
    let firstSentAt = 0;
    let sentBytes = 0;
    let finalizeDelay: NodeJS.Timeout | undefined;
    const transmit = (chunk: Buffer) => {
      if (sentBytes === 0) firstSentAt = Date.now();
      sentBytes += chunk.length;
      socket.send(chunk);
    };
    // Report one error per stream; the socket can emit several for the same failure.
    const fail = (error: Error) => {
      if (closedByCaller || errorReported) return;
      errorReported = true;
      stream.onError?.(error);
    };

    const connectTimer = setTimeout(() => {
      if (socket.readyState !== WebSocket.CONNECTING) return;
      fail(new Error('Speech-to-text connection timed out'));
      socket.terminate();
    }, this.options.connectTimeoutMs ?? 8000);

    const result = (): SttResult => {
      const heard = finals.filter((segment) => segment.text.length > 0);
      // A Finalize that races the last interim can leave words only in the interim.
      if (heard.length === 0 && interim) return { transcript: interim, confidence: 0 };
      return {
        transcript: heard.map((segment) => segment.text).join(' '),
        confidence: heard.length
          ? heard.reduce((sum, segment) => sum + segment.confidence, 0) / heard.length
          : 0,
      };
    };

    // The finalize timeout starts when Finalize is sent, not when the caller asks to finish,
    // so a slow handshake is not mistaken for silence.
    //
    // Finalize is held until as much time has passed since the first audio as the audio lasts.
    // Deepgram finalises what it has processed so far: after a burst (audio buffered during a
    // slow handshake, or resent after a network blip) an early Finalize drops the last words.
    // Streamed in real time, the wait is close to nothing.
    const sendFinalize = () => {
      const audioMs = (sentBytes / 2 / stream.sampleRate) * 1000;
      const wait = sentBytes === 0 ? 0 : firstSentAt + audioMs - Date.now();
      finalizeDelay = setTimeout(
        () => {
          if (socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify({ type: 'Finalize' }));
          finalizeTimer = setTimeout(() => settle?.(result()), finalizeTimeoutMs);
        },
        Math.max(0, wait)
      );
    };

    socket.on('open', () => {
      clearTimeout(connectTimer);
      for (const chunk of pending.splice(0)) transmit(chunk);
      if (finishing) {
        sendFinalize();
        return;
      }
      keepAlive = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: 'KeepAlive' }));
      }, this.options.keepAliveMs ?? 5000);
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      let message: DeepgramResults;
      try {
        message = JSON.parse(data.toString()) as DeepgramResults;
      } catch {
        return;
      }
      if (message.type !== 'Results') return;
      const alternative = message.channel?.alternatives?.[0];
      const text = alternative?.transcript?.trim() ?? '';
      if (message.is_final) {
        finals.push({ text, confidence: alternative?.confidence ?? 0 });
        interim = '';
      } else {
        interim = text;
      }
      stream.onPartial?.(
        [...finals.map((segment) => segment.text), interim].filter(Boolean).join(' ')
      );
      if (message.from_finalize) settle?.(result());
    });

    socket.on('error', fail);
    socket.on('close', () => {
      clearTimeout(connectTimer);
      clearInterval(keepAlive);
      settle?.(result());
      if (!closedByCaller) stream.onClose?.();
    });

    return {
      send(chunk) {
        if (finishing) return;
        if (socket.readyState === WebSocket.OPEN) transmit(chunk);
        else if (socket.readyState === WebSocket.CONNECTING) pending.push(chunk);
      },
      finish() {
        finishing ??= new Promise<SttResult>((resolve) => {
          clearInterval(keepAlive);
          settle = (value) => {
            settle = undefined;
            clearTimeout(finalizeTimer);
            clearTimeout(finalizeDelay);
            resolve(value);
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'CloseStream' }));
            }
          };
          if (socket.readyState === WebSocket.OPEN) sendFinalize();
          else if (socket.readyState !== WebSocket.CONNECTING) settle(result());
          // Still connecting: the open handler sends Finalize.
        });
        return finishing;
      },
      close() {
        closedByCaller = true;
        clearTimeout(connectTimer);
        clearTimeout(finalizeDelay);
        clearInterval(keepAlive);
        if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
        else socket.close();
      },
    };
  }
}

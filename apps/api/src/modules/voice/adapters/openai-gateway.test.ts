import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenAIInterpreter } from './openai.js';

/** A stand-in for an OpenAI-compatible gateway such as Run BiOS. */
async function fakeGateway() {
  const seen: { path?: string; auth?: string; body?: Record<string, unknown> } = {};
  const server = createServer((request: IncomingMessage, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      seen.path = request.url;
      seen.auth = request.headers.authorization;
      seen.body = JSON.parse(raw);
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          id: 'c1',
          object: 'chat.completion',
          created: 0,
          model: seen.body?.model,
          choices: [
            {
              index: 0,
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                refusal: null,
                tool_calls: [
                  {
                    id: 't1',
                    type: 'function',
                    function: {
                      name: 'procedure_add',
                      arguments: '{"procedure":"crown","tooth":"26","confidence":0.9}',
                    },
                  },
                ],
              },
            },
          ],
        })
      );
    });
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', () => ready()));
  const { port } = server.address() as AddressInfo;
  return { server, seen, baseURL: `http://127.0.0.1:${port}/v1` };
}

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe('OpenAIInterpreter on a gateway', () => {
  it('calls {baseURL}/chat/completions with the gateway key and prefixed model', async () => {
    const gateway = await fakeGateway();
    stop = () => gateway.server.close();

    const interpreter = new OpenAIInterpreter({
      apiKey: 'bios-test',
      model: 'openai/gpt-4.1-mini',
      baseURL: gateway.baseURL,
    });
    const intent = await interpreter.interpret('a crown on twenty six', {});

    expect(intent).toEqual({
      intent: 'procedure.add',
      procedure: 'crown',
      tooth: '26',
      confidence: 0.9,
    });
    expect(gateway.seen.path).toBe('/v1/chat/completions');
    expect(gateway.seen.auth).toBe('Bearer bios-test');
    expect(gateway.seen.body).toMatchObject({
      model: 'openai/gpt-4.1-mini',
      tool_choice: 'auto',
      parallel_tool_calls: false,
    });
  });
});

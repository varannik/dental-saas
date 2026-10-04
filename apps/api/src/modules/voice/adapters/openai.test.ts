import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { toRawIntent } from './openai.js';

function completion(message: Record<string, unknown>): OpenAI.Chat.Completions.ChatCompletion {
  return {
    choices: [{ message: { role: 'assistant', content: null, refusal: null, ...message } }],
  } as unknown as OpenAI.Chat.Completions.ChatCompletion;
}

const call = (name: string, args: string) => ({
  tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }],
});

describe('OpenAI toRawIntent', () => {
  it('maps procedure_add to a raw intent', () => {
    expect(
      toRawIntent(
        completion(call('procedure_add', '{"procedure":"crown","tooth":"26","confidence":0.8}'))
      )
    ).toEqual({ intent: 'procedure.add', procedure: 'crown', tooth: '26', confidence: 0.8 });
  });

  it('maps no_command', () => {
    expect(toRawIntent(completion(call('no_command', '{"reason":"chatter"}')))).toEqual({
      intent: 'none',
      reason: 'chatter',
    });
  });

  it('rejects malformed or invalid arguments', () => {
    expect(toRawIntent(completion(call('procedure_add', '{not json'))).intent).toBe('none');
    expect(
      toRawIntent(completion(call('procedure_add', '{"procedure":"crown","confidence":3}'))).intent
    ).toBe('none');
  });

  it('rejects tools outside the registry', () => {
    expect(toRawIntent(completion(call('delete_patient', '{}')))).toEqual({
      intent: 'none',
      reason: 'Unknown tool delete_patient.',
    });
  });

  it('treats refusals, plain text and empty responses as no command', () => {
    expect(toRawIntent(completion({ refusal: 'no' }))).toEqual({
      intent: 'none',
      reason: 'Model declined.',
    });
    expect(toRawIntent(completion({ content: 'hello' })).intent).toBe('none');
    expect(
      toRawIntent({ choices: [] } as unknown as OpenAI.Chat.Completions.ChatCompletion).intent
    ).toBe('none');
  });
});

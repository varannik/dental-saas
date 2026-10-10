import type OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { toModelReply, toRawIntent } from './openai.js';

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

describe('toModelReply', () => {
  const call = (name: string, args: string) => ({
    tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }],
  });

  it('returns the tool call as given, for the caller to validate', () => {
    expect(toModelReply(completion(call('note__add', '{"body":"x","confidence":0.8}')))).toEqual({
      kind: 'tool',
      name: 'note__add',
      input: { body: 'x', confidence: 0.8 },
    });
  });

  it('passes unparseable arguments on as nothing, so validation rejects them', () => {
    expect(toModelReply(completion(call('note__add', '{not json')))).toEqual({
      kind: 'tool',
      name: 'note__add',
      input: undefined,
    });
  });

  it('tells text and refusals apart from tool calls', () => {
    expect(toModelReply(completion({ content: 'hello' }))).toEqual({ kind: 'text' });
    expect(toModelReply(completion({ refusal: 'no' }))).toEqual({ kind: 'refusal' });
  });
});

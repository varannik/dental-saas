import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { toModelReply, toRawIntent } from './claude.js';

function message(
  content: unknown[],
  stopReason: Anthropic.Message['stop_reason'] = 'tool_use'
): Anthropic.Message {
  return { content, stop_reason: stopReason } as unknown as Anthropic.Message;
}

const toolUse = (name: string, input: unknown) => ({ type: 'tool_use', id: 't1', name, input });

describe('toRawIntent', () => {
  it('maps procedure_add to a raw intent', () => {
    expect(
      toRawIntent(
        message([
          toolUse('procedure_add', { procedure: 'root canal', tooth: '16', confidence: 0.9 }),
        ])
      )
    ).toEqual({ intent: 'procedure.add', procedure: 'root canal', tooth: '16', confidence: 0.9 });
  });

  it('maps no_command', () => {
    expect(toRawIntent(message([toolUse('no_command', { reason: 'question' })]))).toEqual({
      intent: 'none',
      reason: 'question',
    });
  });

  it('rejects input that fails validation', () => {
    const result = toRawIntent(
      message([toolUse('procedure_add', { procedure: 'crown', confidence: 7 })])
    );
    expect(result.intent).toBe('none');
  });

  it('rejects tools outside the registry', () => {
    const result = toRawIntent(message([toolUse('delete_patient', {})]));
    expect(result).toEqual({ intent: 'none', reason: 'Unknown tool delete_patient.' });
  });

  it('treats text-only and refused responses as no command', () => {
    expect(toRawIntent(message([{ type: 'text', text: 'hi' }], 'end_turn')).intent).toBe('none');
    expect(toRawIntent(message([], 'refusal'))).toEqual({
      intent: 'none',
      reason: 'Model declined.',
    });
  });
});

describe('toModelReply', () => {
  it('returns the tool call as given, for the caller to validate', () => {
    expect(
      toModelReply(message([toolUse('finding__add', { tooth: '16', confidence: 0.9 })]))
    ).toEqual({
      kind: 'tool',
      name: 'finding__add',
      input: { tooth: '16', confidence: 0.9 },
    });
  });

  it('tells text and refusals apart from tool calls', () => {
    expect(toModelReply(message([{ type: 'text', text: 'Sure!' }], 'end_turn'))).toEqual({
      kind: 'text',
    });
    expect(toModelReply(message([], 'refusal'))).toEqual({ kind: 'refusal' });
  });
});

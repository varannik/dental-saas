import { describe, expect, it } from 'vitest';
import { SPIKE_CATALOG } from '../../spikes/voice/catalog.js';
import { resolveProcedure } from './catalog.js';
import { buildProposal, type BuildProposalInput } from './proposal.js';

const base: Omit<BuildProposalInput, 'intent'> = {
  transcript: 'add a root canal on sixteen',
  sttConfidence: 0.95,
  context: {},
  catalog: SPIKE_CATALOG,
  notation: 'FDI',
  model: 'test-model',
  promptVersion: 1,
  now: new Date('2026-10-03T10:00:00Z'),
};

function proposal(input: Partial<BuildProposalInput> & Pick<BuildProposalInput, 'intent'>) {
  const result = buildProposal({ ...base, ...input });
  if (result.kind !== 'proposal') throw new Error(`expected a proposal, got ${result.reason}`);
  return result.command;
}

describe('resolveProcedure', () => {
  it('matches an alias inside the phrase', () => {
    const result = resolveProcedure('a root canal', SPIKE_CATALOG);
    expect(result).toMatchObject({
      status: 'matched',
      match: { procedure: { id: 'spike-root-canal' } },
      alternatives: [],
    });
  });

  it('prefers the longest alias', () => {
    const result = resolveProcedure('composite filling', SPIKE_CATALOG);
    expect(result).toMatchObject({
      status: 'matched',
      match: { procedure: { id: 'spike-composite' } },
    });
  });

  it('reports alternatives when two procedures share the alias', () => {
    const result = resolveProcedure('filling', SPIKE_CATALOG);
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.alternatives).toHaveLength(1);
  });

  it('does not match inside another word', () => {
    expect(resolveProcedure('encapsulate', SPIKE_CATALOG)).toEqual({ status: 'unknown' });
  });
});

describe('buildProposal', () => {
  it('builds an R2 proposal with resolved ids', () => {
    const command = proposal({
      intent: {
        intent: 'procedure.add',
        procedure: 'root canal',
        tooth: 'sixteen',
        confidence: 0.94,
      },
    });
    expect(command.payload).toEqual({ procedureTypeId: 'spike-root-canal', tooth: '16' });
    expect(command.display.summary).toBe('Add root canal treatment to tooth 16');
    expect(command.risk).toEqual({
      tier: 'R2',
      confirmation: 'explicit',
      reasons: ['clinical_write'],
    });
    expect(command.missing).toEqual([]);
    expect(command.expiresAt).toBe('2026-10-03T10:01:00.000Z');
  });

  it('takes the tooth from context and labels it', () => {
    const command = proposal({
      intent: { intent: 'procedure.add', procedure: 'crown', confidence: 0.9 },
      context: { activeTooth: '26' },
    });
    expect(command.payload.tooth).toBe('26');
    expect(command.display.fields[1]).toMatchObject({ value: '26', resolvedFrom: 'context' });
  });

  it('asks for a missing tooth', () => {
    const command = proposal({
      intent: { intent: 'procedure.add', procedure: 'root canal', confidence: 0.9 },
    });
    expect(command.missing).toEqual(['tooth']);
    expect(command.question).toBe('Which tooth?');
  });

  it('asks again when the spoken tooth is not valid', () => {
    const command = proposal({
      intent: { intent: 'procedure.add', procedure: 'crown', tooth: '19', confidence: 0.9 },
    });
    expect(command.missing).toEqual(['tooth']);
    expect(command.question).toContain('"19"');
  });

  it('raises the tier for low confidence or ambiguity', () => {
    const lowConfidence = proposal({
      intent: { intent: 'procedure.add', procedure: 'crown', tooth: '16', confidence: 0.4 },
    });
    expect(lowConfidence.risk).toMatchObject({ tier: 'R3', confirmation: 'click' });
    expect(lowConfidence.risk.reasons).toContain('low_intent_confidence');

    const ambiguous = proposal({
      intent: { intent: 'procedure.add', procedure: 'filling', tooth: '36', confidence: 0.9 },
      sttConfidence: 0.3,
    });
    expect(ambiguous.risk.reasons).toEqual(
      expect.arrayContaining(['ambiguous_entity', 'low_stt_confidence'])
    );
    expect(ambiguous.display.fields[0]?.alternatives).toEqual(['Amalgam filling']);
  });

  it('returns no command for an unknown procedure or a non-command', () => {
    expect(
      buildProposal({
        ...base,
        intent: { intent: 'procedure.add', procedure: 'veneer', confidence: 0.9 },
      }).kind
    ).toBe('no_command');
    expect(buildProposal({ ...base, intent: { intent: 'none', reason: 'chatter' } })).toEqual({
      kind: 'no_command',
      reason: 'chatter',
    });
  });
});

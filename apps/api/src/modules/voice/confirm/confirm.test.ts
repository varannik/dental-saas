import type { PendingProposal, ResolvedProposal } from '@dental/contracts';
import { describe, expect, it } from 'vitest';
import { applyFocus, emptyContext, takeForConfirmation } from '../context/context.js';
import { assessRisk } from './risk.js';

const resolved = (payload: Record<string, unknown> = {}, ready = true): ResolvedProposal => ({
  command: 'finding.add',
  payload,
  fields: [],
  missing: [],
  problems: [],
  alternatives: [],
  ready,
});

describe('risk policy', () => {
  it('keeps the registry tier when the command was clear', () => {
    expect(
      assessRisk({
        command: 'finding.add',
        proposal: resolved(),
        confidence: 0.95,
        sttConfidence: 0.97,
      })
    ).toEqual({
      base: 'R2',
      tier: 'R2',
      confirmation: 'voice_or_click',
      reasons: [],
    });
  });

  it('always needs a click for R3, such as signing', () => {
    expect(
      assessRisk({ command: 'session.sign', proposal: resolved(), confidence: 0.99 })
    ).toMatchObject({
      tier: 'R3',
      confirmation: 'click',
    });
  });

  it('raises R2 to R3 (click only) when unsure, and says why', () => {
    expect(assessRisk({ command: 'finding.add', proposal: resolved(), confidence: 0.6 })).toEqual({
      base: 'R2',
      tier: 'R3',
      confirmation: 'click',
      reasons: ['The command was not clearly understood.'],
    });
    expect(
      assessRisk({ command: 'note.add', proposal: resolved(), confidence: 0.9, sttConfidence: 0.5 })
        .reasons
    ).toEqual(['The words were not clearly heard.']);
    const deep = resolved({
      measurements: [{ tooth: '16', site: 'B', pocketDepth: 11, bleeding: false }],
    });
    expect(assessRisk({ command: 'perio.record', proposal: deep, confidence: 0.95 })).toMatchObject(
      {
        tier: 'R3',
        reasons: ['A pocket deeper than 9 mm is unusual.'],
      }
    );
  });

  it('ignores the speech threshold for typed text', () => {
    expect(assessRisk({ command: 'finding.add', proposal: resolved(), confidence: 1 }).tier).toBe(
      'R2'
    );
  });
});

describe('taking a proposal for confirmation', () => {
  const at = (seconds: number) => new Date(Date.UTC(2026, 9, 10, 9, 0, seconds));
  function withPending(overrides: Partial<PendingProposal> = {}) {
    const context = applyFocus(emptyContext(), {
      patientId: 'p',
      sessionId: 's',
      procedureId: null,
      tooth: '16',
    });
    const pending: PendingProposal = {
      id: 'x1',
      type: 'finding.add',
      payload: {},
      contextVersion: context.version,
      createdAt: at(0).toISOString(),
      expiresAt: at(120).toISOString(),
      missing: [],
      proposal: resolved(),
      risk: { base: 'R2', tier: 'R2', confirmation: 'voice_or_click', reasons: [] },
      ...overrides,
    };
    return { ...context, pending };
  }

  it('takes a ready proposal once, by voice or click', () => {
    const context = withPending();
    const voice = takeForConfirmation(context, 'x1', context.version, 'voice', at(5));
    expect(voice.outcome).toMatchObject({ ok: true, proposal: { id: 'x1' } });
    expect(voice.context.pending).toBeNull();
    expect(
      takeForConfirmation(voice.context, 'x1', context.version, 'click', at(6)).outcome
    ).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('never takes an R3 proposal by voice, and keeps it for a click', () => {
    const context = withPending({
      risk: { base: 'R3', tier: 'R3', confirmation: 'click', reasons: [] },
    });
    const voice = takeForConfirmation(context, 'x1', context.version, 'voice', at(5));
    expect(voice.outcome).toEqual({ ok: false, reason: 'confirmation_required' });
    expect(voice.context.pending?.id).toBe('x1');
    expect(
      takeForConfirmation(voice.context, 'x1', context.version, 'click', at(6)).outcome.ok
    ).toBe(true);
  });

  it('refuses a proposal without a risk decision, as if it were R3', () => {
    const context = withPending({ risk: undefined });
    expect(takeForConfirmation(context, 'x1', context.version, 'voice', at(5)).outcome).toEqual({
      ok: false,
      reason: 'confirmation_required',
    });
  });

  it('refuses one that is not ready, expired, another one, or from before the screen changed', () => {
    const notReady = withPending({ proposal: resolved({}, false) });
    expect(takeForConfirmation(notReady, 'x1', notReady.version, 'click', at(5)).outcome).toEqual({
      ok: false,
      reason: 'proposal_not_ready',
    });
    const context = withPending();
    const expired = takeForConfirmation(context, 'x1', context.version, 'click', at(121));
    expect(expired.outcome).toEqual({ ok: false, reason: 'proposal_expired' });
    expect(expired.context.pending).toBeNull();
    expect(takeForConfirmation(context, 'other', context.version, 'click', at(5)).outcome).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(takeForConfirmation(context, 'x1', context.version - 1, 'click', at(5)).outcome).toEqual(
      {
        ok: false,
        reason: 'context_changed',
      }
    );
  });
});

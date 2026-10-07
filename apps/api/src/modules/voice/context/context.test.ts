import type { VoiceFocus } from '@dental/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyFocus,
  discardPending,
  emptyContext,
  propose,
  recordResult,
  setListed,
  takePending,
} from './context.js';

const focus = (patientId: string | null, rest: Partial<VoiceFocus> = {}): VoiceFocus => ({
  patientId,
  sessionId: null,
  procedureId: null,
  tooth: null,
  ...rest,
});
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 7, 10, 0, seconds));

/** Sara in session s1, tooth 16 in focus, a proposal pending and a list shown. */
function busy() {
  let context = applyFocus(emptyContext(), focus('sara', { sessionId: 's1', tooth: '16' }));
  context = propose(
    context,
    { id: 'p1', type: 'plan_item.add', payload: {}, missing: [] },
    60_000,
    at(0)
  );
  context = setListed(context, { kind: 'diagnoses', ids: ['d1', 'd2'] });
  return recordResult(context, { commandId: 'c1', type: 'finding.add' });
}

describe('voice context focus', () => {
  it('changing patient clears the focus and discards the pending proposal (V3 acceptance)', () => {
    const before = busy();
    const after = applyFocus(before, focus('omid'));
    expect(after).toMatchObject({
      patientId: 'omid',
      sessionId: null,
      procedureId: null,
      tooth: null,
      pending: null,
      lastListed: null,
      lastResult: null,
      version: before.version + 1,
    });
  });

  it('closing the patient clears everything below it', () => {
    const after = applyFocus(busy(), focus(null, { sessionId: 's1', tooth: '16' }));
    expect(after).toMatchObject({ patientId: null, sessionId: null, tooth: null, pending: null });
  });

  it('a new session for the same patient is a new version too, but keeps the last result', () => {
    const before = busy();
    const after = applyFocus(before, focus('sara', { sessionId: 's2' }));
    expect(after).toMatchObject({ sessionId: 's2', pending: null, version: before.version + 1 });
    expect(after.lastResult).toEqual(before.lastResult);
  });

  it('a new tooth or procedure within the session keeps the version and the proposal', () => {
    const before = busy();
    const after = applyFocus(
      before,
      focus('sara', { sessionId: 's1', procedureId: 'pr1', tooth: '17' })
    );
    expect(after).toMatchObject({ tooth: '17', procedureId: 'pr1', version: before.version });
    expect(after.pending).toEqual(before.pending);
  });

  it('keeps levels in order: no session without a patient, no procedure without a session', () => {
    const context = applyFocus(emptyContext(), focus('sara', { procedureId: 'pr1', tooth: '16' }));
    expect(context).toMatchObject({
      patientId: 'sara',
      sessionId: null,
      procedureId: null,
      tooth: '16',
    });
  });

  it('changes nothing when the focus is the same', () => {
    const before = busy();
    expect(applyFocus(before, focus('sara', { sessionId: 's1', tooth: '16' }))).toBe(before);
  });
});

describe('pending proposals', () => {
  it('are taken once, under the version they were made in', () => {
    const context = busy();
    const first = takePending(context, 'p1', context.version, at(10));
    expect(first.outcome).toMatchObject({
      ok: true,
      proposal: { id: 'p1', contextVersion: context.version },
    });
    expect(first.context.pending).toBeNull();
    expect(takePending(first.context, 'p1', context.version, at(11)).outcome).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('cannot be confirmed after the patient changed', () => {
    const before = busy();
    const after = applyFocus(before, focus('omid'));
    expect(takePending(after, 'p1', before.version, at(10)).outcome).toEqual({
      ok: false,
      reason: 'context_changed',
    });
  });

  it('expire', () => {
    const outcome = takePending(busy(), 'p1', busy().version, at(61));
    expect(outcome.outcome).toEqual({ ok: false, reason: 'proposal_expired' });
    expect(outcome.context.pending).toBeNull();
  });

  it('are replaced by a newer one, and can be discarded', () => {
    let context = busy();
    context = propose(
      context,
      { id: 'p2', type: 'finding.add', payload: {}, missing: ['tooth'] },
      60_000
    );
    expect(context.pending).toMatchObject({ id: 'p2', missing: ['tooth'] });
    expect(discardPending(context).pending).toBeNull();
  });
});

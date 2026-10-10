import type { PendingProposal, VoiceContext, VoiceFocus } from '@dental/contracts';

/**
 * The rules of the voice context (V3), as pure functions over one context value; the store
 * applies them atomically. See packages/contracts/src/voice-context.ts.
 */

export function emptyContext(now = new Date()): VoiceContext {
  return {
    patientId: null,
    sessionId: null,
    procedureId: null,
    tooth: null,
    version: 0,
    pending: null,
    lastResult: null,
    lastListed: null,
    updatedAt: now.toISOString(),
  };
}

/**
 * Moves the focus. A change at a level clears every level below it. A change of patient or
 * session starts a new context version and discards the pending proposal and the last list,
 * so nothing said about one patient can land on another.
 */
export function applyFocus(
  context: VoiceContext,
  next: VoiceFocus,
  now = new Date()
): VoiceContext {
  // Each level needs the one above it.
  const focus: VoiceFocus = {
    patientId: next.patientId,
    sessionId: next.patientId ? next.sessionId : null,
    procedureId: next.patientId && next.sessionId ? next.procedureId : null,
    tooth: next.patientId ? next.tooth : null,
  };
  const patientChanged = focus.patientId !== context.patientId;
  const sessionChanged = patientChanged || focus.sessionId !== context.sessionId;
  if (
    !sessionChanged &&
    focus.procedureId === context.procedureId &&
    focus.tooth === context.tooth
  ) {
    return context;
  }
  if (!sessionChanged) return { ...context, ...focus, updatedAt: now.toISOString() };
  return {
    ...context,
    ...focus,
    version: context.version + 1,
    pending: null,
    lastListed: null,
    lastResult: patientChanged ? null : context.lastResult,
    updatedAt: now.toISOString(),
  };
}

export function propose(
  context: VoiceContext,
  proposal: Omit<PendingProposal, 'contextVersion' | 'createdAt' | 'expiresAt'>,
  ttlMs: number,
  now = new Date()
): VoiceContext {
  return {
    ...context,
    pending: {
      ...proposal,
      contextVersion: context.version,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    },
    updatedAt: now.toISOString(),
  };
}

export type TakeOutcome =
  | { ok: true; proposal: PendingProposal }
  | { ok: false; reason: 'not_found' | 'context_changed' | 'proposal_expired' };

/**
 * Takes the pending proposal for confirmation, once. It must be the one the client saw, made
 * under the context version the client saw, and not expired.
 */
export function takePending(
  context: VoiceContext,
  proposalId: string,
  contextVersion: number,
  now = new Date()
): { context: VoiceContext; outcome: TakeOutcome } {
  const pending = context.pending;
  if (contextVersion !== context.version) {
    return { context, outcome: { ok: false, reason: 'context_changed' } };
  }
  if (!pending || pending.id !== proposalId) {
    return { context, outcome: { ok: false, reason: 'not_found' } };
  }
  const cleared = { ...context, pending: null, updatedAt: now.toISOString() };
  if (new Date(pending.expiresAt) <= now) {
    return { context: cleared, outcome: { ok: false, reason: 'proposal_expired' } };
  }
  if (pending.contextVersion !== context.version) {
    return { context: cleared, outcome: { ok: false, reason: 'context_changed' } };
  }
  return { context: cleared, outcome: { ok: true, proposal: pending } };
}

export type ConfirmOutcome =
  | { ok: true; proposal: PendingProposal }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'context_changed'
        | 'proposal_expired'
        | 'proposal_not_ready'
        | 'confirmation_required';
    };

/**
 * Takes the pending proposal to execute it (V6). It must be the one the clinician saw, under the
 * context version they saw, not expired, ready, and confirmed the way its tier requires: a
 * spoken yes is never enough for R3. Anything but an expired proposal stays pending, so the
 * clinician can still click, correct or cancel it.
 */
export function takeForConfirmation(
  context: VoiceContext,
  proposalId: string,
  contextVersion: number,
  via: 'voice' | 'click',
  now = new Date()
): { context: VoiceContext; outcome: ConfirmOutcome } {
  const pending = context.pending;
  if (contextVersion !== context.version) {
    return { context, outcome: { ok: false, reason: 'context_changed' } };
  }
  if (!pending || pending.id !== proposalId) {
    return { context, outcome: { ok: false, reason: 'not_found' } };
  }
  if (new Date(pending.expiresAt) <= now) {
    return {
      context: { ...context, pending: null, updatedAt: now.toISOString() },
      outcome: { ok: false, reason: 'proposal_expired' },
    };
  }
  if (pending.contextVersion !== context.version) {
    return { context, outcome: { ok: false, reason: 'context_changed' } };
  }
  if (!pending.proposal?.ready) {
    return { context, outcome: { ok: false, reason: 'proposal_not_ready' } };
  }
  if (via === 'voice' && pending.risk?.confirmation !== 'voice_or_click') {
    return { context, outcome: { ok: false, reason: 'confirmation_required' } };
  }
  return {
    context: { ...context, pending: null, updatedAt: now.toISOString() },
    outcome: { ok: true, proposal: pending },
  };
}

export function discardPending(context: VoiceContext, now = new Date()): VoiceContext {
  return context.pending ? { ...context, pending: null, updatedAt: now.toISOString() } : context;
}

export function recordResult(
  context: VoiceContext,
  result: { commandId: string; type: string },
  now = new Date()
): VoiceContext {
  return {
    ...context,
    lastResult: { ...result, at: now.toISOString() },
    updatedAt: now.toISOString(),
  };
}

export function setListed(
  context: VoiceContext,
  listed: { kind: string; ids: string[] },
  now = new Date()
): VoiceContext {
  return { ...context, lastListed: listed, updatedAt: now.toISOString() };
}

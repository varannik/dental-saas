import {
  isValidFdi,
  type PendingProposal,
  type VoiceContext,
  type VoiceFocusUpdate,
} from '@dental/contracts';
import { withClinic, type Pool } from '../../../platform/db.js';
import { HttpProblem } from '../../../platform/http-problem.js';
import {
  applyFocus,
  discardPending,
  propose,
  recordResult,
  setListed,
  takePending,
  type TakeOutcome,
} from './context.js';
import type { ContextKey, ContextStore } from './store.js';

/** How long a proposal waits for confirmation. */
export const PROPOSAL_TTL_MS = 2 * 60_000;

/**
 * The voice context of each clinician (V3): the rules in context.ts, applied atomically in the
 * store, with every focus checked against the clinic's records first.
 */
export class VoiceContextService {
  constructor(
    private readonly store: ContextStore,
    private readonly pool: Pool
  ) {}

  get(key: ContextKey): Promise<VoiceContext> {
    return this.store.get(key);
  }

  /** Moves the focus to what is on screen, after checking each level belongs to the one above. */
  async focus(key: ContextKey, update: VoiceFocusUpdate): Promise<VoiceContext> {
    const next = {
      patientId: update.patientId,
      sessionId: update.sessionId ?? null,
      procedureId: update.procedureId ?? null,
      tooth: update.tooth ?? null,
    };
    if (next.tooth !== null && !isValidFdi(next.tooth)) {
      throw new HttpProblem(400, 'validation_failed', `${next.tooth} is not a tooth.`);
    }
    if (next.patientId) {
      await withClinic(this.pool, key.clinicId, async (client) => {
        const patient = await client.query('SELECT 1 FROM clinical.patients WHERE id = $1', [
          next.patientId,
        ]);
        if (!patient.rowCount) throw new HttpProblem(404, 'not_found', 'Patient not found.');
        if (next.sessionId) {
          const session = await client.query(
            'SELECT 1 FROM clinical.clinical_sessions WHERE id = $1 AND patient_id = $2',
            [next.sessionId, next.patientId]
          );
          if (!session.rowCount) {
            throw new HttpProblem(
              422,
              'domain_rule_violated',
              "That session is not this patient's."
            );
          }
        }
        if (next.procedureId) {
          const procedure = await client.query(
            'SELECT 1 FROM clinical.procedures WHERE id = $1 AND session_id = $2',
            [next.procedureId, next.sessionId]
          );
          if (!procedure.rowCount) {
            throw new HttpProblem(
              422,
              'domain_rule_violated',
              'That procedure is not in this session.'
            );
          }
        }
      });
    }
    return this.store.update(key, (context) => applyFocus(context, next));
  }

  /** Holds a proposal for confirmation, replacing any earlier one (V4, V6). */
  propose(
    key: ContextKey,
    proposal: Omit<PendingProposal, 'contextVersion' | 'createdAt' | 'expiresAt'>
  ): Promise<VoiceContext> {
    return this.store.update(key, (context) => propose(context, proposal, PROPOSAL_TTL_MS));
  }

  /** Takes the pending proposal for confirmation, once, if the context has not moved on. */
  async take(key: ContextKey, proposalId: string, contextVersion: number): Promise<TakeOutcome> {
    let outcome: TakeOutcome = { ok: false, reason: 'not_found' };
    await this.store.update(key, (context) => {
      const taken = takePending(context, proposalId, contextVersion);
      outcome = taken.outcome;
      return taken.context;
    });
    return outcome;
  }

  discard(key: ContextKey) {
    return this.store.update(key, (context) => discardPending(context));
  }

  recordResult(key: ContextKey, result: { commandId: string; type: string }) {
    return this.store.update(key, (context) => recordResult(context, result));
  }

  setListed(key: ContextKey, listed: { kind: string; ids: string[] }) {
    return this.store.update(key, (context) => setListed(context, listed));
  }
}

import {
  COMMANDS,
  VOICE_COMMANDS,
  type CommandType,
  type PendingProposal,
  type ResolvedProposal,
  type VoiceConfirmResponse,
} from '@dental/contracts';
import { uuidv7 } from '@dental/db';
import { withClinic, type Pool } from '../../../platform/db.js';
import { HttpProblem } from '../../../platform/http-problem.js';
import type { Actor, CommandBus } from '../../commands/bus.js';
import type { VoiceContextService } from '../context/service.js';
import type { ContextKey } from '../context/store.js';
import { resolveProposal } from '../resolve/resolve.js';
import type { ToothNotation } from '../tooth.js';
import { assessRisk } from './risk.js';

/**
 * Pending proposals and what can be done with them (V6): confirm, correct, cancel, undo. A
 * proposal reaches the command bus only through confirm, which checks it is the one the
 * clinician saw, under the context version they saw, ready, unexpired, and confirmed the way its
 * tier requires; the bus then refuses any voice command without that confirmation.
 */

export interface Hold {
  id: string;
  command: CommandType;
  entities: Record<string, string>;
  proposal: ResolvedProposal;
  confidence: number;
  sttConfidence?: number;
}

const PROBLEMS = {
  not_found: [404, 'not_found', 'There is no such proposal waiting; it may have been replaced.'],
  context_changed: [409, 'context_changed', 'The screen changed since this was proposed.'],
  proposal_expired: [410, 'proposal_expired', 'This proposal expired; say it again.'],
  proposal_not_ready: [422, 'proposal_not_ready', 'Something is still missing or unclear.'],
  confirmation_required: [403, 'confirmation_required', 'This needs a click on screen to confirm.'],
} as const;

/** Commands that have a safe inverse, and how to build it from what they created. */
const UNDO: Partial<
  Record<
    CommandType,
    {
      entity: string;
      inverse: (
        entityId: string,
        payload: Record<string, unknown>
      ) => {
        type: CommandType;
        payload: Record<string, unknown>;
      };
      describe: string;
    }
  >
> = {
  'diagnosis.record': {
    entity: 'diagnosis',
    inverse: (diagnosisId) => ({
      type: 'diagnosis.retract',
      payload: { diagnosisId, reason: 'Undone right after it was recorded.' },
    }),
    describe: 'Retract the diagnosis just recorded',
  },
  'diagnosis.suggest': {
    entity: 'diagnosis',
    inverse: (diagnosisId) => ({
      type: 'diagnosis.reject',
      payload: { diagnosisId, reason: 'Undone right after it was suggested.' },
    }),
    describe: 'Reject the diagnosis just suggested',
  },
  'procedure.start': {
    entity: 'procedure',
    inverse: (procedureId) => ({
      type: 'procedure.cancel',
      payload: { procedureId, reason: 'Undone right after it was started.' },
    }),
    describe: 'Cancel the procedure just started',
  },
  'plan_item.add': {
    entity: 'treatment_plan_item',
    inverse: (itemId) => ({
      type: 'plan_item.cancel',
      payload: { itemId, reason: 'Undone right after it was added.' },
    }),
    describe: 'Cancel the plan item just added',
  },
  'history.add': {
    entity: 'history_entry',
    inverse: (entryId, payload) => ({
      type: 'history.end',
      payload: { patientId: payload.patientId, entryId, reason: 'entered_in_error' },
    }),
    describe: 'Remove the history entry just added, as entered in error',
  },
};

/** How commands without an inverse are named when undo is refused. */
const UNDO_LABELS: Record<string, string> = {
  'finding.add': 'A finding',
  'perio.record': 'Probing',
  'note.add': 'A note',
  'procedure.complete': 'Completing a procedure',
  'procedure.cancel': 'Cancelling a procedure',
  'session.start': 'Starting a session',
  'session.complete': 'Completing a session',
  'session.sign': 'Signing',
};

export class ProposalService {
  constructor(
    private readonly deps: { pool: Pool; bus: CommandBus; context: VoiceContextService }
  ) {}

  /** Resolves entities for a command in the clinic's notation, against its records. */
  async resolve(
    key: ContextKey,
    command: CommandType,
    entities: Record<string, string>
  ): Promise<ResolvedProposal> {
    const context = await this.deps.context.get(key);
    return withClinic(this.deps.pool, key.clinicId, async (client) => {
      const clinic = await client.query<{ tooth_notation: ToothNotation }>(
        'SELECT tooth_notation FROM core.clinics WHERE id = $1',
        [key.clinicId]
      );
      return resolveProposal({
        command,
        entities,
        context,
        notation: clinic.rows[0]?.tooth_notation ?? 'FDI',
        client,
      });
    });
  }

  /**
   * Holds a resolved proposal for confirmation, with its risk decided, if the context is still
   * the one it was made for.
   */
  async hold(
    key: ContextKey,
    hold: Hold,
    expectedVersion: number
  ): Promise<{ proposed: boolean; pending: PendingProposal | null }> {
    const risk = assessRisk({
      command: hold.command,
      proposal: hold.proposal,
      confidence: hold.confidence,
      sttConfidence: hold.sttConfidence,
    });
    const { context, proposed } = await this.deps.context.propose(
      key,
      {
        id: hold.id,
        type: hold.command,
        payload: hold.proposal.payload,
        missing: hold.proposal.missing,
        entities: hold.entities,
        proposal: hold.proposal,
        risk,
      },
      expectedVersion
    );
    return { proposed, pending: proposed ? context.pending : null };
  }

  /** Executes the pending proposal through the command bus, once. */
  async confirm(
    actor: Actor & { userId: string },
    proposalId: string,
    contextVersion: number,
    via: 'voice' | 'click'
  ): Promise<VoiceConfirmResponse> {
    const key = { clinicId: actor.clinicId, userId: actor.userId };
    const idempotencyKey = `voice-proposal:${proposalId}`;
    const outcome = await this.deps.context.takeForConfirmation(
      key,
      proposalId,
      contextVersion,
      via
    );
    if (!outcome.ok) {
      // A retry of a confirmation that already ran gets the same answer.
      if (outcome.reason === 'not_found') {
        const earlier = await this.executed(actor.clinicId, idempotencyKey);
        if (earlier) return earlier;
      }
      const [status, code, title] = PROBLEMS[outcome.reason];
      throw new HttpProblem(status, code, title);
    }
    const pending = outcome.proposal;
    const executed = await this.deps.bus.execute(
      {
        type: pending.type,
        payload: pending.payload,
        idempotencyKey,
        source: 'voice',
        confirmation: { interpretationId: pending.id, via },
      },
      actor
    );
    await this.deps.context.recordResult(key, {
      commandId: executed.commandId,
      type: pending.type,
    });
    return { commandId: executed.commandId, command: pending.type, result: executed.result };
  }

  /**
   * Corrects the pending proposal with new entity values, typed on the card or spoken ("no,
   * tooth 26"), and holds the result as a new proposal; the old one can no longer be confirmed.
   */
  async correct(
    key: ContextKey,
    proposalId: string,
    contextVersion: number,
    changes: Record<string, string>,
    confidence: { confidence: number; sttConfidence?: number } = { confidence: 1 }
  ): Promise<PendingProposal> {
    const context = await this.deps.context.get(key);
    const pending = context.pending;
    if (context.version !== contextVersion) throw this.problem('context_changed');
    if (!pending || pending.id !== proposalId) throw this.problem('not_found');
    if (new Date(pending.expiresAt) <= new Date()) throw this.problem('proposal_expired');
    const command = pending.type as CommandType;
    const allowed = Object.keys(VOICE_COMMANDS[command]?.entities ?? {});
    const unknown = Object.keys(changes).filter((name) => !allowed.includes(name));
    if (unknown.length) {
      throw new HttpProblem(400, 'validation_failed', `${command} has no ${unknown.join(', ')}.`);
    }
    const entities = { ...pending.entities };
    for (const [name, value] of Object.entries(changes)) {
      if (value.trim()) entities[name] = value.trim().slice(0, 300);
      else delete entities[name];
    }
    const proposal = await this.resolve(key, command, entities);
    const held = await this.hold(
      key,
      { id: uuidv7(), command, entities, proposal, ...confidence },
      contextVersion
    );
    if (!held.pending) throw this.problem('context_changed');
    return held.pending;
  }

  async cancel(key: ContextKey, proposalId: string): Promise<boolean> {
    const context = await this.deps.context.get(key);
    if (context.pending?.id !== proposalId) return false;
    await this.deps.context.discard(key);
    return true;
  }

  /**
   * Proposes the inverse of the last command confirmed by voice in this session. Undo is a
   * write like any other: it is proposed and must be confirmed.
   */
  async undo(key: ContextKey): Promise<PendingProposal> {
    const context = await this.deps.context.get(key);
    const last = context.lastResult;
    if (!last) throw new HttpProblem(422, 'not_undoable', 'There is nothing to undo.');
    const rule = UNDO[last.type as CommandType];
    if (!rule) {
      const what = UNDO_LABELS[last.type] ?? 'The last command';
      throw new HttpProblem(
        422,
        'not_undoable',
        `${what} cannot be undone by voice; correct it on screen instead.`
      );
    }
    const found = await withClinic(this.deps.pool, key.clinicId, async (client) => {
      const command = await client.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM voice.commands WHERE id = $1',
        [last.commandId]
      );
      const audit = await client.query<{ entity_id: string }>(
        'SELECT entity_id FROM audit.audit_log WHERE command_id = $1 AND entity = $2 LIMIT 1',
        [last.commandId, rule.entity]
      );
      return { payload: command.rows[0]?.payload, entityId: audit.rows[0]?.entity_id };
    });
    if (!found.payload || !found.entityId) {
      throw new HttpProblem(422, 'not_undoable', 'The last command can no longer be found.');
    }
    const sessionId = found.payload.sessionId;
    if (typeof sessionId === 'string' && sessionId !== context.sessionId) {
      throw new HttpProblem(422, 'not_undoable', 'Undo works within the session it was done in.');
    }
    const inverse = rule.inverse(found.entityId, found.payload);
    const proposal: ResolvedProposal = {
      command: inverse.type,
      payload: inverse.payload,
      fields: [{ key: 'undo', value: rule.describe, resolvedFrom: 'context' }],
      missing: [],
      problems: [],
      alternatives: [],
      ready: COMMANDS[inverse.type].payload.safeParse(inverse.payload).success,
    };
    const held = await this.hold(
      key,
      { id: uuidv7(), command: inverse.type, entities: {}, proposal, confidence: 1 },
      context.version
    );
    if (!held.pending) throw this.problem('context_changed');
    return held.pending;
  }

  private problem(reason: keyof typeof PROBLEMS) {
    const [status, code, title] = PROBLEMS[reason];
    return new HttpProblem(status, code, title);
  }

  private async executed(
    clinicId: string,
    idempotencyKey: string
  ): Promise<VoiceConfirmResponse | null> {
    return withClinic(this.deps.pool, clinicId, async (client) => {
      const { rows } = await client.query<{ id: string; type: string; result: unknown }>(
        `SELECT id, type, result FROM voice.commands
         WHERE clinic_id = $1 AND idempotency_key = $2 AND status = 'executed'`,
        [clinicId, idempotencyKey]
      );
      const row = rows[0];
      return row ? { commandId: row.id, command: row.type, result: row.result } : null;
    });
  }
}

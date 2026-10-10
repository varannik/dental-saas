import type {
  CommandType,
  ResolvedProposal,
  VoiceContext,
  VoiceControlResult,
  VoiceInterpretation,
} from '@dental/contracts';
import { HttpProblem } from '../../../platform/http-problem.js';
import type { ProposalService } from '../confirm/proposals.js';
import { uuidv7 } from '@dental/db';
import type { FastifyBaseLogger } from 'fastify';
import { withClinic, type Pool } from '../../../platform/db.js';
import type { VoiceContextService } from '../context/service.js';
import type { ContextKey } from '../context/store.js';
import type { InterpreterId, InterpreterRegistry } from '../interpreters.js';
import { PROMPT_VERSION, SYSTEM_PROMPT, userMessage, type ModelContext } from './prompt.js';
import { buildTools, fingerprint } from './tools.js';
import { validateReply, type Interpretation } from './validate.js';

/**
 * The interpreter (V4): one pipeline for typed and spoken utterances. It describes the
 * situation to the model without names or ids, offers only the commands the clinician may run,
 * validates the answer, records the utterance and its interpretation, and holds a valid intent
 * as the pending proposal, unless the context moved on while the model was answering.
 */

export interface Speaker extends ContextKey {
  permissions: readonly string[];
}

export interface Utterance {
  text: string;
  source: 'speech' | 'text';
  sttConfidence?: number;
  interpreter?: InterpreterId;
}

export class InterpretationService {
  constructor(
    private readonly deps: {
      pool: Pool;
      context: VoiceContextService;
      proposals: ProposalService;
      interpreters: InterpreterRegistry;
      log: FastifyBaseLogger;
    }
  ) {}

  /** Opens the provider connection while the clinician is still speaking (ADR 0001). */
  warm(interpreter?: InterpreterId) {
    void this.deps.interpreters
      .get(interpreter)
      ?.interpreter.warm?.()
      .catch((error: unknown) => this.deps.log.debug({ err: error }, 'interpreter warm-up failed'));
  }

  async interpret(speaker: Speaker, utterance: Utterance): Promise<VoiceInterpretation> {
    const chosen = this.deps.interpreters.get(utterance.interpreter);
    if (!chosen) throw new Error(`Interpreter "${utterance.interpreter}" is not configured.`);
    const { interpreter } = chosen;
    const context = await this.deps.context.get(speaker);
    const modelContext = await this.describe(speaker, context);
    const offered = buildTools(speaker.permissions, {
      pending: context.pending ? (context.pending.type as CommandType) : null,
      canUndo: context.lastResult !== null,
    });
    const user = userMessage(utterance.text, modelContext);

    const started = performance.now();
    let result: Interpretation | { outcome: 'failed'; reason: string };
    try {
      result = validateReply(
        await interpreter.call({ system: SYSTEM_PROMPT, user, tools: offered.tools }),
        offered,
        utterance.text
      );
    } catch (error) {
      this.deps.log.warn({ err: error, provider: interpreter.provider }, 'interpreter call failed');
      result = { outcome: 'failed', reason: 'The interpreter did not answer.' };
    }
    const latencyMs = Math.round(performance.now() - started);

    const utteranceId = uuidv7();
    const interpretationId = uuidv7();
    const intent = result.outcome === 'intent' ? result : null;
    const control = result.outcome === 'control' ? result : null;
    let proposal: ResolvedProposal | null = intent
      ? await this.deps.proposals.resolve(speaker, intent.command, intent.entities)
      : null;

    await withClinic(this.deps.pool, speaker.clinicId, async (client) => {
      await client.query(
        `INSERT INTO voice.utterances (id, clinic_id, user_id, source, transcript, stt_confidence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          utteranceId,
          speaker.clinicId,
          speaker.userId,
          utterance.source,
          utterance.text,
          utterance.sttConfidence ?? null,
        ]
      );
      const entities = intent?.entities ?? control?.entities;
      const dropped = intent?.dropped ?? control?.dropped ?? [];
      await client.query(
        `INSERT INTO voice.interpretations
           (id, clinic_id, utterance_id, outcome, command_type, entities, confidence, reason,
            provider, model, prompt_version, prompt_fingerprint, context_version,
            context_snapshot, latency_ms, dropped, resolution)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          interpretationId,
          speaker.clinicId,
          utteranceId,
          result.outcome,
          intent?.command ?? null,
          entities && Object.keys(entities).length ? JSON.stringify(entities) : null,
          intent?.confidence ?? control?.confidence ?? null,
          'reason' in result ? result.reason : (control?.action ?? null),
          interpreter.provider,
          interpreter.model,
          PROMPT_VERSION,
          fingerprint(SYSTEM_PROMPT, offered.tools),
          context.version,
          JSON.stringify({
            ...modelContext,
            tools: [...offered.commands.values(), ...offered.controls.values()],
          }),
          latencyMs,
          dropped.length ? JSON.stringify(dropped) : null,
          proposal ? JSON.stringify(proposal) : null,
        ]
      );
    });

    let proposed = false;
    let controlResult: VoiceControlResult | null = null;
    if (intent && proposal) {
      proposed = (
        await this.deps.proposals.hold(
          speaker,
          {
            id: interpretationId,
            command: intent.command,
            entities: intent.entities,
            proposal,
            confidence: intent.confidence,
            sttConfidence: utterance.sttConfidence,
          },
          context.version
        )
      ).proposed;
    } else if (control) {
      const outcome = await this.act(speaker, context, control, utterance.sttConfidence);
      controlResult = outcome.control;
      proposal = outcome.proposal ?? null;
    }
    const pending = (await this.deps.context.get(speaker)).pending;

    // Timings and outcome only: never what was said (spec section M).
    this.deps.log.info(
      {
        voice: {
          interpretMs: latencyMs,
          outcome: result.outcome,
          command: intent?.command,
          control: control?.action,
          provider: interpreter.provider,
          model: interpreter.model,
          proposed,
        },
      },
      'utterance interpreted'
    );

    return {
      id: interpretationId,
      utteranceId,
      outcome: result.outcome,
      command: intent?.command ?? null,
      entities: intent?.entities ?? control?.entities ?? {},
      missing: intent?.missing ?? [],
      dropped: intent?.dropped ?? control?.dropped ?? [],
      confidence: intent?.confidence ?? control?.confidence ?? null,
      reason: 'reason' in result ? result.reason : null,
      provider: interpreter.provider,
      model: interpreter.model,
      promptVersion: PROMPT_VERSION,
      contextVersion: context.version,
      proposed,
      proposal,
      risk: pending?.risk ?? null,
      control: controlResult,
      pending,
    };
  }

  /** Carries out "yes", "no", a correction or "undo" said to the pending proposal (V6). */
  private async act(
    speaker: Speaker,
    context: VoiceContext,
    control: Extract<Interpretation, { outcome: 'control' }>,
    sttConfidence: number | undefined
  ): Promise<{ control: VoiceControlResult; proposal?: ResolvedProposal }> {
    const { action } = control;
    const failed = (error: unknown): { control: VoiceControlResult } => {
      if (error instanceof HttpProblem)
        return { control: { action, ok: false, message: error.title } };
      throw error;
    };
    const pending = context.pending;
    try {
      if (action === 'undo') {
        const held = await this.deps.proposals.undo(speaker);
        return {
          control: { action, ok: true, message: 'Undo is waiting for confirmation.' },
          proposal: held.proposal,
        };
      }
      if (!pending) {
        return { control: { action, ok: false, message: 'Nothing is waiting for confirmation.' } };
      }
      if (action === 'confirm') {
        const done = await this.deps.proposals.confirm(
          { userId: speaker.userId, clinicId: speaker.clinicId, permissions: speaker.permissions },
          pending.id,
          context.version,
          'voice'
        );
        return { control: { action, ok: true, message: 'Done.', commandId: done.commandId } };
      }
      if (action === 'cancel') {
        await this.deps.proposals.cancel(speaker, pending.id);
        return { control: { action, ok: true, message: 'Cancelled.' } };
      }
      const corrected = await this.deps.proposals.correct(
        speaker,
        pending.id,
        context.version,
        control.entities,
        { confidence: control.confidence, sttConfidence }
      );
      return {
        control: { action, ok: true, message: 'Changed; waiting for confirmation.' },
        proposal: corrected.proposal,
      };
    } catch (error) {
      return failed(error);
    }
  }

  /** The situation, as the model is told it: states and names of things, never people. */
  private async describe(
    speaker: ContextKey,
    context: Awaited<ReturnType<VoiceContextService['get']>>
  ): Promise<ModelContext> {
    let session: ModelContext['session'] = 'none';
    let procedureInProgress: string | null = null;
    if (context.sessionId) {
      await withClinic(this.deps.pool, speaker.clinicId, async (client) => {
        const found = await client.query<{ status: ModelContext['session'] }>(
          'SELECT status FROM clinical.clinical_sessions WHERE id = $1',
          [context.sessionId]
        );
        session = found.rows[0]?.status ?? 'none';
        const procedure = await client.query<{ name: string; tooth: string | null }>(
          `SELECT t.name, p.tooth FROM clinical.procedures AS p
           JOIN catalog.procedure_types AS t ON t.id = p.procedure_type_id
           WHERE p.session_id = $1 AND p.status = 'in_progress'
           ORDER BY p.started_at DESC LIMIT 1`,
          [context.sessionId]
        );
        const row = procedure.rows[0];
        procedureInProgress = row ? `${row.name}${row.tooth ? ` on ${row.tooth}` : ''}` : null;
      });
    }
    return {
      patientOpen: context.patientId !== null,
      session,
      toothInFocus: context.tooth,
      procedureInProgress,
      pending: context.pending
        ? { command: context.pending.type, missing: context.pending.missing }
        : null,
    };
  }
}

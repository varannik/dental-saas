import { randomUUID } from 'node:crypto';
import { resolveProcedure, type CatalogProcedure } from './catalog.js';
import { parseTooth, type ToothNotation } from './tooth.js';
import type { InterpretContext, RawIntent } from './types.js';

/** Stages 5 to 8 of spec section H: resolve, validate, apply risk policy, build the proposal. */

export type RiskTier = 'R0' | 'R1' | 'R2' | 'R3';

export interface ProposalField {
  key: string;
  label: string;
  value: string | null;
  /** What the clinician said, or "context" when the value came from focus. */
  resolvedFrom: string | null;
  alternatives: string[];
}

export interface ProposedCommand {
  id: string;
  type: 'procedure.add';
  source: 'voice';
  payload: { procedureTypeId: string | null; tooth: string | null };
  display: { summary: string; fields: ProposalField[] };
  interpretation: {
    transcript: string;
    intentConfidence: number;
    sttConfidence: number;
    model: string;
    promptVersion: number;
  };
  risk: { tier: RiskTier; confirmation: 'explicit' | 'click'; reasons: string[] };
  missing: string[];
  /** Spoken or shown when a field is missing. */
  question: string | null;
  expiresAt: string;
}

export type InterpretResult =
  { kind: 'proposal'; command: ProposedCommand } | { kind: 'no_command'; reason: string };

export interface ProposalPolicy {
  intentConfidenceThreshold: number;
  sttConfidenceThreshold: number;
  proposalTtlMs: number;
}

export const DEFAULT_POLICY: ProposalPolicy = {
  intentConfidenceThreshold: 0.7,
  sttConfidenceThreshold: 0.6,
  proposalTtlMs: 60_000,
};

export interface BuildProposalInput {
  intent: RawIntent;
  transcript: string;
  sttConfidence: number;
  context: InterpretContext;
  catalog: readonly CatalogProcedure[];
  notation: ToothNotation;
  model: string;
  promptVersion: number;
  policy?: ProposalPolicy;
  now?: Date;
}

const TIERS: RiskTier[] = ['R0', 'R1', 'R2', 'R3'];

function raise(tier: RiskTier): RiskTier {
  return TIERS[Math.min(TIERS.indexOf(tier) + 1, TIERS.length - 1)]!;
}

export function buildProposal(input: BuildProposalInput): InterpretResult {
  const { intent, catalog, notation, context } = input;
  const policy = input.policy ?? DEFAULT_POLICY;
  if (intent.intent === 'none') return { kind: 'no_command', reason: intent.reason };

  const procedure = resolveProcedure(intent.procedure, catalog);
  if (procedure.status === 'unknown') {
    return {
      kind: 'no_command',
      reason: `No procedure in the catalog matches "${intent.procedure}".`,
    };
  }
  const { match, alternatives } = procedure;

  let tooth: string | null = null;
  let toothFrom: string | null = null;
  if (intent.tooth) {
    tooth = parseTooth(intent.tooth, notation);
    toothFrom = intent.tooth;
  } else if (context.activeTooth && match.procedure.requiresTooth) {
    tooth = parseTooth(context.activeTooth, notation);
    toothFrom = tooth ? 'context' : null;
  }

  const missing: string[] = [];
  let question: string | null = null;
  if (match.procedure.requiresTooth && !tooth) {
    missing.push('tooth');
    question = intent.tooth
      ? `"${intent.tooth}" is not a valid tooth. Which tooth?`
      : 'Which tooth?';
  }

  const reasons = ['clinical_write'];
  let tier: RiskTier = 'R2';
  if (intent.confidence < policy.intentConfidenceThreshold) reasons.push('low_intent_confidence');
  if (input.sttConfidence < policy.sttConfidenceThreshold) reasons.push('low_stt_confidence');
  if (alternatives.length > 0) reasons.push('ambiguous_entity');
  // Any tier is raised one step when confidence is low or an entity is ambiguous (spec section H).
  if (reasons.length > 1) tier = raise(tier);

  const summary = tooth
    ? `Add ${match.procedure.name.toLowerCase()} to tooth ${tooth}`
    : `Add ${match.procedure.name.toLowerCase()}`;
  const now = input.now ?? new Date();

  return {
    kind: 'proposal',
    command: {
      id: randomUUID(),
      type: 'procedure.add',
      source: 'voice',
      payload: { procedureTypeId: match.procedure.id, tooth },
      display: {
        summary,
        fields: [
          {
            key: 'procedureTypeId',
            label: 'Treatment',
            value: match.procedure.name,
            resolvedFrom: intent.procedure,
            alternatives: alternatives.map((alternative) => alternative.name),
          },
          {
            key: 'tooth',
            label: 'Tooth',
            value: tooth,
            resolvedFrom: toothFrom,
            alternatives: [],
          },
        ],
      },
      interpretation: {
        transcript: input.transcript,
        intentConfidence: intent.confidence,
        sttConfidence: input.sttConfidence,
        model: input.model,
        promptVersion: input.promptVersion,
      },
      risk: { tier, confirmation: tier === 'R3' ? 'click' : 'explicit', reasons },
      missing,
      question,
      expiresAt: new Date(now.getTime() + policy.proposalTtlMs).toISOString(),
    },
  };
}

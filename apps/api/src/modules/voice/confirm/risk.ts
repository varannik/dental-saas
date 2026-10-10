import {
  COMMANDS,
  type CommandType,
  type ProposalRisk,
  type ResolvedProposal,
} from '@dental/contracts';

/**
 * How a proposal must be confirmed (V6, spec section H, confirmation policy). The tier starts
 * from the command's risk in the registry and is raised one step when the command was not
 * clearly understood, the speech was not clearly heard, or a value is outside its usual range.
 * R2 takes a spoken yes or a click; R3, raised or not, takes a click on screen.
 */

export const THRESHOLDS = {
  /** Below this, the interpreter was not sure the command was meant. */
  intentConfidence: 0.75,
  /** Below this, speech recognition was not sure of the words. */
  sttConfidence: 0.8,
  /** A pocket deeper than this is unusual enough to look at twice. */
  pocketDepthMm: 9,
};

const RAISE: Record<ProposalRisk['tier'], ProposalRisk['tier']> = {
  R0: 'R1',
  R1: 'R2',
  R2: 'R3',
  R3: 'R3',
};

export function assessRisk(input: {
  command: CommandType;
  proposal: ResolvedProposal;
  /** The interpreter's confidence; 1 for words typed on the card. */
  confidence: number;
  /** From speech recognition; absent for typed text. */
  sttConfidence?: number;
}): ProposalRisk {
  const base = COMMANDS[input.command].risk;
  const reasons: string[] = [];
  if (input.confidence < THRESHOLDS.intentConfidence) {
    reasons.push('The command was not clearly understood.');
  }
  if (input.sttConfidence !== undefined && input.sttConfidence < THRESHOLDS.sttConfidence) {
    reasons.push('The words were not clearly heard.');
  }
  const measurements = input.proposal.payload.measurements;
  if (
    Array.isArray(measurements) &&
    measurements.some(
      (m: { pocketDepth?: number }) => (m.pocketDepth ?? 0) > THRESHOLDS.pocketDepthMm
    )
  ) {
    reasons.push(`A pocket deeper than ${THRESHOLDS.pocketDepthMm} mm is unusual.`);
  }
  const tier = reasons.length ? RAISE[base] : base;
  return { base, tier, confirmation: tier === 'R3' ? 'click' : 'voice_or_click', reasons };
}

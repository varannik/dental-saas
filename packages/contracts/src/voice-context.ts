/**
 * The conversation context of voice (V3, spec section H): what the clinician is working on,
 * so "add a crown afterward" knows the patient, the session and the tooth. It mirrors what is
 * on screen and lives in Valkey with a time-to-live, so a restart loses at most an unconfirmed
 * proposal.
 *
 * The focus is a stack: patient, then session, then procedure, then tooth. Each level belongs
 * to the one above, so a change at one level clears everything below it. Focus never crosses
 * patients: changing patient clears the stack and discards the pending proposal.
 */

export interface VoiceFocus {
  patientId: string | null;
  sessionId: string | null;
  procedureId: string | null;
  tooth: string | null;
}

import type { ResolvedProposal } from './voice.js';

/**
 * How a proposal must be confirmed (V6, spec section H). The tier starts from the command's
 * risk in the registry and is raised one step for low confidence or an uncertain match. R2 is
 * confirmed by a spoken yes or a click; R3 only by a click on screen.
 */
export interface ProposalRisk {
  /** The command's risk in the registry. */
  base: 'R0' | 'R1' | 'R2' | 'R3';
  /** After raising. */
  tier: 'R0' | 'R1' | 'R2' | 'R3';
  confirmation: 'voice_or_click' | 'click';
  /** Why the tier was raised, in words for the clinician. */
  reasons: string[];
}

/** A command interpreted from speech and waiting for confirmation or missing slots (V4, V6). */
export interface PendingProposal {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  /** The entities as spoken, so a correction can be resolved again (V6). */
  entities?: Record<string, string>;
  /** The resolved proposal and how it must be confirmed (V5, V6). */
  proposal?: ResolvedProposal;
  risk?: ProposalRisk;
  /** Slots still to fill, such as "tooth" after "add a root canal". */
  missing: string[];
  /** The context version it was made under; a confirmation under another fails. */
  contextVersion: number;
  createdAt: string;
  expiresAt: string;
}

export interface VoiceContext extends VoiceFocus {
  /** Changes when the patient or the session changes, and only then. */
  version: number;
  pending: PendingProposal | null;
  lastResult: { commandId: string; type: string; at: string } | null;
  /** The last list shown, for "the second one". */
  lastListed: { kind: string; ids: string[] } | null;
  updatedAt: string;
}

/** PUT /v1/voice/context/focus: what is on screen now. Omitted levels are cleared. */
export interface VoiceFocusUpdate {
  patientId: string | null;
  sessionId?: string | null;
  procedureId?: string | null;
  tooth?: string | null;
}

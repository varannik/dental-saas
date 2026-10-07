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

/** A command interpreted from speech and waiting for confirmation or missing slots (V4, V6). */
export interface PendingProposal {
  id: string;
  type: string;
  payload: Record<string, unknown>;
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

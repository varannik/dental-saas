# ADR 0008: Risk and confirmation

- Status: Accepted
- Date: 2026-10-10
- Work package: V6 risk and confirmation (implementation plan, milestone V)

## Context

From V6, a spoken command can change the record. The specification's confirmation policy (section H): R2 clinical writes need an explicit confirmation by voice or click; R3 irreversible actions need a click on screen; any tier is raised one step for low confidence, an uncertain match or an unusual value. The acceptance check: no R2 or R3 command executes without confirmation, in any test.

## Decision

1. **One way in.** A proposal reaches the command bus only through `ProposalService.confirm`. It takes the pending proposal atomically, and only if it is the one the clinician saw, under the context version they saw, not expired, ready, and confirmed the way its tier requires. Anything but an expired proposal stays pending, so a refused "yes" can still be clicked, corrected or cancelled.
2. **The bus checks again.** A command with source `voice` is refused unless it carries a confirmation, and an R3 command unless that confirmation was a click. This holds even for code that bypasses the proposal service. Each voice command records the interpretation it confirmed (`voice.commands.interpretation_id`), so every change traces back to the words.
3. **Risk.** The tier starts from the registry and is raised one step when the interpreter's confidence is below 0.75, speech recognition's below 0.8, or a pocket is deeper than 9 mm. R2 raised becomes R3, which means click only, and the reasons are shown. Thresholds are constants for now, to be tuned on real use (Phase 3).
4. **A spoken yes is a tool, not a keyword.** When something is waiting, the interpreter is also offered `confirm_pending`, `cancel_pending`, `correct_pending` (with the pending command's entities, still subject to grounding) and `undo_last`. "No, tooth twenty six" is a correction. A clear new command is a new command, not a correction.
5. **A correction is a new proposal.** Corrections, spoken or typed on the card, are resolved again and held under a new id. The old proposal can no longer be confirmed, so a click on a stale card cannot run what was corrected away.
6. **Undo is proposed, not done.** "Undo" proposes the inverse of the last command confirmed by voice in the session: a diagnosis retracted or rejected, a procedure cancelled, a plan item cancelled, a history entry ended as entered in error. Nothing is deleted. The inverse is confirmed like any write. Findings, probing, notes, completing and signing have no safe inverse and are refused with a message to correct them on screen.
7. **Idempotent.** A confirmation runs under the key `voice-proposal:<id>`; a retry gets the same answer and runs nothing twice.
8. **Expiry.** A proposal lapses two minutes after it was made, and an expired one is no longer returned by the context.

## Consequences

- V7 builds the full proposal card on this: large touch targets, spoken replies, and the activity rail's Undo.
- The voice bar has Confirm, Edit and Cancel, says whether a spoken yes is enough, and counts down to expiry. Screens refresh when a voice command runs.

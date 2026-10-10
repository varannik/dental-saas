# ADR 0007: Resolvers

- Status: Accepted
- Date: 2026-10-10
- Work package: V5 resolvers (implementation plan, milestone V)

## Context

The interpreter (V4, ADR 0006) returns a command and its entities as spoken. V5 turns those words into the command's payload in code (spec section H, stage 5): patient search, tooth notation, catalog aliases, numbers and units. Its acceptance check is that "tooth sixteen" resolves by the clinic's notation.

## Decision

1. **Records keep FDI; speech follows the clinic.** `clinics.tooth_notation` decides how a spoken number is read. In an FDI clinic "sixteen" is FDI 16; in a Universal clinic it is Universal 16, the upper left third molar, stored as FDI 28 and shown back as 16. A description ("upper right first molar") means the same tooth in every notation, which is also how Palmer is spoken. `universalToFdi` and `fdiToUniversal` live in the contracts, for the chart to use later.
2. **The settings screen stays FDI-only for now.** The database already allows Universal and Palmer, but the chart and lists still display FDI numbers. Letting a clinic switch would show one notation while the voice listens in another. Opening the setting waits until the chart displays the clinic's notation.
3. **Context is used openly.** What the clinician did not say but the screen makes clear is filled in and marked `resolvedFrom: "context"`: the session, the patient, the tooth in focus, the procedure in progress, the open plan. The model may not do this (ADR 0006); the resolver does, visibly. A diagnosis does not take the tooth in focus, because many diagnoses are for the whole mouth.
4. **The plan comes first.** "Start the root canal" starts the matching planned item, so the plan is updated when it is done. Only without a matching planned item does it start a catalog procedure.
5. **A shared name is settled by the tooth; a real ambiguity is asked.** "Root canal" names three catalog procedures; the tooth's class (anterior, premolar, molar) chooses. "Filling" could be composite or amalgam, and that is returned as alternatives, never guessed.
6. **Positions in the plan.** "Afterward" places an item after the last planned item on the same tooth, or else after the last item. "After the X" and "before the X" find X in the plan. An item cannot yet be placed first.
7. **Probing.** A site named before a depth applies to it ("distolingual six"); three bare depths fill the buccal sites, six fill all six, in chart order. Anything else is a problem to repeat, not a guess.
8. **Ready means ready.** A proposal is ready only when nothing is missing, nothing is ambiguous, nothing stands in the way, and the payload passes the command's own schema. Problems are written for the clinician ("Tooth 11 has no O surface.", "No session is open.").
9. **Patients.** `resolvePatient` searches by spoken name with the same spelling and sound matching as typed search, and takes "the second one" or "number two" from the last list shown. One clear match is returned only when it leads the next by a margin; otherwise a numbered list. No voice command opens a patient yet. The resolver is wired when navigation intents arrive (V7, V8), where opening a patient is risk R1 and always confirmed with a second identifier.

## Consequences

- The pending proposal now holds the resolved payload, and each interpretation records its resolution (`voice.interpretations.resolution`).
- V6 adds risk tiers, confirmation, expiry and undo on top of a ready proposal. V7 shows it as the proposal card. Until then the voice bar lists the resolved fields, with context fields marked "from screen".

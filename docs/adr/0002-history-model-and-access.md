# ADR 0002: One history table, and history needs a clinical permission

- Status: Accepted
- Date: 2026-10-06
- Work package: C2 medical and dental history

## Context

Spec section F lists four tables for a patient's history: `patient_conditions`, `patient_medications`, `patient_allergies` and `patient_risk_factors`, each with a code, description, onset, status and author, and each "ended, not overwritten". Section G gives `GET /patients/{id}/history` the permission `patient.read`. Section I says receptionists have patient search and demographics but "no clinical content", and receptionists hold `patient.read`.

## Decision

1. **One table, `clinical.history_entries`, with a `kind` column** (`condition`, `medication`, `allergy`, `risk_factor`). The four kinds share every column and the same lifecycle; the kind-specific parts are small: `severity` for allergies (enforced by a check constraint) and a free `detail` for dose, frequency or reaction. One table means one trigger enforcing "ended, not overwritten", one RLS policy, one query for the grouped view and one pair of commands (`history.add`, `history.end`). The API still returns the four groups the spec describes.
2. **Reading history requires `patient.read` and `session.read`.** This keeps the spec's "no clinical content" promise for receptionists: they can find and register patients but not see allergies, medications or conditions. Dentists and assistants hold both permissions. Writing requires `history.write`, which dentists hold.
3. **Ending is the only change.** An entry is ended as `resolved`, `stopped` or `entered_in_error`, with a time, the user and an optional note. A trigger rejects any other update and every delete, for all roles.

## Consequences

- Kind-specific fields that grow later (for example a medication's structured dose) go into new nullable columns or a typed JSON column, guarded by check constraints per kind.
- A role that needs allergies without clinical sessions, for example a receptionist checking before booking, would need a new permission; none does today.
- "No known allergies" is not yet recorded as a fact distinct from "nothing recorded". It needs its own design, likely a reviewed-at marker per kind.

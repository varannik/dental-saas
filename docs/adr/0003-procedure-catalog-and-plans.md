# ADR 0003: Our own procedure codes, and one open plan per patient

- Status: Accepted
- Date: 2026-10-07
- Work package: C5 treatment planning

## Context

Spec section D says to keep the old repository's procedure catalog and "CDT seed", and section P task 15 says procedure types are "seeded from the CDT list". CDT (Current Dental Terminology) is copyrighted by the American Dental Association and needs a licence to use or distribute; the old seed is no longer in the repository. The platform also serves clinics outside the United States, which use other systems or none.

Section H's voice example ("add a crown afterward") adds to "the plan" without naming one.

## Decision

1. **The catalog ships with generic procedures under language-neutral codes** such as `root_canal_molar` or `composite_filling`, 26 in total, each with a category, a scope (tooth, surfaces or whole mouth), whether it can be planned on a missing tooth (implants, pontics, dentures), and spoken aliases for voice. An optional `external_code` column holds a clinic's licensed code (CDT, a national fee schedule or other) once the clinic maps one. System entries have no clinic and are visible to all; clinic-specific procedures arrive with the catalog module (M1).
2. **At most one open plan (proposed or accepted) per patient**, enforced by a partial unique index. Voice and quick GUI actions add to that plan; alternative plans would need a separate design.
3. **One sequence across all items of a plan.** Reordering sends the full list of item ids in the new order with the plan's version; the uniqueness of (plan, sequence) is checked at commit so positions can be swapped in one transaction, and every item change bumps the plan's version so a reorder from a stale view is refused.

## Consequences

- No CDT text or codes are distributed with the platform. A clinic that holds a CDT licence maps its codes in `external_code`.
- Procedure names are English for now; per-locale names move to `procedure_type_translations` with the catalog module.
- A second, alternative plan for the same patient is not possible until it is designed; cancelling the open plan and creating a new one is the workaround.

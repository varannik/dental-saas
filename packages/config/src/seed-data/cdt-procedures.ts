/**
 * Illustrative CDT-style procedure codes for local/dev seeding.
 *
 * Current Dental Terminology (CDT) is published by the ADA. This file contains
 * only a small, non-exhaustive subset for bootstrapping UI and APIs — not a
 * licensed or complete code set. Replace or extend via your own data pipeline
 * for production.
 */
export const CDT_SYSTEM_KEY = 'ADA_CDT' as const;

/** Logical snapshot label for idempotent seeding (not a claim of full CDT revision coverage). */
export const CDT_SEED_VERSION = 'seed-v1' as const;

export interface CdtProcedureSeedRow {
  readonly code: string;
  readonly display: string;
  readonly description: string;
  readonly category: string;
  readonly isBillable: boolean;
  readonly procedureType: string;
  readonly defaultDurationMin: number | null;
  readonly requiresTooth: boolean;
  readonly requiresSurface: boolean;
}

export const CDT_PROCEDURE_SEED_ROWS: readonly CdtProcedureSeedRow[] = [
  {
    code: 'D0120',
    display: 'Periodic oral evaluation — established patient',
    description: 'Periodic oral evaluation for an established patient.',
    category: 'Diagnostic',
    isBillable: true,
    procedureType: 'DIAGNOSTIC',
    defaultDurationMin: 15,
    requiresTooth: false,
    requiresSurface: false,
  },
  {
    code: 'D0150',
    display: 'Comprehensive oral evaluation — new or established patient',
    description: 'Comprehensive oral evaluation for a new or established patient.',
    category: 'Diagnostic',
    isBillable: true,
    procedureType: 'DIAGNOSTIC',
    defaultDurationMin: 30,
    requiresTooth: false,
    requiresSurface: false,
  },
  {
    code: 'D0220',
    display: 'Intraoral — periapical first radiographic image',
    description: 'First intraoral periapical radiographic image.',
    category: 'Diagnostic',
    isBillable: true,
    procedureType: 'DIAGNOSTIC',
    defaultDurationMin: 10,
    requiresTooth: true,
    requiresSurface: false,
  },
  {
    code: 'D1110',
    display: 'Adult prophylaxis',
    description: 'Prophylaxis — adult.',
    category: 'Preventive',
    isBillable: true,
    procedureType: 'PREVENTIVE',
    defaultDurationMin: 45,
    requiresTooth: false,
    requiresSurface: false,
  },
  {
    code: 'D1208',
    display: 'Topical application of fluoride — excluding varnish',
    description: 'Topical fluoride excluding varnish application.',
    category: 'Preventive',
    isBillable: true,
    procedureType: 'PREVENTIVE',
    defaultDurationMin: 10,
    requiresTooth: false,
    requiresSurface: false,
  },
  {
    code: 'D2391',
    display: 'Resin-based composite — one surface, posterior',
    description: 'Resin-based composite restoration — one surface, posterior.',
    category: 'Restorative',
    isBillable: true,
    procedureType: 'RESTORATIVE',
    defaultDurationMin: 45,
    requiresTooth: true,
    requiresSurface: true,
  },
  {
    code: 'D2740',
    display: 'Crown — porcelain/ceramic substrate',
    description: 'Single crown — porcelain/ceramic substrate.',
    category: 'Restorative',
    isBillable: true,
    procedureType: 'RESTORATIVE',
    defaultDurationMin: 90,
    requiresTooth: true,
    requiresSurface: false,
  },
  {
    code: 'D7210',
    display: 'Extraction, erupted tooth — removal of bone and/or sectioning',
    description: 'Removal of erupted tooth requiring removal of bone and/or tooth sectioning.',
    category: 'Oral Surgery',
    isBillable: true,
    procedureType: 'ORAL_SURGERY',
    defaultDurationMin: 45,
    requiresTooth: true,
    requiresSurface: false,
  },
] as const;

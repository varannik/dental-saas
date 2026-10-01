/** PostgreSQL schemas owned by the platform. Clinical data never shares a schema with research data. */
export const POSTGRES_SCHEMAS = [
  'core',
  'clinical',
  'catalog',
  'voice',
  'audit',
  'kb',
  'qa',
  'lab',
] as const;

export type PostgresSchema = (typeof POSTGRES_SCHEMAS)[number];

export const CLINICAL_SCHEMAS = ['core', 'clinical', 'catalog', 'voice', 'audit'] as const;
export const RESEARCH_SCHEMAS = ['kb', 'qa', 'lab'] as const;

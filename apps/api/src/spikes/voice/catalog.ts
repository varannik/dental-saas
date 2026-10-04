import type { CatalogProcedure } from '../../modules/voice/catalog.js';

/** Fixed procedure list for the voice spike (F7). Replaced by the catalog module in M1. */
export const SPIKE_CATALOG: readonly CatalogProcedure[] = [
  {
    id: 'spike-root-canal',
    name: 'Root canal treatment',
    aliases: ['root canal', 'root canal therapy', 'endodontic treatment', 'endo', 'rct'],
    requiresTooth: true,
  },
  { id: 'spike-crown', name: 'Crown', aliases: ['crown', 'cap'], requiresTooth: true },
  {
    id: 'spike-composite',
    name: 'Composite filling',
    aliases: ['composite', 'white filling', 'filling'],
    requiresTooth: true,
  },
  {
    id: 'spike-amalgam',
    name: 'Amalgam filling',
    aliases: ['amalgam', 'silver filling', 'filling'],
    requiresTooth: true,
  },
  {
    id: 'spike-extraction',
    name: 'Extraction',
    aliases: ['extraction', 'extract', 'pull'],
    requiresTooth: true,
  },
  {
    id: 'spike-implant',
    name: 'Implant placement',
    aliases: ['implant'],
    requiresTooth: true,
  },
  {
    id: 'spike-scaling',
    name: 'Scaling and polishing',
    aliases: ['scaling', 'scale and polish', 'cleaning'],
    requiresTooth: false,
  },
];

/** Words that bias speech recognition towards the catalog. */
export const SPIKE_KEYTERMS = [
  'root canal',
  'crown',
  'composite',
  'amalgam',
  'extraction',
  'implant',
  'scaling',
  'molar',
  'premolar',
  'incisor',
  'canine',
];

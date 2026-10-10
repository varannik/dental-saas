import type { CommandType } from './commands.js';

/**
 * The commands a clinician can give by voice (V4, spec section H), and the entities to listen
 * for in each. The model returns entities as spoken ("sixteen", "the root canal", "mesial and
 * occlusal"); ids, tooth codes and rules are resolved in code (V5). Name, description,
 * permission and risk come from the command registry, so voice and clicks cannot drift apart.
 */

export interface VoiceEntity {
  /** What to extract, for the model. */
  description: string;
  /** The command cannot run without it; when not said, the proposal asks for it. */
  required?: boolean;
  /**
   * Chosen from a short list rather than copied from the words, such as "allergy" for
   * "allergic to". Every other entity must be found in what was said, or it is dropped.
   */
  classification?: boolean;
}

export interface VoiceCommandSpec {
  /** When this command is meant, for the model. */
  when: string;
  entities: Record<string, VoiceEntity>;
  /** Not offered to someone who can use this command instead. */
  supersededBy?: CommandType;
}

const tooth: VoiceEntity = {
  description:
    'The tooth exactly as spoken, such as "16", "sixteen", "one six" or "upper right first molar". Omit when no tooth is said; never take it from context.',
};

export const VOICE_COMMANDS: Partial<Record<CommandType, VoiceCommandSpec>> = {
  'session.start': {
    when: 'Start or open a session (visit) for the patient on screen.',
    entities: {
      chiefComplaint: { description: 'Why the patient came, if said, such as "pain upper right".' },
    },
  },
  'session.complete': {
    when: 'Finish, end or complete the session in progress.',
    entities: {},
  },
  'finding.add': {
    when: 'Record what is seen on a tooth: caries, a restoration, a fracture, missing, a crown, root canal treated, an implant, impacted, mobility, sound, or a tooth to watch.',
    entities: {
      tooth: { ...tooth, required: true },
      finding: {
        description: 'The finding as spoken, such as "caries" or "fracture".',
        required: true,
      },
      surfaces: { description: 'The surfaces as spoken, such as "mesial and occlusal" or "MO".' },
      detail: { description: 'A detail such as "composite" or "grade 2", if said.' },
    },
  },
  'perio.record': {
    when: 'Record periodontal probing: pocket depths in millimetres and bleeding.',
    entities: {
      tooth: { ...tooth, required: true },
      readings: {
        description:
          'The depths and sites as spoken, such as "three two four" or "distolingual six".',
        required: true,
      },
      bleeding: { description: 'Where bleeding was said, such as "mesiobuccal" or "all".' },
    },
  },
  'note.add': {
    when: 'Add or dictate a clinical note.',
    entities: { body: { description: 'The note text, as dictated.', required: true } },
  },
  'diagnosis.suggest': {
    when: 'Suggest a diagnosis for the dentist to confirm.',
    entities: {
      diagnosis: {
        description: 'The diagnosis as spoken, such as "irreversible pulpitis".',
        required: true,
      },
      tooth,
    },
    supersededBy: 'diagnosis.record',
  },
  'diagnosis.record': {
    when: 'Record a diagnosis.',
    entities: {
      diagnosis: {
        description: 'The diagnosis as spoken, such as "irreversible pulpitis".',
        required: true,
      },
      tooth,
    },
  },
  'plan_item.add': {
    when: 'Add a treatment to the treatment plan, for later.',
    entities: {
      procedure: {
        description: 'The treatment as spoken, such as "crown" or "root canal".',
        required: true,
      },
      tooth,
      surfaces: { description: 'The surfaces as spoken, if said.' },
      position: {
        description: 'Where in the plan, if said, such as "afterward" or "before the filling".',
      },
    },
  },
  'procedure.start': {
    when: 'Start doing a treatment now, in this session.',
    entities: {
      procedure: {
        description: 'The treatment as spoken, such as "the root canal".',
        required: true,
      },
      tooth,
      surfaces: { description: 'The surfaces as spoken, if said.' },
    },
  },
  'procedure.complete': {
    when: 'Finish or complete the treatment being done.',
    entities: {
      procedure: { description: 'Which treatment, if said; otherwise the one in progress.' },
    },
  },
  'procedure.cancel': {
    when: 'Stop or cancel the treatment being done.',
    entities: {
      procedure: { description: 'Which treatment, if said; otherwise the one in progress.' },
      reason: { description: 'Why, if said.' },
    },
  },
  'history.add': {
    when: "Add to the patient's medical history: a condition, a medication, an allergy or a risk factor.",
    entities: {
      kind: {
        description: 'One of condition, medication, allergy or risk factor.',
        required: true,
        classification: true,
      },
      name: { description: 'What it is, such as "penicillin" or "diabetes".', required: true },
      severity: { description: 'For an allergy, how severe, if said.' },
    },
  },
  'session.sign': {
    when: 'Sign the session. It is prepared by voice and signed by a click on screen.',
    entities: {},
  },
};

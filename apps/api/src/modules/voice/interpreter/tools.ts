import { createHash } from 'node:crypto';
import { COMMANDS, VOICE_COMMANDS, type CommandType } from '@dental/contracts';
import type { ToolSpec } from '../interpreter-spec.js';

/**
 * Tools for the interpreter, generated from the command registry (V4). Each voice command the
 * clinician may run becomes one tool whose parameters are the entities to listen for, all as
 * spoken text, plus a confidence. Nothing the clinician may not do is ever offered.
 */

export const NO_COMMAND = 'no_command';
/** Longest entity value accepted; anything longer is not a spoken entity. */
export const MAX_ENTITY_LENGTH = 300;
/** Longest dictated note. */
export const MAX_NOTE_LENGTH = 1_000;

/** "plan_item.add" → "plan_item__add": reversible, and valid for every provider. */
export const toolName = (type: CommandType) => type.replace('.', '__');

export type ControlAction = 'confirm' | 'cancel' | 'correct' | 'undo';

/** Tools for the pending proposal (V6), offered only when there is one, or something to undo. */
export const CONTROL_TOOLS: Record<ControlAction, string> = {
  confirm: 'confirm_pending',
  cancel: 'cancel_pending',
  correct: 'correct_pending',
  undo: 'undo_last',
};

export interface ToolSet {
  tools: ToolSpec[];
  /** Tool name to the command it stands for; only these are accepted back. */
  commands: Map<string, CommandType>;
  /** Tool name to the control it stands for. */
  controls: Map<string, ControlAction>;
  /** The command a correction applies to: the pending one. */
  correcting: CommandType | null;
}

const confidence = {
  type: 'number',
  description: 'How sure you are, from 0 to 1, that this was meant.',
};

function controlTools(pending: CommandType | null, canUndo: boolean) {
  const tools: ToolSpec[] = [];
  const controls = new Map<string, ControlAction>();
  const plain = (action: ControlAction, description: string) => {
    tools.push({
      name: CONTROL_TOOLS[action],
      description,
      parameters: {
        type: 'object',
        properties: { confidence },
        required: ['confidence'],
        additionalProperties: false,
      },
    });
    controls.set(CONTROL_TOOLS[action], action);
  };
  if (pending) {
    plain(
      'confirm',
      'The clinician agrees to what is waiting for confirmation: "yes", "confirm", "do it", "correct".'
    );
    plain(
      'cancel',
      'The clinician rejects what is waiting for confirmation: "no", "cancel", "forget it".'
    );
    const properties: ToolSpec['parameters']['properties'] = {};
    for (const [entity, definition] of Object.entries(VOICE_COMMANDS[pending]?.entities ?? {})) {
      properties[entity] = { type: 'string', description: definition.description };
    }
    properties.confidence = confidence;
    tools.push({
      name: CONTROL_TOOLS.correct,
      description:
        'The clinician changes or adds a detail of what is waiting for confirmation, such as "no, tooth 26" or "and the distal". Fill only what changed.',
      parameters: {
        type: 'object',
        properties,
        required: ['confidence'],
        additionalProperties: false,
      },
    });
    controls.set(CONTROL_TOOLS.correct, 'correct');
  }
  if (canUndo)
    plain(
      'undo',
      'The clinician wants to undo the last command they confirmed: "undo", "undo that".'
    );
  return { tools, controls };
}

export function buildTools(
  permissions: readonly string[],
  state: { pending: CommandType | null; canUndo: boolean } = { pending: null, canUndo: false }
): ToolSet {
  const allowed = (type: CommandType) => permissions.includes(COMMANDS[type].permission);
  const tools: ToolSpec[] = [];
  const commands = new Map<string, CommandType>();
  for (const [type, spec] of Object.entries(VOICE_COMMANDS) as [
    CommandType,
    NonNullable<(typeof VOICE_COMMANDS)[CommandType]>,
  ][]) {
    if (!allowed(type)) continue;
    if (spec.supersededBy && allowed(spec.supersededBy)) continue;
    const name = toolName(type);
    const properties: ToolSpec['parameters']['properties'] = {};
    for (const [entity, definition] of Object.entries(spec.entities)) {
      properties[entity] = { type: 'string', description: definition.description };
    }
    properties.confidence = {
      type: 'number',
      description: 'How sure you are, from 0 to 1, that this command was meant.',
    };
    tools.push({
      name,
      description: `${COMMANDS[type].description} Use when: ${spec.when}`,
      parameters: {
        type: 'object',
        properties,
        // Only the confidence is required from the model: a required entity left unsaid
        // becomes a question to the clinician, not a guess.
        required: ['confidence'],
        additionalProperties: false,
      },
    });
    commands.set(name, type);
  }
  tools.push({
    name: NO_COMMAND,
    description:
      'The speech is not one of the commands: a question, conversation with the patient, or unclear or partial speech.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'A short reason.' } },
      required: ['reason'],
      additionalProperties: false,
    },
  });
  const control = controlTools(state.pending, state.canUndo);
  tools.push(...control.tools);
  return { tools, commands, controls: control.controls, correcting: state.pending };
}

/** Identifies the exact prompt and tools sent, for the interpretation record. */
export function fingerprint(system: string, tools: readonly ToolSpec[]): string {
  return createHash('sha256').update(system).update(JSON.stringify(tools)).digest('hex');
}

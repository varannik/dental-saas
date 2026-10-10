import { VOICE_COMMANDS, type CommandType } from '@dental/contracts';
import { z } from 'zod';
import type { ModelReply } from '../types.js';
import { isGrounded } from './grounding.js';
import { MAX_ENTITY_LENGTH, MAX_NOTE_LENGTH, NO_COMMAND, type ToolSet } from './tools.js';

/**
 * Checks what the model returned against the tools it was offered (V4 acceptance: output
 * outside the registry is rejected). Only an offered tool, with only its own entities, as
 * strings of plausible length, and a confidence from 0 to 1, becomes an intent.
 */

export type Interpretation =
  | {
      outcome: 'intent';
      command: CommandType;
      entities: Record<string, string>;
      confidence: number;
      /** Required entities the clinician did not say. */
      missing: string[];
      /** Entities returned that were not in what was said, and so were not kept. */
      dropped: string[];
    }
  | { outcome: 'none'; reason: string }
  | { outcome: 'rejected'; reason: string };

function schemaFor(command: CommandType) {
  const spec = VOICE_COMMANDS[command]!;
  const shape: Record<string, z.ZodType> = {
    confidence: z.number().min(0).max(1),
  };
  for (const entity of Object.keys(spec.entities)) {
    const max = command === 'note.add' && entity === 'body' ? MAX_NOTE_LENGTH : MAX_ENTITY_LENGTH;
    shape[entity] = z.string().trim().min(1).max(max).optional();
  }
  return z.object(shape).strict();
}

export function validateReply(
  reply: ModelReply,
  offered: ToolSet,
  utterance: string
): Interpretation {
  if (reply.kind === 'refusal') return { outcome: 'none', reason: 'The model declined.' };
  if (reply.kind === 'text') return { outcome: 'none', reason: 'The model returned no command.' };
  if (reply.name === NO_COMMAND) {
    const reason = z.object({ reason: z.string().max(MAX_ENTITY_LENGTH) }).safeParse(reply.input);
    return { outcome: 'none', reason: reason.success ? reason.data.reason : 'Not a command.' };
  }
  const command = offered.commands.get(reply.name);
  if (!command)
    return { outcome: 'rejected', reason: `"${reply.name}" is not an offered command.` };
  const parsed = schemaFor(command).safeParse(reply.input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      outcome: 'rejected',
      reason:
        `Invalid ${command} output: ${issue?.path.join('.') || 'input'} ${issue?.message ?? ''}`.trim(),
    };
  }
  const { confidence, ...rest } = parsed.data as { confidence: number } & Record<
    string,
    string | undefined
  >;
  const spec = VOICE_COMMANDS[command]!.entities;
  const entities: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [name, value] of Object.entries(rest)) {
    if (value === undefined) continue;
    if (spec[name]?.classification || isGrounded(value, utterance)) entities[name] = value;
    else dropped.push(name);
  }
  const missing = Object.entries(spec)
    .filter(([name, definition]) => definition.required && !(name in entities))
    .map(([name]) => name);
  return { outcome: 'intent', command, entities, confidence, missing, dropped };
}

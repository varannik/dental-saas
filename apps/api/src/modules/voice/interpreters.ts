import { ClaudeInterpreter } from './adapters/claude.js';
import { OpenAIInterpreter } from './adapters/openai.js';
import type { Interpreter } from './types.js';

/** The interpreters configured on this server, selectable per utterance. */

export const INTERPRETER_IDS = ['anthropic', 'openai', 'runbios'] as const;
export type InterpreterId = (typeof INTERPRETER_IDS)[number];

const LABELS: Record<InterpreterId, string> = {
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
  runbios: 'Run BiOS',
};

export interface InterpreterSummary {
  id: InterpreterId;
  label: string;
  model: string;
}

export class InterpreterRegistry {
  private readonly entries: Map<InterpreterId, Interpreter>;

  constructor(
    entries: Partial<Record<InterpreterId, Interpreter>>,
    readonly defaultId: InterpreterId
  ) {
    this.entries = new Map(
      INTERPRETER_IDS.flatMap((id) => (entries[id] ? [[id, entries[id]] as const] : []))
    );
    if (!this.entries.has(defaultId)) {
      throw new Error(`Default interpreter "${defaultId}" is not configured.`);
    }
  }

  list(): InterpreterSummary[] {
    return [...this.entries].map(([id, interpreter]) => ({
      id,
      label: LABELS[id],
      model: interpreter.model,
    }));
  }

  /** Returns the interpreter for the id, the default when no id is given, or undefined. */
  get(id?: InterpreterId): { id: InterpreterId; interpreter: Interpreter } | undefined {
    const chosen = id ?? this.defaultId;
    const interpreter = this.entries.get(chosen);
    return interpreter ? { id: chosen, interpreter } : undefined;
  }
}

export interface InterpreterKeys {
  ANTHROPIC_API_KEY?: string;
  VOICE_LLM_MODEL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  RUNBIOS_API_KEY?: string;
  RUNBIOS_MODEL: string;
  RUNBIOS_BASE_URL: string;
  VOICE_INTERPRETER: InterpreterId;
}

/** Builds a registry with every provider that has a key. */
export function interpretersFromConfig(config: InterpreterKeys): InterpreterRegistry {
  return new InterpreterRegistry(
    {
      anthropic: config.ANTHROPIC_API_KEY
        ? new ClaudeInterpreter({ apiKey: config.ANTHROPIC_API_KEY, model: config.VOICE_LLM_MODEL })
        : undefined,
      openai: config.OPENAI_API_KEY
        ? new OpenAIInterpreter({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL })
        : undefined,
      // Run BiOS through its OpenAI-compatible API for every model in its catalog.
      runbios: config.RUNBIOS_API_KEY
        ? new OpenAIInterpreter({
            apiKey: config.RUNBIOS_API_KEY,
            model: config.RUNBIOS_MODEL,
            baseURL: config.RUNBIOS_BASE_URL,
            provider: 'runbios',
          })
        : undefined,
    },
    config.VOICE_INTERPRETER
  );
}

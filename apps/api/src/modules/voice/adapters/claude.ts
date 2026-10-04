import Anthropic from '@anthropic-ai/sdk';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  TOOL_SPECS,
  parseToolCall,
  userMessage,
} from '../interpreter-spec.js';
import type { InterpretContext, Interpreter, RawIntent } from '../types.js';

/** Interpreter on Claude tool use (Anthropic Messages API). */

const TOOLS: Anthropic.Tool[] = TOOL_SPECS.map((spec) => ({
  name: spec.name,
  description: spec.description,
  input_schema: spec.parameters,
}));

/** Converts a Messages API response into a raw intent. Exported for tests. */
export function toRawIntent(message: Anthropic.Message): RawIntent {
  if (message.stop_reason === 'refusal') return { intent: 'none', reason: 'Model declined.' };
  const call = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
  if (!call) return { intent: 'none', reason: 'Model returned no command.' };
  return parseToolCall(call.name, call.input);
}

export interface ClaudeInterpreterOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export class ClaudeInterpreter implements Interpreter {
  readonly model: string;
  readonly promptVersion = PROMPT_VERSION;
  private readonly client: Anthropic;

  constructor(options: ClaudeInterpreterOptions) {
    this.model = options.model;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 10_000,
      maxRetries: 1,
    });
  }

  async warm(): Promise<void> {
    await this.client.models.list({ limit: 1 });
  }

  async interpret(transcript: string, context: InterpretContext): Promise<RawIntent> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      // "auto" with one call: forced tool choice is rejected by newer Claude models.
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
      messages: [{ role: 'user', content: userMessage(transcript, context) }],
    });
    return toRawIntent(message);
  }
}

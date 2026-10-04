import OpenAI from 'openai';
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  TOOL_SPECS,
  parseToolCall,
  userMessage,
} from '../interpreter-spec.js';
import type { InterpretContext, Interpreter, RawIntent } from '../types.js';

/**
 * Interpreter on OpenAI function calling (Chat Completions API).
 * Also serves OpenAI-compatible gateways such as Run BiOS through `baseURL`.
 */

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOL_SPECS.map((spec) => ({
  type: 'function',
  // Not strict: strict mode requires every property, and "tooth" is optional.
  // The shared parser validates the arguments instead.
  function: { name: spec.name, description: spec.description, parameters: spec.parameters },
}));

/** Converts a Chat Completions response into a raw intent. Exported for tests. */
export function toRawIntent(completion: OpenAI.Chat.Completions.ChatCompletion): RawIntent {
  const message = completion.choices[0]?.message;
  if (!message) return { intent: 'none', reason: 'Model returned no command.' };
  if (message.refusal) return { intent: 'none', reason: 'Model declined.' };
  const call = message.tool_calls?.find((toolCall) => toolCall.type === 'function');
  if (!call || call.type !== 'function') {
    return { intent: 'none', reason: 'Model returned no command.' };
  }
  let input: unknown;
  try {
    input = JSON.parse(call.function.arguments);
  } catch {
    return { intent: 'none', reason: 'Model output failed validation.' };
  }
  return parseToolCall(call.function.name, input);
}

export interface OpenAIInterpreterOptions {
  apiKey: string;
  model: string;
  /** An OpenAI-compatible endpoint, including its /v1 path. Defaults to OpenAI. */
  baseURL?: string;
  timeoutMs?: number;
}

export class OpenAIInterpreter implements Interpreter {
  readonly model: string;
  readonly promptVersion = PROMPT_VERSION;
  private readonly client: OpenAI;

  constructor(options: OpenAIInterpreterOptions) {
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
      timeout: options.timeoutMs ?? 10_000,
      maxRetries: 1,
    });
  }

  async warm(): Promise<void> {
    await this.client.models.list();
  }

  async interpret(transcript: string, context: InterpretContext): Promise<RawIntent> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      // Room for reasoning tokens if a reasoning model is configured.
      max_completion_tokens: 1024,
      tools: TOOLS,
      // "auto" plus the prompt's one-tool instruction: gateways reject "required" for newer
      // Claude models. A reply without a tool call is treated as no command.
      tool_choice: 'auto',
      parallel_tool_calls: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage(transcript, context) },
      ],
    });
    return toRawIntent(completion);
  }
}

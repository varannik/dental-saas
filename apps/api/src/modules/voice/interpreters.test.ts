import { describe, expect, it } from 'vitest';
import { ClaudeInterpreter } from './adapters/claude.js';
import { OpenAIInterpreter } from './adapters/openai.js';
import { InterpreterRegistry, interpretersFromConfig } from './interpreters.js';
import type { Interpreter } from './types.js';

const fake = (model: string): Interpreter => ({
  model,
  promptVersion: 1,
  interpret: async () => ({ intent: 'none', reason: 'fake' }),
});

const keys = {
  VOICE_LLM_MODEL: 'claude-haiku-4-5',
  OPENAI_MODEL: 'gpt-4.1-mini',
  RUNBIOS_MODEL: 'openai/gpt-4.1-mini',
  RUNBIOS_BASE_URL: 'https://api.runbios.ai/v1',
};

describe('InterpreterRegistry', () => {
  it('lists configured interpreters and resolves the default', () => {
    const registry = new InterpreterRegistry({ openai: fake('gpt-x') }, 'openai');
    expect(registry.list()).toEqual([{ id: 'openai', label: 'OpenAI', model: 'gpt-x' }]);
    expect(registry.get()?.id).toBe('openai');
    expect(registry.get('anthropic')).toBeUndefined();
  });

  it('refuses a default that is not configured', () => {
    expect(() => new InterpreterRegistry({ openai: fake('gpt-x') }, 'anthropic')).toThrow(
      /not configured/
    );
  });
});

describe('interpretersFromConfig', () => {
  it('registers every provider with a key', () => {
    const registry = interpretersFromConfig({
      ...keys,
      ANTHROPIC_API_KEY: 'sk-ant',
      OPENAI_API_KEY: 'sk-oai',
      VOICE_INTERPRETER: 'anthropic',
    });
    expect(registry.list().map((entry) => entry.id)).toEqual(['anthropic', 'openai']);
    expect(registry.get('anthropic')?.interpreter).toBeInstanceOf(ClaudeInterpreter);
    expect(registry.get('openai')?.interpreter).toBeInstanceOf(OpenAIInterpreter);
    expect(registry.get('openai')?.interpreter.model).toBe('gpt-4.1-mini');
  });

  it('leaves out providers without a key', () => {
    const registry = interpretersFromConfig({
      ...keys,
      OPENAI_API_KEY: 'sk-oai',
      VOICE_INTERPRETER: 'openai',
    });
    expect(registry.list().map((entry) => entry.id)).toEqual(['openai']);
  });

  it('registers Run BiOS on its OpenAI-compatible endpoint', () => {
    const registry = interpretersFromConfig({
      ...keys,
      RUNBIOS_API_KEY: 'bios-key',
      VOICE_INTERPRETER: 'runbios',
    });
    expect(registry.list()).toEqual([
      { id: 'runbios', label: 'Run BiOS', model: 'openai/gpt-4.1-mini' },
    ]);
    const { interpreter } = registry.get()!;
    expect(interpreter).toBeInstanceOf(OpenAIInterpreter);
    expect((interpreter as unknown as { client: { baseURL: string } }).client.baseURL).toBe(
      'https://api.runbios.ai/v1'
    );
  });
});

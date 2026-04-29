import { describe, expect, it } from 'vitest';

import {
  createClinicalNoteBodySchema,
  updateClinicalNoteBodySchema,
} from '../schemas/note.schema.js';

describe('schemas/note', () => {
  it('accepts create body', () => {
    const parsed = createClinicalNoteBodySchema.parse({
      noteType: 'SOAP',
      content: 'Hello',
      language: 'en',
    });
    expect(parsed.noteType).toBe('SOAP');
  });

  it('rejects empty content on create', () => {
    expect(() =>
      createClinicalNoteBodySchema.parse({
        noteType: 'PROGRESS',
        content: '',
      })
    ).toThrow();
  });

  it('requires at least one field on update', () => {
    expect(() => updateClinicalNoteBodySchema.parse({})).toThrow();
    const ok = updateClinicalNoteBodySchema.parse({ content: 'x' });
    expect(ok.content).toBe('x');
  });
});

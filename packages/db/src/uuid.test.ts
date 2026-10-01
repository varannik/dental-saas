import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid.js';

describe('uuidv7', () => {
  it('sets the version and variant bits', () => {
    const id = uuidv7(1_700_000_000_000);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

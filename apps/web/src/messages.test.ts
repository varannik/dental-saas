import { describe, expect, it } from 'vitest';
import messages from './messages/en.json';

describe('message catalogue', () => {
  it('names the product in English', () => {
    expect(messages.app.name).toBe('Dental Platform');
    expect(messages.app.tagline.length).toBeGreaterThan(0);
  });
});

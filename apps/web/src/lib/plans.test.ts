import { describe, expect, it } from 'vitest';
import { moveItem } from './plans';

describe('moveItem', () => {
  it('moves an item up or down by one place', () => {
    expect(moveItem(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('leaves the order alone at the ends or for an unknown id', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveItem(ids, 'a', -1)).toBe(ids);
    expect(moveItem(ids, 'c', 1)).toBe(ids);
    expect(moveItem(ids, 'x', 1)).toBe(ids);
  });
});

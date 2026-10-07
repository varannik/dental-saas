/** Pure helpers for the treatment plan screen. */

/** The ids in a new order after moving one item up (-1) or down (+1); unchanged at the ends. */
export function moveItem(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

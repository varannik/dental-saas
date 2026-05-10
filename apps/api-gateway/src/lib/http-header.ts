/**
 * Fastify exposes some headers as `string | string[]` when duplicates exist.
 * Node's `fetch()` requires plain string values; arrays cause TypeError → gateway 500.
 */
export function firstHeader(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

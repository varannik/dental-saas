import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LicenceAllowList {
  approved: string[];
  manifestExceptions?: { name: string; licence: string; reason: string }[];
  notes: string[];
}

const here = dirname(fileURLToPath(import.meta.url));

export function loadAllowList(
  path = join(here, '../../../scripts/licences/allow-list.json')
): LicenceAllowList {
  return JSON.parse(readFileSync(path, 'utf8')) as LicenceAllowList;
}

/**
 * A dependency is allowed when every AND-clause contains at least one
 * approved licence. "MIT OR Apache-2.0" passes. "MIT AND GPL-3.0" does not.
 */
export function isLicenceApproved(expression: string, approved: readonly string[]): boolean {
  const cleaned = expression.replace(/[()]/g, ' ').trim();
  if (!cleaned) return false;
  const andParts = cleaned.split(/\s+AND\s+/i);
  return andParts.every((part) => {
    const orParts = part
      .split(/\s+OR\s+|\s*\/\s*/i)
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item !== 'OR' && item !== 'AND');
    return orParts.some((licence) => approved.includes(licence));
  });
}

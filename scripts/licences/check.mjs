import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { isLicenceApproved } = await import(
  pathToFileURL(join(root, 'packages/config/dist/index.js')).href
);

const allowList = JSON.parse(readFileSync(join(root, 'scripts/licences/allow-list.json'), 'utf8'));

function licenceOf(manifest) {
  const value = manifest.license ?? manifest.licence;
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry : entry.type))
      .filter(Boolean)
      .join(' OR ');
  }
  if (typeof value === 'object' && value.type) return value.type;
  return null;
}

function isDirectory(entry, full) {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return statSync(full).isDirectory();
  } catch {
    return false;
  }
}

function record(manifestPath, fallbackName, found) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const name = typeof manifest.name === 'string' ? manifest.name : fallbackName;
    if (manifest.private === true || name.startsWith('@dental/')) return;
    found.push({
      name,
      version: manifest.version ?? '0.0.0',
      licence: licenceOf(manifest),
    });
  } catch {
    // Unreadable manifests are reported by the install, not by this gate.
  }
}

// Visit each installed package once. Do not walk into a package, or nested
// package.json files (Babel helpers, bundler fixtures) are treated as dependencies.
function walk(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const parent = dir.split(sep).at(-1);
  for (const entry of entries) {
    if (entry.name === '.bin') continue;
    if (entry.name.startsWith('.') && entry.name !== '.pnpm') continue;
    const full = join(dir, entry.name);
    if (!isDirectory(entry, full)) continue;

    const manifestPath = join(full, 'package.json');
    const atPackageRoot = parent === 'node_modules' && existsSync(manifestPath);
    if (atPackageRoot) {
      record(manifestPath, entry.name, found);
      continue;
    }

    if (
      entry.name === '.pnpm' ||
      entry.name === 'node_modules' ||
      entry.name.startsWith('@') ||
      parent === '.pnpm'
    ) {
      walk(full, found);
    }
  }
}

const manifests = [];
walk(join(root, 'node_modules'), manifests);

const exceptions = new Map(
  (allowList.manifestExceptions ?? []).map((entry) => [entry.name, entry.licence])
);

const failures = [];
const seen = new Set();
for (const item of manifests) {
  const key = `${item.name}@${item.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const licence = item.licence ?? exceptions.get(item.name);
  if (!licence || !isLicenceApproved(licence, allowList.approved)) {
    failures.push(`${item.name}@${item.version} (${item.licence ?? 'missing licence'})`);
  }
}

if (failures.length > 0) {
  console.error('Dependencies with a non-approved licence:');
  for (const failure of failures.sort()) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`Licence check passed for ${seen.size} packages.`);

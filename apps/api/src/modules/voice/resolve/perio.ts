import { PERIO_SITES, type PerioSite } from '@dental/contracts';
import { parseSmallNumbers, tokens } from './numbers.js';

/**
 * Spoken probing (V5). A site named before a depth applies to it: "distolingual six". Bare
 * depths fill the sites in chart order: three are the buccal sites (mesio-, mid-, disto-buccal),
 * six are all six. Bleeding names sites, or "all" for every site read.
 */

const SITE_WORDS: Record<string, PerioSite> = {
  mesiobuccal: 'MB',
  mb: 'MB',
  buccal: 'B',
  distobuccal: 'DB',
  db: 'DB',
  mesiolingual: 'ML',
  ml: 'ML',
  mesiopalatal: 'ML',
  lingual: 'L',
  palatal: 'L',
  distolingual: 'DL',
  dl: 'DL',
  distopalatal: 'DL',
};

/** Joins "mesio buccal" into "mesiobuccal" after tokenising. */
function siteTokens(text: string): string[] {
  const out: string[] = [];
  for (const word of tokens(text)) {
    const last = out.at(-1);
    if ((last === 'mesio' || last === 'disto') && /^(buccal|lingual|palatal)$/.test(word)) {
      out[out.length - 1] = last + word;
    } else out.push(word);
  }
  return out;
}

export type PerioReading = { site: PerioSite; pocketDepth: number; bleeding: boolean };

export function parseReadings(
  readings: string,
  bleeding: string | undefined
): { readings: PerioReading[] } | { problem: string } {
  const words = siteTokens(readings);
  const named: { site: PerioSite; pocketDepth: number }[] = [];
  const bare: number[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const site = SITE_WORDS[words[i]!];
    if (site) {
      const depth = parseSmallNumbers(words.slice(i + 1, i + 3).join(' '))[0];
      if (depth === undefined) return { problem: `No depth was said for ${words[i]}.` };
      named.push({ site, pocketDepth: depth });
      // Skip the words of the depth just read.
      i += /^(twenty|thirty|forty)$/.test(words[i + 1] ?? '') ? 2 : 1;
    } else {
      bare.push(...parseSmallNumbers(words[i]!));
    }
  }
  let read: { site: PerioSite; pocketDepth: number }[];
  if (named.length && bare.length)
    return { problem: 'Say the depths either with their sites or in order, not both.' };
  if (named.length) read = named;
  else if (bare.length === 3 || bare.length === 6) {
    read = bare.map((pocketDepth, index) => ({ site: PERIO_SITES[index]!, pocketDepth }));
  } else if (bare.length === 0) return { problem: 'No probing depth was heard.' };
  else return { problem: `${bare.length} depths were heard; say three (buccal) or six.` };

  if (read.some((reading) => reading.pocketDepth > 20)) {
    return { problem: 'A pocket depth above 20 mm is not plausible; please repeat.' };
  }
  const bleedingWords = bleeding ? siteTokens(bleeding) : [];
  const bleedAll = bleedingWords.some((word) => /^(all|everywhere|yes|bleeding)$/.test(word));
  const bleedSites = new Set(bleedingWords.map((word) => SITE_WORDS[word]).filter(Boolean));
  return {
    readings: read.map((reading) => ({
      ...reading,
      bleeding: bleedAll || bleedSites.has(reading.site),
    })),
  };
}

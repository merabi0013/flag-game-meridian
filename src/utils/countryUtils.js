/**
 * countryUtils.js
 * -----------------------------------------------------------------------
 * Answer-matching logic, ported 1:1 from the previous vanilla-JS
 * implementation's game.js. Pure functions, no DOM — portable to a future
 * React Native/Expo build.
 * -----------------------------------------------------------------------
 */
import { shuffle } from './shuffle';

const MC_OPTION_COUNT = 4;

// Common alternate spellings/short forms accepted in text-entry modes.
// Keyed by country id (ISO2), values are extra accepted strings
// (lowercase). The canonical name is always accepted too.
export const ALIASES = {
  us: ['usa', 'united states of america', 'america'],
  gb: ['uk', 'united kingdom of great britain', 'great britain', 'britain'],
  kr: ['south korea', 'republic of korea'],
  kp: ['north korea', 'dprk'],
  cz: ['czech republic'],
  cd: ['dr congo', 'drc', 'democratic republic of congo', 'democratic republic of the congo', 'congo kinshasa'],
  cg: ['republic of congo', 'congo brazzaville', 'congo-brazzaville'],
  ci: ["cote d'ivoire", 'cote divoire', "côte d'ivoire"],
  ba: ['bosnia', 'bosnia & herzegovina'],
  ae: ['uae', 'emirates'],
  va: ['vatican', 'holy see'],
  mk: ['macedonia'],
  sz: ['swaziland'],
  tl: ['east timor'],
  cv: ['cape verde'],
  xk: ['kosovo'],
};

export function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function acceptedStrings(country) {
  return [normalize(country.name), ...(ALIASES[country.id] || []).map(normalize)];
}

export function isCorrectText(country, rawGuess, difficulty) {
  const guess = normalize(rawGuess);
  if (!guess) return false;
  const accepted = acceptedStrings(country);
  if (accepted.includes(guess)) return true;

  const tolerance = difficulty === 'hard' ? 1 : 2;
  return accepted.some((a) => {
    if (Math.abs(a.length - guess.length) > tolerance + 1) return false;
    return levenshtein(a, guess) <= tolerance;
  });
}

/** Builds the 4 multiple-choice options for Easy mode, topping up from
 * the full world dataset if the category is too small to have 3
 * distractors on its own. */
export function buildMcOptions(pool, correctCountry, allCountries) {
  const distractors = shuffle(pool.filter((c) => c.id !== correctCountry.id)).slice(0, MC_OPTION_COUNT - 1);
  if (distractors.length < MC_OPTION_COUNT - 1) {
    const world = allCountries.filter(
      (c) => c.id !== correctCountry.id && !distractors.some((d) => d.id === c.id)
    );
    distractors.push(...shuffle(world).slice(0, MC_OPTION_COUNT - 1 - distractors.length));
  }
  return shuffle([correctCountry, ...distractors]);
}

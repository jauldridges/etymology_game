export const RANKS = [
  { name: 'Seed', min: 0 },
  { name: 'Sprout', min: 10 },
  { name: 'Shoot', min: 25 },
  { name: 'Branch', min: 40 },
  { name: 'Trunk', min: 55 },
  { name: 'Canopy', min: 70 },
  { name: 'Taproot', min: 90 },
];

// How bonus-tier words score. The design leaves this open, so it is a setting.
//   off      accepted and shown, but not scored
//   extra    count toward the score only, so a result can pass 100%
//   counted  count toward the score and the total, like core words
export const BONUS_MODES = ['off', 'extra', 'counted'];

export function rankFor(percent) {
  let rank = RANKS[0];
  for (const r of RANKS) if (percent >= r.min) rank = r;
  return rank;
}

export function nextRank(percent) {
  return RANKS.find((r) => r.min > percent) ?? null;
}

// Whether an entry adds to the found count and to the total, under a bonus mode.
export function entryWeight(puzzle, entry, bonusMode) {
  const scoring = puzzle.tiers[entry.tier]?.scoring ?? 'always';
  if (scoring !== 'bonus') return { counts: true, inTotal: true, bonus: false };
  if (bonusMode === 'counted') return { counts: true, inTotal: true, bonus: true };
  if (bonusMode === 'extra') return { counts: true, inTotal: false, bonus: true };
  return { counts: false, inTotal: false, bonus: true };
}

export function computeScore(puzzle, found, bonusMode = 'off') {
  const perLang = {};
  for (const lang of puzzle.languages) perLang[lang] = { found: 0, total: 0 };
  let foundCount = 0;
  let total = 0;
  let bonusFound = 0;

  for (const entry of puzzle.entries) {
    const w = entryWeight(puzzle, entry, bonusMode);
    const lang = (perLang[entry.lang] ??= { found: 0, total: 0 });
    const isFound = found.has(entry.id);
    if (w.inTotal) { total++; lang.total++; }
    if (isFound && w.bonus) bonusFound++;
    if (isFound && w.counts) {
      if (w.inTotal) foundCount++;
      lang.found++;
    }
  }

  // In "extra" mode, bonus finds sit on top of the core score.
  const extra = bonusMode === 'extra' ? bonusFound : 0;
  const scored = foundCount + extra;
  const percent = total ? (scored / total) * 100 : 0;
  return {
    found: scored,
    coreFound: foundCount,
    bonusFound,
    extra,
    total,
    percent,
    percentShown: Math.floor(percent),
    rank: rankFor(percent),
    next: nextRank(percent),
    perLang,
  };
}

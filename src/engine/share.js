export const GAME_NAME = 'Roots';
const BAR_CELLS = 8;

function bar(found, total) {
  if (!total) return '□'.repeat(BAR_CELLS);
  let filled = Math.round((found / total) * BAR_CELLS);
  if (found > 0 && filled === 0) filled = 1;
  filled = Math.min(filled, BAR_CELLS);
  return '■'.repeat(filled) + '□'.repeat(BAR_CELLS - filled);
}

// The spoiler-free result: puzzle number, root, rank, score, one bar per language.
export function buildShareText({ number, rootLabel, score, languages, blitz = false, url }) {
  const head = [`${GAME_NAME}${number ? ` #${number}` : ''} · ${rootLabel}`];
  if (blitz) head.push('60s blitz');
  const extra = score.extra ? ` +${score.extra} bonus` : '';
  const lines = [
    head.join(' · '),
    `${score.rank.name} · ${score.found - score.extra} of ${score.total} words (${score.percentShown}%)${extra}`,
    ...languages.map((lang) => {
      const l = score.perLang[lang] ?? { found: 0, total: 0 };
      return `${lang.toUpperCase()} ${bar(l.found, l.total)}`;
    }),
  ];
  if (url) lines.push(url);
  return lines.join('\n');
}

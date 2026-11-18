#!/usr/bin/env node
// Builds play.html: the whole game, its styles and every key file in one page
// that works when opened straight from disk (double-click), with no server.
//   node tools/build-standalone.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');

// Dependency order; each file's import lines and export keywords are removed.
const modules = [
  'src/engine/normalize.js', 'src/engine/puzzle.js', 'src/engine/match.js',
  'src/engine/score.js', 'src/engine/share.js', 'src/engine/schedule.js', 'src/ui/game.js',
];
const js = modules.map((m) => `// ---- ${m}\n` + read(m)
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '')
  .replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, '')).join('\n');

const puzzles = {};
for (const f of readdirSync(join(repo, 'keys')).filter((f) => f.endsWith('.json') && f !== 'schedule.json')) {
  const p = JSON.parse(read(`keys/${f}`));
  puzzles[p.id] = p;
}
const data = { schedule: JSON.parse(read('keys/schedule.json')), puzzles };
const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Roots</title>
<!-- Built by tools/build-standalone.mjs. Do not edit by hand; edit src/ and keys/, then rebuild. -->
<style>html, body { margin: 0; height: 100%; } body { background: #f7f3ea; } @media (prefers-color-scheme: dark) { body { background: #1c1a17; } }
${read('src/ui/game.css')}</style>
</head>
<body>
<div id="app"></div>
<script>
(() => {
${safe(js)}
const ROOTS_DATA = ${safe(JSON.stringify(data))};
mountGame(document.getElementById('app'), { data: ROOTS_DATA });
})();
</script>
</body>
</html>
`;
writeFileSync(join(repo, 'play.html'), html);
console.log(`wrote play.html (${Math.round(html.length / 1024)} KB, ${Object.keys(puzzles).length} puzzles)`);

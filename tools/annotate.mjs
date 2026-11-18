#!/usr/bin/env node
// Adds definitions and word-part breakdowns to a key file from a plain-text sheet.
//   node tools/annotate.mjs keys/caput.json annotations/caput.txt
//
// Sheet format, one entry per line (blank lines and # comments are ignored):
//   lang | word | definition | source | parts
//   en | decapitate | to cut off the head of | Late Latin decapitare | de-=off, away + *capit=head + -ate=makes a verb
//
// - word: as in the key; add the gloss in brackets for words that need one, "cape (headland)".
// - definition: plain English. "@chef" copies the English entry's definition.
// - source: optional; the older word the parts belong to, when they are not the parts of the
//   modern spelling ("Latin capitulum").
// - parts: joined by " + ". "part=meaning". A leading * marks the part that carries the root.
//   A part with no "=" means itself (house, boat), or the root's meaning if starred.
//
// Annotated entries stay unreviewed: every definition and breakdown is checked by a person.
import { readFileSync, writeFileSync } from 'node:fs';

const [keyPath, sheetPath] = process.argv.slice(2);
if (!keyPath || !sheetPath) {
  console.error('usage: node tools/annotate.mjs <key.json> <sheet.txt>');
  process.exit(2);
}
const puzzle = JSON.parse(readFileSync(keyPath, 'utf8'));
const meaning = puzzle.root?.meaning ?? '';
const label = (e) => `${e.lang}|${e.word}${e.gloss ? ` (${e.gloss})` : ''}`;
const byKey = new Map(puzzle.entries.map((e) => [label(e), e]));

const rows = readFileSync(sheetPath, 'utf8').split('\n')
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('|').map((c) => c.trim()));

const problems = [];
const done = new Set();
for (const [lang, word, definition, source, parts] of rows) {
  const entry = byKey.get(`${lang}|${word}`);
  if (!entry) { problems.push(`no entry ${lang} "${word}"`); continue; }
  if (!definition || !parts) { problems.push(`${lang} "${word}": needs a definition and parts`); continue; }
  entry.definition = definition;
  if (source) entry.source = source; else delete entry.source;
  entry.morphemes = parts.split(' + ').map((raw) => {
    const root = raw.startsWith('*');
    const body = root ? raw.slice(1) : raw;
    const i = body.indexOf('=');
    const part = (i < 0 ? body : body.slice(0, i)).trim();
    const m = i < 0 ? (root ? meaning : part) : body.slice(i + 1).trim();
    return root ? { part, meaning: m, root: true } : { part, meaning: m };
  });
  if (!entry.morphemes.some((m) => m.root)) problems.push(`${lang} "${word}": no part is marked * as the root`);
  done.add(label(entry));
}

// Resolve "@word" definitions against the English entries.
for (const e of puzzle.entries) {
  if (!e.definition?.startsWith('@')) continue;
  const ref = puzzle.entries.find((x) => x.lang === 'en' && x.word === e.definition.slice(1));
  if (ref?.definition && !ref.definition.startsWith('@')) e.definition = ref.definition;
  else problems.push(`${e.lang} "${e.word}": cannot resolve ${e.definition}`);
}

const missing = puzzle.entries.filter((e) => !done.has(label(e))).map(label);
if (missing.length) problems.push(`not annotated: ${missing.join(', ')}`);

// Keep a stable field order so the files stay easy to read and diff.
const ORDER = ['word', 'lang', 'tier', 'gloss', 'definition', 'source', 'morphemes', 'path', 'variants', 'reviewed'];
puzzle.entries = puzzle.entries.map((e) => {
  const out = {};
  for (const k of ORDER) if (k in e) out[k] = e[k];
  for (const k of Object.keys(e)) if (!(k in out)) out[k] = e[k];
  return out;
});

writeFileSync(keyPath, JSON.stringify(puzzle, null, 2) + '\n');
console.log(`${keyPath}: annotated ${done.size} of ${puzzle.entries.length}`);
if (problems.length) {
  console.log(problems.map((p) => `  problem: ${p}`).join('\n'));
  process.exit(1);
}

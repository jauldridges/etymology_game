import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize } from '../src/engine/normalize.js';
import { preparePuzzle } from '../src/engine/puzzle.js';
import { checkGuess } from '../src/engine/match.js';
import { computeScore, rankFor } from '../src/engine/score.js';
import { buildShareText } from '../src/engine/share.js';
import { puzzleForDate, archive } from '../src/engine/schedule.js';

const fixture = () => preparePuzzle({
  id: 'natio',
  status: 'draft',
  root: { form: 'nātiō', transliteration: 'nātiō', family: 'latin', meaning: 'birth', principalParts: ['nātiō', 'nātiōnis'], stems: ['nat-'] },
  languages: ['en', 'es', 'pt', 'fr'],
  difficulty: 'easy',
  entries: [
    { word: 'nation', lang: 'en', tier: 'core', path: 'p', variants: ['nations'], reviewed: false },
    { word: 'nación', lang: 'es', tier: 'core', path: 'p', variants: ['naciones'], reviewed: false },
    { word: 'nação', lang: 'pt', tier: 'core', path: 'p', variants: [], reviewed: false },
    { word: 'nation', lang: 'fr', tier: 'core', path: 'p', variants: [], reviewed: false },
    { word: 'chef-d’œuvre', lang: 'fr', tier: 'core', path: 'p', variants: [], reviewed: false },
    { word: 'nativity', lang: 'en', tier: 'bonus', path: 'p', variants: [], reviewed: false },
  ],
  notRelated: [{ word: 'notion', lang: 'en', why: 'from noscere' }],
});

const load = (id) => preparePuzzle(JSON.parse(readFileSync(new URL(`../keys/${id}.json`, import.meta.url))));
const langsOf = (r) => r.entries.map((e) => e.lang).sort();

test('normalize ignores capitals, accents, ligatures and punctuation', () => {
  assert.equal(normalize('  NACIÓN '), 'nacion');
  assert.equal(normalize('nação'), 'nacao');
  assert.equal(normalize('Chef-d’Œuvre'), 'chef doeuvre');
  assert.equal(normalize('chef d\'oeuvre'), 'chef doeuvre');
  assert.equal(normalize('Gewächshaus'), 'gewachshaus');
  assert.equal(normalize('Straße'), 'strasse');
  assert.equal(normalize('husvagn'), 'husvagn');
  assert.equal(normalize('γράφω'), 'γραφω');
});

test('accent-free typing matches (nacion → nación)', () => {
  const p = fixture();
  const r = checkGuess(p, 'nacion', new Set());
  assert.equal(r.kind, 'new');
  assert.deepEqual(r.entries.map((e) => e.word), ['nación']);
  assert.equal(checkGuess(p, 'NACAO', new Set()).entries[0].word, 'nação');
});

test('a shared spelling credits every language (nation → en and fr)', () => {
  const p = fixture();
  const r = checkGuess(p, 'Nation', new Set());
  assert.equal(r.kind, 'new');
  assert.deepEqual(langsOf(r), ['en', 'fr']);
});

test('variants match, but endings are never guessed', () => {
  const p = fixture();
  assert.equal(checkGuess(p, 'naciones', new Set()).entries[0].word, 'nación');
  assert.equal(checkGuess(p, 'nacoes', new Set()).kind, 'unknown');
  assert.equal(checkGuess(p, 'chef doeuvre', new Set()).entries[0].word, 'chef-d’œuvre');
});

test('repeats are acknowledged, not scored again', () => {
  const p = fixture();
  const found = new Set();
  for (const e of checkGuess(p, 'nation', found).entries) found.add(e.id);
  assert.equal(checkGuess(p, 'nation', found).kind, 'repeat');
  assert.equal(checkGuess(p, 'nations', found).kind, 'repeat');
});

test('a partly found shared spelling credits only the missing languages', () => {
  const p = fixture();
  const enOnly = p.entries.find((e) => e.lang === 'en' && e.word === 'nation');
  const r = checkGuess(p, 'nation', new Set([enOnly.id]));
  assert.equal(r.kind, 'new');
  assert.deepEqual(langsOf(r), ['fr']);
  assert.equal(r.alreadyFound.length, 1);
});

test('lookalikes get a not-related result', () => {
  const r = checkGuess(fixture(), 'notion', new Set());
  assert.equal(r.kind, 'notRelated');
  assert.equal(r.items[0].why, 'from noscere');
});

test('unknown and empty words', () => {
  assert.equal(checkGuess(fixture(), 'banana', new Set()).kind, 'unknown');
  assert.equal(checkGuess(fixture(), '   ', new Set()).kind, 'empty');
});

test('real key: chef credits all four languages of caput', () => {
  const r = checkGuess(load('caput'), 'chef', new Set());
  assert.deepEqual(langsOf(r), ['en', 'es', 'fr', 'pt']);
});

test('real key: cape the headland counts, though cape the cloak is listed as not related', () => {
  const r = checkGuess(load('caput'), 'cape', new Set());
  assert.equal(r.kind, 'new');
  assert.equal(r.entries[0].gloss, 'headland');
  assert.equal(checkGuess(load('caput'), 'capture', new Set()).kind, 'notRelated');
});

test('real key: Greek and Germanic puzzles match', () => {
  assert.deepEqual(langsOf(checkGuess(load('graphein'), 'telegrama', new Set())), ['es', 'pt']);
  assert.deepEqual(langsOf(checkGuess(load('hus'), 'hus', new Set())), ['sv']);
  assert.equal(checkGuess(load('hus'), 'gewachshaus', new Set()).entries[0].word, 'Gewächshaus');
});

test('scoring: one point per word, bonus modes, per-language totals', () => {
  const p = fixture();
  const all = new Set(p.entries.map((e) => e.id));
  const off = computeScore(p, all, 'off');
  assert.equal(off.total, 5);
  assert.equal(off.found, 5);
  assert.equal(off.bonusFound, 1);
  assert.equal(off.percentShown, 100);

  const extra = computeScore(p, all, 'extra');
  assert.equal(extra.total, 5);
  assert.equal(extra.found, 6);
  assert.equal(extra.percentShown, 120);

  const counted = computeScore(p, all, 'counted');
  assert.equal(counted.total, 6);
  assert.equal(counted.found, 6);

  const none = computeScore(p, new Set(), 'off');
  assert.equal(none.rank.name, 'Seed');
  assert.deepEqual(none.perLang.fr, { found: 0, total: 2 });
});

test('ranks follow the proposed thresholds', () => {
  assert.equal(rankFor(0).name, 'Seed');
  assert.equal(rankFor(9.9).name, 'Seed');
  assert.equal(rankFor(10).name, 'Sprout');
  assert.equal(rankFor(54.9).name, 'Branch');
  assert.equal(rankFor(70).name, 'Canopy');
  assert.equal(rankFor(90).name, 'Taproot');
  assert.equal(rankFor(130).name, 'Taproot');
});

test('share block has no spoilers and one bar per language', () => {
  const p = fixture();
  const found = new Set(p.entries.filter((e) => e.lang === 'en').map((e) => e.id));
  const text = buildShareText({ number: 14, rootLabel: 'nātiō', score: computeScore(p, found, 'off'), languages: p.languages });
  const lines = text.split('\n');
  assert.equal(lines[0], 'Roots #14 · nātiō');
  assert.equal(lines[1], 'Sprout · 1 of 5 words (20%)');
  assert.equal(lines[2], 'EN ■■■■■■■■');
  assert.equal(lines[3], 'ES □□□□□□□□');
  assert.equal(lines.length, 6);
  for (const e of p.entries) assert.ok(!text.includes(e.word), `share text leaks ${e.word}`);
});

test('schedule picks the latest day on or before today and hides future days', () => {
  const s = { days: [{ date: '2026-11-20', puzzle: 'c' }, { date: '2026-11-18', puzzle: 'a' }, { date: '2026-11-19', puzzle: 'b' }] };
  assert.deepEqual(puzzleForDate(s, '2026-11-19'), { date: '2026-11-19', puzzle: 'b', number: 2 });
  assert.equal(puzzleForDate(s, '2027-01-01').puzzle, 'c');
  assert.equal(puzzleForDate(s, '2026-01-01').puzzle, 'a');
  assert.deepEqual(archive(s, '2026-11-19').map((d) => d.puzzle), ['b', 'a']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPuzzle } from '../tools/check-keys.mjs';

const base = () => ({
  id: 'x', status: 'draft', difficulty: 'easy', languages: ['en'],
  root: { form: 'x', transliteration: 'x', family: 'latin', meaning: 'm', principalParts: ['x'], stems: ['x-'] },
  entries: [{ word: 'alpha', lang: 'en', tier: 'core', path: 'p', variants: [], reviewed: true }],
  notRelated: [],
});
const errs = (p) => checkPuzzle(p, 'x.json').errors;

test('a clean puzzle passes', () => assert.deepEqual(errs(base()), []));

test('missing fields are reported', () => {
  const p = base();
  delete p.root.meaning;
  delete p.entries[0].path;
  const e = errs(p);
  assert.ok(e.some((m) => m.includes('missing meaning')));
  assert.ok(e.some((m) => m.includes('no path')));
});

test('duplicate words, including accent-only differences', () => {
  const p = base();
  p.entries.push({ ...p.entries[0], word: 'Álpha' });
  assert.ok(errs(p).some((m) => m.includes('duplicate')));
});

test('a word both in the key and not related', () => {
  const p = base();
  p.notRelated.push({ word: 'alpha', lang: 'en', why: 'w' });
  assert.ok(errs(p).some((m) => m.includes('also a core entry')));
  p.entries[0].gloss = 'letter';
  p.notRelated[0].sense = 'other';
  assert.deepEqual(errs(p), []);
});

test('unreviewed entries in a puzzle marked ready', () => {
  const p = base();
  p.status = 'ready';
  assert.deepEqual(errs(p), []);
  p.entries[0].reviewed = false;
  assert.ok(errs(p).some((m) => m.includes('unreviewed')));
});

test('display stems must appear in some key word', () => {
  const p = base();
  p.root.displayStems = ['alph'];
  assert.deepEqual(errs(p), []);
  p.root.displayStems = ['zzz'];
  assert.ok(errs(p).some((m) => m.includes('display stem "zzz"')));
});

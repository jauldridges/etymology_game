#!/usr/bin/env node
// Reads every puzzle file in keys/ and reports problems.
// Errors fail the run (exit 1); warnings are printed but pass.
//   node tools/check-keys.mjs            all files
//   node tools/check-keys.mjs --quiet    errors only
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalize } from '../src/engine/normalize.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const keysDir = join(repo, 'keys');
const quiet = process.argv.includes('--quiet');

const FAMILIES = ['latin', 'greek', 'germanic'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'hardest'];
const STATUSES = ['draft', 'ready'];
const SCORINGS = ['always', 'bonus'];
const LANGS = ['en', 'es', 'pt', 'fr', 'de', 'nl', 'sv'];
const SIZE = { min: 60, max: 140 };

export function checkPuzzle(p, file = p?.id ?? '?') {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  if (!p || typeof p !== 'object') return { errors: ['file is not a JSON object'], warnings };
  if (!p.id) err('missing id');
  else if (`${p.id}.json` !== file && file.endsWith('.json')) err(`id "${p.id}" does not match file name ${file}`);
  if (!STATUSES.includes(p.status)) err(`status must be one of ${STATUSES.join(', ')}`);
  if (!DIFFICULTIES.includes(p.difficulty)) err(`difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (!Array.isArray(p.languages) || !p.languages.length) err('missing languages');
  else for (const l of p.languages) if (!LANGS.includes(l)) err(`unknown language "${l}"`);

  const roots = p.roots ?? (p.root ? [{ id: p.id, ...p.root }] : []);
  if (!roots.length) err('missing root');
  const rootIds = new Set();
  for (const r of roots) {
    const where = roots.length > 1 ? `root ${r.id ?? '?'}: ` : 'root: ';
    if (p.roots && !r.id) err(`${where}a bundle root needs an id`);
    rootIds.add(r.id);
    for (const f of ['form', 'transliteration', 'family', 'meaning']) if (!r[f]) err(`${where}missing ${f}`);
    if (r.family && !FAMILIES.includes(r.family)) err(`${where}family must be one of ${FAMILIES.join(', ')}`);
    if (!Array.isArray(r.stems) || !r.stems.length) err(`${where}missing stems`);
    if (r.family === 'germanic') {
      if (!Array.isArray(r.writtenForms) || !r.writtenForms.length) err(`${where}a Germanic root needs writtenForms`);
    } else if (!Array.isArray(r.principalParts) || !r.principalParts.length) {
      err(`${where}missing principalParts`);
    }
    if (r.family === 'greek' && r.principalPartsTransliterated?.length !== r.principalParts?.length)
      err(`${where}principalPartsTransliterated must match principalParts one for one`);
  }

  const tiers = { core: { scoring: 'always' }, bonus: { scoring: 'bonus' }, ...(p.tiers ?? {}) };
  for (const [name, t] of Object.entries(p.tiers ?? {}))
    if (!SCORINGS.includes(t.scoring)) err(`tier "${name}": scoring must be one of ${SCORINGS.join(', ')}`);

  if (!Array.isArray(p.entries) || !p.entries.length) {
    err('no entries');
    return { errors, warnings };
  }

  const forms = new Map(); // root|lang|normalized -> word
  const keyWords = new Map(); // lang|normalized -> [entries]
  const perLang = Object.fromEntries((p.languages ?? []).map((l) => [l, 0]));
  let unreviewed = 0;
  let scored = 0;

  p.entries.forEach((e, i) => {
    const label = `entry ${i + 1} (${e.lang ?? '?'} "${e.word ?? '?'}")`;
    if (!e.word || typeof e.word !== 'string') { err(`${label}: missing word`); return; }
    if (!e.lang) err(`${label}: missing lang`);
    else if (!p.languages?.includes(e.lang)) err(`${label}: language "${e.lang}" is not in this puzzle's languages`);
    if (!e.tier) err(`${label}: missing tier`);
    else if (!tiers[e.tier]) err(`${label}: tier "${e.tier}" is not defined in tiers`);
    if (!e.path || !String(e.path).trim()) err(`${label}: no path`);
    if (!Array.isArray(e.variants)) err(`${label}: variants must be a list`);
    if (typeof e.reviewed !== 'boolean') err(`${label}: reviewed must be true or false`);
    if (roots.length > 1 && !rootIds.has(e.root)) err(`${label}: names root "${e.root}", which is not in this bundle`);
    if (e.morphemes !== undefined) {
      if (!Array.isArray(e.morphemes) || !e.morphemes.length) err(`${label}: morphemes must be a non-empty list`);
      else {
        if (e.morphemes.some((m) => !m.part || !m.meaning)) err(`${label}: every word part needs part and meaning`);
        if (!e.morphemes.some((m) => m.root)) err(`${label}: no word part is marked as the root`);
      }
    }
    if (e.definition !== undefined && !String(e.definition).trim()) err(`${label}: empty definition`);
    if (!e.reviewed) unreviewed++;
    if (tiers[e.tier]?.scoring === 'always') scored++;
    if (e.lang in perLang) perLang[e.lang]++;
    if (e.lang !== 'de' && /^\p{Lu}/u.test(e.word)) warn(`${label}: capitalized; check it is not a proper noun`);

    const root = e.root ?? roots[0]?.id;
    for (const v of [e.word, ...(e.variants ?? [])]) {
      const k = `${root}|${e.lang}|${normalize(v)}`;
      if (forms.has(k) && forms.get(k) !== e) err(`${label}: duplicate of "${forms.get(k).word}" (${v})`);
      forms.set(k, e);
    }
    const kw = `${e.lang}|${normalize(e.word)}`;
    if (!keyWords.has(kw)) keyWords.set(kw, []);
    keyWords.get(kw).push(e);
  });

  for (const n of p.notRelated ?? []) {
    const label = `not related "${n.word ?? '?'}"`;
    if (!n.word || !n.lang) { err(`${label}: needs word and lang`); continue; }
    if (!n.why) err(`${label}: missing why`);
    const hits = keyWords.get(`${n.lang}|${normalize(n.word)}`) ?? [];
    for (const hit of hits) {
      // The same spelling may be both, if the senses are told apart (cape the headland, cape the cloak).
      if (n.sense && hit.gloss && n.sense !== hit.gloss) continue;
      err(`${label}: also a ${hit.tier} entry; give both a sense (entry gloss, not-related sense) or remove one`);
    }
  }

  if (p.status === 'ready' && unreviewed)
    err(`marked ready to publish but ${unreviewed} entries are unreviewed`);
  if (p.status === 'ready' && (p.notRelated ?? []).some((n) => n.reviewed === false))
    err('marked ready to publish but some not-related items are unreviewed');
  for (const [l, n] of Object.entries(perLang)) if (!n) err(`language "${l}" has no entries`);
  if (scored < SIZE.min || scored > SIZE.max)
    warn(`${scored} scored words; the target is about 100 (${SIZE.min}–${SIZE.max})`);
  const bare = p.entries.filter((e) => !e.definition || !e.morphemes).length;
  if (bare) warn(`${bare} of ${p.entries.length} entries have no definition or word parts yet (the reveal shows the path only)`);
  if (unreviewed && p.status !== 'ready') warn(`${unreviewed} of ${p.entries.length} entries unreviewed (draft)`);

  return { errors, warnings };
}

export function checkSchedule(schedule, puzzleIds) {
  const errors = [];
  if (!Array.isArray(schedule?.days)) return { errors: ['schedule.json needs a "days" list'], warnings: [] };
  const dates = new Set();
  for (const d of schedule.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date ?? '')) errors.push(`bad date "${d.date}"`);
    if (dates.has(d.date)) errors.push(`date ${d.date} is listed twice`);
    dates.add(d.date);
    if (!puzzleIds.has(d.puzzle)) errors.push(`${d.date}: no key file for puzzle "${d.puzzle}"`);
  }
  return { errors, warnings: [] };
}

function main() {
  let errorCount = 0;
  let warningCount = 0;
  const report = (name, { errors, warnings }) => {
    errorCount += errors.length;
    warningCount += warnings.length;
    const status = errors.length ? 'FAIL' : 'ok  ';
    console.log(`${status} ${name}`);
    for (const e of errors) console.log(`       error: ${e}`);
    if (!quiet) for (const w of warnings) console.log(`       warn:  ${w}`);
  };

  const files = readdirSync(keysDir).filter((f) => f.endsWith('.json') && f !== 'schedule.json').sort();
  const ids = new Set();
  for (const f of files) {
    let p;
    try {
      p = JSON.parse(readFileSync(join(keysDir, f), 'utf8'));
    } catch (e) {
      report(f, { errors: [`not valid JSON: ${e.message}`], warnings: [] });
      continue;
    }
    ids.add(p.id);
    report(f, checkPuzzle(p, f));
  }

  try {
    const schedule = JSON.parse(readFileSync(join(keysDir, 'schedule.json'), 'utf8'));
    report('schedule.json', checkSchedule(schedule, ids));
  } catch (e) {
    report('schedule.json', { errors: [e.message], warnings: [] });
  }

  console.log(`\n${files.length} puzzle files, ${errorCount} errors, ${warningCount} warnings`);
  process.exit(errorCount ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

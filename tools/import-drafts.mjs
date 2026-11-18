#!/usr/bin/env node
// One-time converter: docs/draft-keys.md -> keys/<id>.json
//
// Every entry is written as unreviewed. Paths use only what the draft states
// (its tables and its Flags notes); where the draft gives no route, the path
// names the root and the language and nothing in between. Nothing is invented.
//
// Once a key file exists it is the source of truth and is edited by hand, so
// this script refuses to overwrite existing files unless run with --force.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalize } from '../src/engine/normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const force = process.argv.includes('--force');

const LANGS = { English: 'en', Spanish: 'es', Portuguese: 'pt', French: 'fr', German: 'de', Dutch: 'nl', Swedish: 'sv' };
const LANG_NAMES = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [v, k]));

// Root details for each draft section, keyed by the italic form in its heading.
const META = {
  mittere: {
    id: 'mittere', difficulty: 'hard',
    root: { form: 'mittere', transliteration: 'mittere', family: 'latin', meaning: 'send',
      principalParts: ['mittō', 'mittere', 'mīsī', 'missum'], stems: ['mitt-', 'miss-'] },
  },
  ferre: {
    id: 'ferre', difficulty: 'hard',
    root: { form: 'ferre', transliteration: 'ferre', family: 'latin', meaning: 'carry',
      principalParts: ['ferō', 'ferre', 'tulī', 'lātum'], stems: ['fer-', 'lat-', 'tul-'] },
  },
  dare: {
    id: 'dare', difficulty: 'hardest',
    root: { form: 'dare', transliteration: 'dare', family: 'latin', meaning: 'give',
      principalParts: ['dō', 'dare', 'dedī', 'datum'], stems: ['da-', 'dat-', 'ded-', '-dit-', '-dere'] },
    tiers: { compounds: { label: 'Compounds', scoring: 'always',
      note: 'Open question: count the -dere compounds as core or bonus? Set scoring to "bonus" to try the other way.' } },
  },
  bonus: {
    id: 'bonus', difficulty: 'easy',
    root: { form: 'bonus', transliteration: 'bonus', family: 'latin', meaning: 'good',
      principalParts: ['bonus', 'bona', 'bonum'], stems: ['bon-', 'ben-'] },
    tiers: { bene: { label: 'bene- words', scoring: 'always' } },
  },
  caput: {
    id: 'caput', difficulty: 'easy',
    root: { form: 'caput', transliteration: 'caput', family: 'latin', meaning: 'head',
      principalParts: ['caput', 'capitis'], stems: ['capit-'] },
  },
  graphō: {
    id: 'graphein', difficulty: 'medium',
    root: { form: 'γράφω', transliteration: 'graphō', family: 'greek', meaning: 'write',
      principalParts: ['γράφω', 'γράψω', 'ἔγραψα', 'γέγραφα', 'γέγραμμαι', 'ἐγράφην'],
      principalPartsTransliterated: ['graphō', 'grapsō', 'egrapsa', 'gegrapha', 'gegrammai', 'egraphēn'],
      stems: ['graph-', 'gram-'] },
    tiers: { technical: { label: 'Technical', scoring: 'always',
      note: 'First tier to cut if the puzzle is too large.' } },
  },
  hūs: {
    id: 'hus', difficulty: 'medium',
    root: { form: 'hūs', transliteration: 'hūs', family: 'germanic', meaning: 'house',
      writtenForms: [
        { language: 'Old English', form: 'hūs' },
        { language: 'Old Norse', form: 'hús' },
        { language: 'Old High German', form: 'hūs' },
        { language: 'Gothic', form: '-hūs', note: 'in gudhūs, “temple”' },
      ],
      stems: ['hūs'] },
    context: 'House, Haus, huis and hus are cousins: none comes from another. They share an older ancestor, reconstructed as Proto-Germanic *hūsą, which was never written down.',
  },
};

// Not-related lists, taken from each draft's Flags notes.
const NOT_RELATED = {
  caput: [
    ...['capture', 'capable', 'accept', 'receive'].map((w) => ({ word: w, lang: 'en', why: 'from Latin capere, “take”, a different root' })),
    { word: 'cap', lang: 'en', why: 'from Late Latin cappa, not caput' },
    { word: 'cape', lang: 'en', sense: 'cloak', why: 'from Late Latin cappa, not caput' },
    { word: 'caper', lang: 'en', why: 'from Latin caper, “goat”' },
    { word: 'Capricorn', lang: 'en', why: 'from Latin caper, “goat”' },
  ],
  graphein: [
    { word: 'carve', lang: 'en', why: 'a very distant cousin from a far older root, not a descendant' },
    ...['grave', 'engrave', 'grab', 'grape'].map((w) => ({ word: w, lang: 'en', why: 'unrelated, despite the look' })),
  ],
  hus: [
    ...['hut', 'hood'].map((w) => ({ word: w, lang: 'en', why: 'may share a far older root with house, but the link lies beyond the written record' })),
    { word: 'hide', lang: 'en', sense: 'conceal', why: 'may share a far older root with house, but the link lies beyond the written record' },
    { word: 'hose', lang: 'en', why: 'a separate word' },
    { word: 'Hose', lang: 'de', sense: 'trousers', why: 'a separate word' },
  ],
  mittere: [],
  ferre: [
    { word: 'tolerate', lang: 'en', why: 'shares an old root with tulī, but does not come from ferre' },
    { word: 'extol', lang: 'en', why: 'from a separate verb, tollere' },
  ],
  dare: [
    ...['dare', 'give'].map((w) => ({ word: w, lang: 'en', why: 'a native English word, not from Latin' })),
    { word: 'date', lang: 'en', sense: 'the fruit', why: 'from Greek, not from dare' },
    ...['dose', 'antidote', 'anecdote'].map((w) => ({ word: w, lang: 'en', why: 'from Greek didōmi, a cousin of dare, not a descendant' })),
    { word: 'añadir', lang: 'es', why: 'from Latin adnectere, not from dare' },
  ],
  bonus: [
    ...[['ameliorate', 'en'], ['optimum', 'en'], ['mejor', 'es'], ['meilleur', 'fr']].map(([w, lang]) => ({
      word: w, lang, why: 'from melior or optimus (“better”, “best”), which come from different roots' })),
    { word: 'boon', lang: 'en', why: 'from Old Norse, not Latin' },
    { word: 'bond', lang: 'en', why: 'unrelated, despite the look' },
    { word: 'bonfire', lang: 'en', why: 'originally a “bone fire”' },
    { word: 'bonito', lang: 'en', sense: 'the fish', why: 'unrelated, despite the look' },
  ],
};

// Spelling fixes to the draft, each recorded in the file's notes.
const CORRECTIONS = { 'note bene': 'nota bene' };

// Tier moves where the draft's table and its own Flags disagree.
const TIER_MOVES = {
  graphein: { 'fr|greffe': 'bonus', 'fr|greffer': 'bonus' },
};

function defaultPath(id, root, lang, tier) {
  const L = LANG_NAMES[lang];
  if (root.family === 'latin') {
    if (id === 'bonus' && tier === 'bene') return `Latin bene, “well” (the adverb of bonus) → ${L}`;
    if (id === 'dare' && tier === 'compounds') return `Latin compound in -dere, “put”, which merged with dare → ${L}`;
    return `Latin ${root.form} → ${L}`;
  }
  if (root.family === 'greek') return `Greek ${root.form} (${root.transliteration}) → ${L}`;
  if (root.family === 'germanic') {
    return {
      en: 'Old English hūs → English',
      de: 'Old High German hūs → German',
      nl: 'Proto-Germanic *hūsą → Dutch (a cousin of Old English hūs)',
      sv: 'Old Norse hús → Swedish',
    }[lang];
  }
  throw new Error(`no path rule for ${id}`);
}

// Routes the draft's Flags spell out.
function specialPath(id, word, lang) {
  const n = normalize(word);
  const L = LANG_NAMES[lang];
  switch (id) {
    case 'mittere':
      if (lang === 'en' && n === 'mess') return 'Latin missus, “a course sent to the table” (from mittere) → English';
      break;
    case 'ferre':
      if (n.startsWith('legisla')) return `Latin lex, “law”, + lātor, “proposer” (from ferre) → ${L}`;
      if (n === 'oblea' || n === 'oublie') return `Latin oblāta, “offering” (from ferre) → ${L}`;
      break;
    case 'dare':
      if (/mand|mend/.test(n)) return `Latin manus, “hand”, + dare, “put in someone’s hand” → ${L}`;
      break;
    case 'caput':
      if (n.startsWith('precip')) return `Latin prae + caput → praeceps, “headfirst” → ${L}`;
      if ((lang === 'es' && n === 'jefe') || (lang === 'pt' && n === 'chefe')) return `Latin caput → French chef → ${L}`;
      if (n === 'corporal' || n === 'caporal') return `Latin caput → Italian capo, “head” → caporale → ${L}`;
      break;
    case 'graphein':
      if (n === 'gram' || n === 'gramo' || n === 'grama' || n === 'gramme' || n.startsWith('kilogram') || n === 'quilograma')
        return `Greek γράμμα (gramma) → Late Latin gramma, “a small weight” → ${L}`;
      if (n.startsWith('program')) return `Greek pro-, “before”, + γράμμα (gramma), “something written” → ${L}`;
      if (n.startsWith('cartograf') || n.startsWith('cartograph')) return `Latin carta, “map”, + Greek γράφω (graphō) → ${L}`;
      if (n === 'glamour') return 'Greek γράμμα (gramma) → English grammar → Scottish glamour → English';
      if (n === 'grimoire') return 'Greek γράμμα (gramma) → French grammaire → grimoire';
      if (n === 'graft' || n.startsWith('greff')) return `Latin graphium, “stylus”, from Greek γράφω (graphō) → ${L}`;
      if (n.includes('gram')) return `Greek γράμμα (gramma), “letter, something written”, from γράφω → ${L}`;
      break;
    case 'hus':
      if (n === 'husband') return 'Old Norse húsbóndi, “master of the house” → English';
      if (n === 'hustings') return 'Old Norse húsþing, “house assembly” → English';
      if (n === 'hussy') return 'Old English hūs → housewife → shortened to hussy';
      break;
  }
  return null;
}

function parseTier(raw) {
  const t = raw.trim().toLowerCase();
  if (t.startsWith('core')) return 'core';
  if (t.startsWith('bene')) return 'bene';
  return t;
}

function splitWord(raw) {
  const m = raw.trim().match(/^(.*?)\s*\(([^)]*)\)$/);
  return m ? { word: m[1].trim(), gloss: m[2].trim() } : { word: raw.trim() };
}

function parseSections(md) {
  const sections = [];
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^## \*([^*]+)\*/);
    if (h) {
      cur = { key: h[1], rows: [], notes: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells[0] === 'Language' || /^-+$/.test(cells[0])) continue;
      cur.rows.push({ lang: cells[0], tier: cells[1], words: cells[2] });
    } else if (line.startsWith('- ')) {
      cur.notes.push(line.slice(2).trim());
    } else if (line.trim() && !line.startsWith('**')) {
      cur.notes.push(line.trim());
    }
  }
  return sections;
}

function build(section) {
  const meta = META[section.key];
  if (!meta) throw new Error(`no metadata for draft section ${section.key}`);
  const { id, root } = meta;
  const languages = [...new Set(section.rows.map((r) => LANGS[r.lang]))];
  const notes = section.notes.map((n) => `Draft: ${n}`);
  const entries = [];
  const seen = new Map();
  const tierMoves = TIER_MOVES[id] ?? {};

  for (const row of section.rows) {
    const lang = LANGS[row.lang];
    const draftTier = parseTier(row.tier);
    for (const piece of row.words.split(',')) {
      let { word, gloss } = splitWord(piece);
      if (CORRECTIONS[word]) {
        notes.push(`Import: the draft lists “${word}”; corrected to “${CORRECTIONS[word]}”.`);
        word = CORRECTIONS[word];
      }
      let tier = draftTier;
      const moved = tierMoves[`${lang}|${word}`];
      if (moved) {
        notes.push(`Import: ${LANG_NAMES[lang]} “${word}” is ${tier} in the draft table but bonus-tier in its Flags; moved to ${moved}. Confirm.`);
        tier = moved;
      }
      const dupKey = `${lang}|${normalize(word)}`;
      if (seen.has(dupKey)) {
        const first = seen.get(dupKey);
        first.variants.push(word);
        notes.push(`Import: ${LANG_NAMES[lang]} “${word}” is another spelling of “${first.word}”; kept as a variant.`);
        continue;
      }
      const entry = {
        word, lang, tier,
        ...(gloss ? { gloss } : {}),
        path: specialPath(id, word, lang) ?? defaultPath(id, root, lang, tier),
        variants: [],
        reviewed: false,
      };
      seen.set(dupKey, entry);
      entries.push(entry);
    }
  }

  const tiers = { core: { label: 'Core', scoring: 'always' } };
  for (const e of entries) {
    if (tiers[e.tier]) continue;
    tiers[e.tier] = meta.tiers?.[e.tier] ?? { label: e.tier[0].toUpperCase() + e.tier.slice(1), scoring: e.tier === 'bonus' ? 'bonus' : 'always' };
  }

  return {
    id,
    status: 'draft',
    root,
    languages,
    difficulty: meta.difficulty,
    tiers,
    ...(meta.context ? { context: meta.context } : {}),
    entries,
    notRelated: (NOT_RELATED[id] ?? []).map((n) => ({ ...n, reviewed: false })),
    notes,
  };
}

const md = readFileSync(join(repo, 'docs/draft-keys.md'), 'utf8');
for (const section of parseSections(md)) {
  const puzzle = build(section);
  const out = join(repo, 'keys', `${puzzle.id}.json`);
  if (existsSync(out) && !force) {
    console.log(`skip ${out} (exists; use --force to overwrite)`);
    continue;
  }
  writeFileSync(out, JSON.stringify(puzzle, null, 2) + '\n');
  console.log(`wrote keys/${puzzle.id}.json  ${puzzle.entries.length} entries`);
}

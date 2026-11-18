import { normalize } from './normalize.js';

export const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', pt: 'Portuguese', fr: 'French',
  de: 'German', nl: 'Dutch', sv: 'Swedish',
};

export const DEFAULT_TIERS = {
  core: { label: 'Core', scoring: 'always' },
  bonus: { label: 'Bonus', scoring: 'bonus' },
};

export function entryId(entry) {
  return `${entry.root ?? ''}|${entry.lang}|${entry.word}`;
}

// Takes a key file as written on disk and returns a puzzle ready to play:
// a single-root puzzle and a bundle look the same afterwards (`roots` is always
// a list), every entry has an `id`, and lookups by typed text are indexed.
export function preparePuzzle(raw) {
  const roots = raw.roots ?? [{ id: raw.id, ...raw.root }];
  const defaultRoot = roots[0].id;
  const tiers = { ...DEFAULT_TIERS, ...(raw.tiers ?? {}) };

  const entries = raw.entries.map((e) => {
    const entry = { variants: [], ...e, root: e.root ?? defaultRoot };
    return { ...entry, id: entryId(entry) };
  });

  const index = new Map();
  for (const entry of entries) {
    for (const form of new Set([entry.word, ...entry.variants].map(normalize))) {
      if (!index.has(form)) index.set(form, []);
      index.get(form).push(entry);
    }
  }

  const notRelated = raw.notRelated ?? [];
  const notRelatedIndex = new Map();
  for (const item of notRelated) {
    const form = normalize(item.word);
    if (!notRelatedIndex.has(form)) notRelatedIndex.set(form, []);
    notRelatedIndex.get(form).push(item);
  }

  return {
    ...raw,
    roots,
    tiers,
    entries,
    entriesById: new Map(entries.map((e) => [e.id, e])),
    notRelated,
    index,
    notRelatedIndex,
  };
}

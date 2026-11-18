import { normalize } from './normalize.js';

// Checks one typed word against a prepared puzzle.
// `found` is a Set of entry ids the player already has.
// Returns one of:
//   { kind: 'empty' }
//   { kind: 'new', entries, alreadyFound }   at least one entry newly credited
//   { kind: 'repeat', entries }              every matching entry already found
//   { kind: 'notRelated', items }            a listed lookalike
//   { kind: 'unknown', text }                not in this puzzle
export function checkGuess(puzzle, typed, found) {
  const form = normalize(typed);
  if (!form) return { kind: 'empty' };

  const matches = puzzle.index.get(form);
  if (matches) {
    const fresh = matches.filter((e) => !found.has(e.id));
    const alreadyFound = matches.filter((e) => found.has(e.id));
    if (fresh.length) return { kind: 'new', entries: fresh, alreadyFound };
    return { kind: 'repeat', entries: matches };
  }

  const lookalikes = puzzle.notRelatedIndex.get(form);
  if (lookalikes) return { kind: 'notRelated', items: lookalikes };

  return { kind: 'unknown', text: typed.trim() };
}

# Roots

A daily word puzzle: one ancient root, and as many modern words grown from it as the player can find, in English, Spanish, Portuguese and French (or English, German, Dutch and Swedish for Germanic roots).

The full design is in [docs/design.md](docs/design.md). The original drafts of the answer keys are in [docs/draft-keys.md](docs/draft-keys.md).

## Run it

You need Node 18 or later. There are no dependencies and no build step.

```bash
npm run serve        # http://localhost:8080
npm test             # matching, scoring, share, schedule and checker tests
npm run check        # checks every key file
npm run e2e          # phone-sized play-through (needs Playwright + Chromium)
```

For testing, the URL accepts `?date=2026-11-19` to pretend it is that day, and `?puzzle=ferre` to play any key outside the schedule.

## Layout

| Path | What it is |
| --- | --- |
| `keys/<id>.json` | One answer key per puzzle; the source of truth, edited by hand |
| `keys/schedule.json` | One puzzle per date; the puzzle number is its position in the list |
| `src/engine/` | Pure logic with no DOM: normalizing, matching, scoring, share text, schedule |
| `src/ui/game.js`, `game.css` | The whole game as one embeddable piece, `mountGame(element, options)` |
| `index.html` | A standalone page that mounts the game |
| `tools/check-keys.mjs` | The key checker |
| `tools/import-drafts.mjs` | The one-time converter from `docs/draft-keys.md` (will not overwrite existing keys) |

## Key files

```json
{
  "id": "caput",
  "status": "draft",
  "root": { "form": "caput", "transliteration": "caput", "family": "latin", "meaning": "head",
            "principalParts": ["caput", "capitis"], "stems": ["capit-"] },
  "languages": ["en", "es", "pt", "fr"],
  "difficulty": "easy",
  "tiers": { "core": { "label": "Core", "scoring": "always" },
             "bonus": { "label": "Bonus", "scoring": "bonus" } },
  "entries": [
    { "word": "cape", "lang": "en", "tier": "core", "gloss": "headland",
      "path": "Latin caput → English", "variants": [], "reviewed": false }
  ],
  "notRelated": [
    { "word": "cape", "lang": "en", "sense": "cloak", "why": "from Late Latin cappa, not caput", "reviewed": false }
  ],
  "notes": ["Draft: …"]
}
```

- **status**: `draft` or `ready`. The checker fails a `ready` puzzle that has any unreviewed entry.
- **tiers**: each puzzle names its own tiers. `scoring: "always"` counts like core, and `scoring: "bonus"` follows the player's bonus setting. *dare* has a `compounds` tier, *graphō* has `technical`, and *bonus* has `bene`. All three count as core for now; change one word in the file to try them as bonus.
- **gloss / sense**: tell apart two words with the same spelling (*cape* the headland counts; *cape* the cloak does not).
- **variants**: extra accepted spellings and endings. Matching already ignores capitals, accents, hyphens and apostrophes, but it never guesses endings, so *chefs* is accepted only if it is listed.
- **Bundles**: use `"roots": [{ "id": …, … }, …]` instead of `root`, and give every entry a `root`. The engine and checker support this; no bundle puzzle exists yet.
- **notes**: the draft's Flags notes, copied word for word, plus anything the import changed.

## Embedding in the practice app

```js
import { mountGame } from './src/ui/game.js';   // and load src/ui/game.css
mountGame(el, {
  keysUrl: '/roots/keys/',
  onFlag: (flag) => api.post('/roots/flags', flag),  // "It belongs" suggestions
  storage: myStorage,                                // optional getItem/setItem
  shareUrl: 'https://…',
});
```

All styles are scoped under `.roots-game`. Without `onFlag`, suggestions are kept in local storage and can be copied from the reveal screen.

## Bonus scoring setting

The setting is on the Today screen, because the design leaves it open. It has three modes:

- `off`: bonus words are accepted but not scored.
- `extra`: bonus words add to the score, which can pass 100%.
- `counted`: bonus words count like core words.

# Word Roots Game: Design Doc

Nov 17, 2026 · @Jack

## Overview

A daily puzzle where the player sees one ancient root and finds as many modern words descended from it as they can, across several languages. A player who has never studied Latin or Greek still learns why *chef*, *capital* and *cabeza* are cousins.

- **Audience:** word-game players (the Wordle and Spelling Bee crowd), learners of Spanish, French, Portuguese and German, Spanish and Portuguese speakers learning English, and test-prep students. Latin and Greek students are a welcome bonus, not the target.
- **Pitch:** "Find every word that grows from this root." The game is never described as a Latin game.
- **Root sources:** Latin, Greek and Germanic.
- **First release:** three starter puzzles inside the existing practice app, tested with real word-game players before anything larger is built. A standalone site or app comes later.
- **Long term:** the free daily puzzle brings people in; the paid product is the surrounding practice app and classroom tools.

## How a puzzle plays

Each puzzle shows one root and asks for every word the player can think of that descends from it, in the languages the puzzle names. The default is untimed; a 60-second blitz mode is optional.

**What the player sees**

- The root in its own script (Greek letters where relevant), a plain-English transliteration, and a one-line meaning.
- The languages in play for this puzzle, shown as tags.
- A word box, a running list of accepted words grouped by language, and the total number of words hidden in the key for each language (the words themselves stay hidden).

**Scoring**

- Every key word is worth the same: one point, however common or rare.
- The score is words found out of total key words, shown as a percentage.
- Bonus-tier words (real but indirect descendants) are supported in the key files. Whether they score, and whether they can push a result past 100%, is undecided, so the first build makes it a setting that can be switched on and off and tried.
- Each language counts separately: *nation*, *nación*, *nação* and *nation* are four finds.

**Ranks** (proposed thresholds, shown as a progress bar)

| Rank | Share of total words |
| --- | --- |
| Seed | 0% |
| Sprout | 10% |
| Shoot | 25% |
| Branch | 40% |
| Trunk | 55% |
| Canopy | 70% |
| Taproot | 90% |

**Finishing:** the player taps Finish (or the blitz timer ends) and sees the full reveal: every key word, found ones marked, each with its path from the root. The reveal is the main teaching moment.

**Hints:** optional, up to three per puzzle; a hint shows the first letter and language of one unfound word and lowers the final score slightly.

## One root or several

Puzzles come in two shapes, and the number of words to find stays near 100 either way, with room for roughly 60 to 140.

- **Single-root puzzles** use one root with a large family (*dare*, *ferre*, *mittere*). The found list groups by language.
- **Bundle puzzles** use three to five roots with smaller families, shown together as root cards. The found list groups by root, then by language. Bundles work best when the roots share a family, so the languages match; a bundle that mixes families shows a language tag on every word.
- **Size target:** about 100 key words per puzzle. A family that is too large is trimmed to its most recognizable words or split into two puzzles; small families are combined into a bundle.
- **Schedule:** the calendar alternates between the two shapes, with some weeks single-root and others bundled.
- **Scoring is identical for both shapes:** one point per word, a percentage, and the same rank bar, so results compare across puzzles.
- **A word that fits two roots in the same bundle** (*television* under *tele* and *videre*) counts once for each root it is listed under.

In the key files, a bundle holds a list of roots, and every entry names the root it belongs to.

## Root families and counting rules

Every puzzle starts from the oldest written form of its root. Latin and Greek puzzles count descendants; Germanic puzzles count cousins.

**The oldest-form rule.** The puzzle word is the earliest form with real written evidence: Classical Latin, Ancient Greek, Old English, Old Norse or Gothic. Proto-Indo-European is never used. Reconstructed roots are never the puzzle word, but the reveal may show a Proto-Germanic ancestor as extra context.

| Family | What counts | Default languages | Example |
| --- | --- | --- | --- |
| Latin | Words descended from the root, including through French, Spanish and Portuguese | English, Spanish, Portuguese, French | *caput*: chief, chef, cabeza |
| Greek | Words descended from the root, including those that passed through Latin | English, Spanish, Portuguese, French | *graphō*: grammar, programa |
| Germanic | Words that share an ancestor with the root (cousins), plus English words from Old English and Old Norse | English, German, Dutch, Swedish | *hūs*: house, Haus, huis, hus |

**Counting rules**

- A word must truly come from the root. Lookalikes do not count; the reveal lists the notable ones as "not related."
- A word counts in the language that uses it. English *chef* and French *chef* are two finds.
- Compounds and prefixed forms count when the root is a clear part (*admit, permit* under *mittere*; *television* under both *tele* and *videre*).
- Words that come from a different but merged root go in a separate tier, decided puzzle by puzzle (the *-dere* compounds under *dare*).
- Indirect descendants (English *mess* and *Mass* under *mittere*) go in the bonus tier.
- Proper nouns and brand names are excluded.
- Technical terms count only if they appear in a standard learner's dictionary.

## Answer key format

Each puzzle is one data file that holds the root, its meaning, and every accepted word. The vetted key is the most valuable part of the project, so it lives in plain files that can be read and corrected by hand.

Each file has three parts:

1. **Root details:** the original form, its script and transliteration, the family (Latin, Greek or Germanic), the meaning, all the principal parts (four for a Latin verb, six for a Greek verb; nominative and genitive for a noun) and the stems, the languages in play, and a difficulty label.
2. **Entries:** one per accepted word, with its language, tier (core or bonus), the path from the root, and accepted spelling variants.
3. **Not related:** notable lookalikes that do not count, each with a one-line reason, shown in the reveal.

```json
{
  "id": "caput",
  "root": { "form": "caput", "family": "latin", "meaning": "head", "stems": ["capit-"] },
  "languages": ["en", "es", "pt", "fr"],
  "difficulty": "medium",
  "entries": [
    { "word": "chief", "lang": "en", "tier": "core",
      "path": "Latin caput → Old French chief → English",
      "variants": ["chiefs"] },
    { "word": "cabeza", "lang": "es", "tier": "core",
      "path": "Latin caput → Vulgar Latin *capitia → Spanish",
      "variants": ["cabezas"] }
  ],
  "notRelated": [
    { "word": "cape (clothing)", "lang": "en", "why": "from Late Latin cappa, not caput" }
  ]
}
```

**Rules for the files**

- One file per puzzle, named by the root (`caput.json`, `graphein.json`).
- Every entry is vetted by a person before a puzzle is published. Drafts are marked unreviewed.
- Spelling variants cover accents and plural or verb endings, so the player is not punished for typing *nacion* for *nación*.
- Entries are never deleted without a note; a word dropped from the key is moved to Not related with a reason.

## Checking answers

A typed word is accepted when it matches a key entry or one of that entry's listed variants, ignoring capitals and accent marks. The app does not guess at word endings; the variants list handles them.

- **Accents:** *nacion* matches *nación*. The word is displayed with its correct accents once accepted.
- **Shared spellings:** one typed word credits every language that spells it the same way (*nation* earns English and French together).
- **Repeats:** a word already found is acknowledged, not scored again.
- **Lookalikes:** a word on the Not related list gets a short "close, but not from this root" message and no credit.
- **Unknown words:** a word not in the key gets a neutral "not in this puzzle" message and no penalty.
- **Missing words:** a "this belongs" button lets the player flag an unlisted word. Flags go to a review list; approved words join the key. This is how the keys improve over time.

**Keeping the key hidden.** The first test version can ship each key with the page. Later, answers are checked on the server and the full list is released only after the player finishes, so it cannot be read in advance.

## Screens and the shareable result

The game is built for phones first, played one-handed in a few minutes, with a result players want to post. Three screens carry the whole game.

1. **Today.** The day's puzzle with its root, its principal parts, meaning and language tags, a Start button, and a link to the archive of past puzzles.
2. **Play.** A large word box, a row of accent keys (é, ñ, ç, ã, ü, ß) that changes with the puzzle's languages, found words grouped under one tab per language, the rank bar, and a Finish button.
3. **Reveal.** The score and rank, then every key word grouped by language, found ones marked and missed ones shown with their path from the root. The Not related list closes the screen.

**Design notes**

- The look is quiet and bookish, with generous type. It should not resemble Wordle or any other existing game.
- Color never carries meaning alone; found and missed words also differ by marker and label.
- The Greek alphabet and all accented letters must display correctly everywhere.

**The shareable result.** A short block of text with no spoilers: the puzzle number, the root, the rank, the score, and one bar per language showing how much was found.

```text
Roots #14 · caput
Taproot · 41 of 58 words (71%)
EN ■■■■■■□□
ES ■■■■□□□□
PT ■■■□□□□□
FR ■■■■■□□□
```

The share block is the main growth mechanism: it is how Wordle spread, and it costs nothing to build.

## Starter puzzles

The test release uses three puzzles, one per root family: *caput*, *graphō* and *hūs*. All seven keys are drafted and waiting for review in the Draft Keys tab.

| Puzzle | Family | Languages | Status | Why it is here |
| --- | --- | --- | --- | --- |
| *caput* (head) | Latin | EN, ES, PT, FR | Drafted, unreviewed | Best opener: *chief, chef, capital, cabeza* show how far one word travels |
| *graphō* (write) | Greek | EN, ES, PT, FR | Drafted, unreviewed | Tests Greek script display; *grammar, program, telegram, diagram* |
| *hūs* (house) | Germanic | EN, DE, NL, SV | Drafted, unreviewed | Tests the cousins rule; *house, Haus, huis, hus*; the German side needs a fluent reader's check |
| *mittere* (send) | Latin | EN, ES, PT, FR | Drafted, unreviewed | Two stems (*mitt-*, *miss-*); *mess* and *Mass* are bonus-tier |
| *ferre* (carry) | Latin | EN, ES, PT, FR | Drafted, unreviewed | The *lat-* stem hides *relate, translate, elate* |
| *dare* (give) | Latin | EN, ES, PT, FR | Drafted, unreviewed | About 120 entries; may split into two puzzles; *-dere* compounds need a tier decision |
| *bonus* (good) | Latin | EN, ES, PT, FR | Drafted, unreviewed | *bon-* words are core; *bene-* words are a second tier |

**Later candidates:** *tenere* (hold), *ponere* (put), Greek *logos* and *bios*, and *melior* and *optimus* as their own puzzles, since they are not descended from *bonus*.

**Difficulty order for the first batch:** *bonus* and *caput* easy, *graphō* and *hūs* medium, *mittere* and *ferre* hard, *dare* hardest.

## Build plan for Claude Code

Build the answer keys and their checks first, then the screens, so the game is never built on unverified data. The steps below are in order; each should work and be tested before the next begins.

1. **Key files.** Create one data file per puzzle in the format above. Start with *caput*, *graphō* and *hūs*, then convert the four drafts from the Draft Keys tab. Mark every converted entry unreviewed.
2. **Key checker.** A small script that reads every puzzle file and reports problems: missing fields, duplicate words, a word that is both core and Not related, entries with no path, and unreviewed entries in a puzzle marked ready to publish.
3. **Answer matching, with tests.** Cover accent-free typing (*nacion*), shared spellings (*nation* credits English and French), repeats, lookalikes, and unknown words.
4. **Play screen.** One web page, phone first, untimed. Word box, accent keys, per-language tabs, found-word list.
5. **Scoring and ranks.** One point per word, the percentage, the rank bar, and a setting that turns bonus-tier scoring on or off.
6. **Reveal screen.** Full key with found words marked, each word's path, and the Not related list.
7. **Share block.** The spoiler-free text result with a copy button.
8. **Blitz mode.** The 60-second version, using the same keys and reveal.
9. **Daily schedule and archive.** One puzzle per date, and a list of past puzzles.
10. **Flag-a-word.** The "this belongs" button, saving to a review list.
11. **Home for the game.** Build the game as a self-contained piece, so it runs inside the practice app now and can move to its own site or app later.

**Working rules for the session**

- Never invent etymologies. Any new key entry is added as unreviewed, with its path, for a person to vet.
- Keep explanations on screen in plain words; the player should never see technical terms.
- Test on a phone-sized screen at every step.

**Done when:** the three starter puzzles play start to finish on a phone, the share block copies correctly, the key checker passes with no errors, and ten real players have tried it.

## Growth and monetization

The puzzle stays free; money comes from what sits around it. Revenue should be expected to start small, because the audience begins in the thousands, not the millions that made Wordle worth buying.

**Ways to earn, in order of promise**

1. **A paid practice app.** The free puzzle is the front door; subscribers get the archive, practice mode, and full word families.
2. **Classroom licenses.** Teachers of Latin, world languages and English vocabulary pay for assignable puzzles, class results and student progress.
3. **Word-family packs.** The vetted keys become printable sets and workbooks.
4. **Not ads.** An audience this size does not earn meaningful ad revenue.

**How it spreads**

- The share block on every result.
- Posts in word-game and language-learning communities.
- A daily email with the puzzle link.
- Teachers, who bring whole classes at once.

**What to measure in the test release:** the share of players who return the next day, and how many results get shared. Strong numbers on both justify building the paid layer; weak numbers mean fixing the game first.

## Open questions

- [ ] Germanic puzzles: true cousins across languages (*house, Haus, huis*), or only English words from Old English and Old Norse? Decided: cousins. To be judged once the first Germanic puzzle is playable.
- [ ] May the reveal mention reconstructed Proto-Germanic forms, or stay strictly with written evidence? - YES
- [ ] Decided: the game lives inside the practice app first, with its own site or app later. Open: how to keep the game code separate enough that it can move without a rewrite.
- [ ] Working name. "Radix" (Latin for root) is one candidate.
- [ ] Should the *-dere* compounds under *dare* (*add, edit, tradition, render, vend*) count as core or bonus?
- [ ] Should *dare* be one puzzle of about 120 entries or two?
- [ ] Keep hints, or drop them for the first release?
- [ ] Which features are free and which are paid once the practice app is attached?

* [ ] Bonus tier: keep, change or drop? To be decided after playing; the first build treats it as a setting.
* [ ] Single-root and bundle weeks: Decided: one puzzle per day, with the shape (single root or bundle) changing by week.

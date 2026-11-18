// Roots: the game as one self-contained piece.
//
//   import { mountGame } from './src/ui/game.js';
//   mountGame(document.getElementById('app'), { keysUrl: './keys/' });
//
// Options (all optional):
//   keysUrl     where schedule.json and the puzzle files live (default ./keys/)
//   storage     an object with getItem/setItem (default: localStorage, if usable)
//   onFlag      called with { puzzle, word, lang, date } when a player says a word
//               belongs; without it, flags are kept in storage for export
//   today       'YYYY-MM-DD' to override the date (default: the player's local date)
//   puzzle      a puzzle id to play outside the schedule (for testing)
//   shareUrl    a link added to the end of the share text
//   theme       'light' | 'dark' to force a theme (default: follows the device)
//
// The page's own URL may also set ?puzzle=<id> and ?date=YYYY-MM-DD for testing.
import { preparePuzzle, LANGUAGE_NAMES } from '../engine/puzzle.js';
import { checkGuess } from '../engine/match.js';
import { computeScore, RANKS, BONUS_MODES } from '../engine/score.js';
import { buildShareText, GAME_NAME } from '../engine/share.js';
import { dateKey, puzzleForDate, archive, numberedDays } from '../engine/schedule.js';

const BLITZ_SECONDS = 60;
const STORE = 'roots:v1:';
const ACCENTS = {
  en: [],
  es: ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü'],
  pt: ['á', 'é', 'í', 'ó', 'ú', 'ã', 'õ', 'â', 'ê', 'ô', 'ç', 'à'],
  fr: ['é', 'è', 'ê', 'à', 'â', 'ç', 'î', 'ô', 'û', 'ë', 'ï', 'œ'],
  de: ['ä', 'ö', 'ü', 'ß'],
  nl: ['é', 'ë', 'ï'],
  sv: ['å', 'ä', 'ö'],
};
const ROOT_LANG_ATTR = { latin: 'la', greek: 'grc', germanic: 'ang' };
const FAMILY_NAMES = { latin: 'Latin', greek: 'Ancient Greek', germanic: 'Old English' };
const BONUS_LABELS = {
  off: 'Bonus words are accepted but not scored',
  extra: 'Bonus words add to the score (can pass 100%)',
  counted: 'Bonus words count like any other word',
};

const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const langName = (l) => LANGUAGE_NAMES[l] ?? l;

function makeStore(custom) {
  let backing = custom;
  if (!backing) {
    try { backing = window.localStorage; backing.getItem('x'); } catch { backing = null; }
  }
  const memory = new Map();
  return {
    get(key, fallback) {
      try {
        const raw = backing ? backing.getItem(STORE + key) : memory.get(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { if (backing) backing.setItem(STORE + key, raw); else memory.set(key, raw); } catch { memory.set(key, raw); }
    },
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export async function mountGame(container, options = {}) {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const keysUrl = (options.keysUrl ?? './keys/').replace(/\/?$/, '/');
  const store = makeStore(options.storage);
  const today = options.today ?? params.get('date') ?? dateKey(new Date());
  const freePuzzle = options.puzzle ?? params.get('puzzle');

  container.classList.add('roots-game');
  if (options.theme) container.dataset.theme = options.theme;
  container.innerHTML = '<div class="rg-wrap"><p class="rg-muted">Loading…</p></div>';

  const cache = new Map();
  async function loadPuzzle(id) {
    if (!cache.has(id)) {
      cache.set(id, fetch(`${keysUrl}${encodeURIComponent(id)}.json`).then((r) => {
        if (!r.ok) throw new Error(`Could not load puzzle “${id}”.`);
        return r.json();
      }).then(preparePuzzle));
    }
    return cache.get(id);
  }

  let schedule = { days: [] };
  try {
    const r = await fetch(`${keysUrl}schedule.json`);
    if (r.ok) schedule = await r.json();
  } catch { /* the game still works with ?puzzle= */ }

  const settings = { bonusMode: 'off', ...store.get('settings', {}) };
  let timer = null;
  let game = null; // { day, puzzle, saveKey, progress }

  const wrap = (inner) => { container.innerHTML = `<div class="rg-wrap">${inner}</div>`; };
  const header = (right = '') => `
    <header class="rg-top"><span class="rg-brand">${h(GAME_NAME)}</span>${right}</header>`;

  function toast(msg) {
    container.querySelector('.rg-toast')?.remove();
    const t = document.createElement('div');
    t.className = 'rg-toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function rootLabel(puzzle) {
    return puzzle.roots.map((r) => r.transliteration).join(' + ');
  }

  function saveProgress() { store.set(game.saveKey, game.progress); }

  function score() {
    return computeScore(game.puzzle, new Set(game.progress.found), settings.bonusMode);
  }

  async function openDay(day) {
    stopTimer();
    try {
      const puzzle = await loadPuzzle(day.puzzle);
      const saveKey = `progress:${day.date ?? 'free'}:${puzzle.id}`;
      const progress = { found: [], mode: null, blitzEndsAt: null, finished: false, ...store.get(saveKey, {}) };
      game = { day, puzzle, saveKey, progress };
      if (progress.mode === 'blitz' && !progress.finished && progress.blitzEndsAt && Date.now() >= progress.blitzEndsAt) {
        progress.finished = true;
        saveProgress();
      }
      renderToday();
    } catch (e) {
      wrap(`${header()}<p>${h(e.message)}</p>`);
    }
  }

  // ---------- Today ----------
  function formsHtml(root) {
    if (root.family === 'germanic') {
      return `<p class="rg-parts">Written as ${root.writtenForms.map((f) =>
        `${h(f.language)} <i lang="${ROOT_LANG_ATTR.germanic}">${h(f.form)}</i>${f.note ? ` (${h(f.note)})` : ''}`).join(' · ')}</p>`;
    }
    if (root.family === 'greek') {
      return `<p class="rg-parts">Forms: ${root.principalParts.map((p, i) =>
        `<i lang="grc">${h(p)}</i> <span class="rg-muted">(${h(root.principalPartsTransliterated?.[i] ?? '')})</span>`).join(', ')}</p>`;
    }
    return `<p class="rg-parts">Forms: <i lang="la">${root.principalParts.map(h).join(', ')}</i></p>`;
  }

  function renderToday() {
    stopTimer();
    const { day, puzzle, progress } = game;
    const s = score();
    const root = puzzle.roots[0];
    const started = progress.found.length > 0 || progress.mode;
    const total = s.total;
    const dateLine = day.number
      ? `No. ${day.number} · ${new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`
      : 'Practice puzzle';

    let actions;
    if (progress.finished) {
      actions = `<button class="rg-btn" data-act="reveal">See your result</button>`;
    } else if (started) {
      actions = `<button class="rg-btn" data-act="continue">Continue</button>`;
    } else {
      actions = `<button class="rg-btn" data-act="start">Start</button>
        <button class="rg-btn rg-ghost" data-act="blitz">60-second blitz</button>`;
    }

    wrap(`${header('<button class="rg-link" data-act="archive">Past puzzles</button>')}
      <main>
        <section class="rg-card" aria-labelledby="rg-root">
          <p class="rg-kicker">${h(dateLine)}</p>
          ${puzzle.roots.map((r) => `
            <h1 id="rg-root" class="rg-root" lang="${ROOT_LANG_ATTR[r.family] ?? ''}">${h(r.form)}</h1>
            ${r.transliteration !== r.form ? `<p class="rg-translit">${h(r.transliteration)}</p>` : ''}
            <p class="rg-meaning">“${h(r.meaning)}” <span class="rg-muted rg-small">· ${h(FAMILY_NAMES[r.family] ?? '')}</span></p>
            ${formsHtml(r)}`).join('')}
          <ul class="rg-tags" aria-label="Languages in play">
            ${puzzle.languages.map((l) => `<li class="rg-tag">${h(langName(l))}</li>`).join('')}
          </ul>
          ${puzzle.status !== 'ready' ? '<p class="rg-draft">Test puzzle: this word list has not been checked yet.</p>' : ''}
        </section>
        <section class="rg-section">
          <p>Find as many words as you can that grow from <i>${h(root.transliteration)}</i>, in any of these languages. There are <strong>${total}</strong> to find${puzzle.difficulty ? ` · ${h(puzzle.difficulty[0].toUpperCase() + puzzle.difficulty.slice(1))}` : ''}.</p>
          ${started && !progress.finished ? `<p class="rg-muted rg-small" style="margin-top:6px">So far: ${s.found} of ${total} words, ${h(s.rank.name)}.</p>` : ''}
          <div class="rg-btn-row" style="margin-top:16px">${actions}</div>
        </section>
        <section class="rg-settings">
          <label for="rg-bonus">Bonus words (real but indirect descendants)</label>
          <select id="rg-bonus">${BONUS_MODES.map((m) => `<option value="${m}" ${m === settings.bonusMode ? 'selected' : ''}>${h(BONUS_LABELS[m])}</option>`).join('')}</select>
        </section>
      </main>`);

    container.querySelector('#rg-bonus').addEventListener('change', (e) => {
      settings.bonusMode = e.target.value;
      store.set('settings', settings);
      renderToday();
    });
    bind({
      archive: renderArchive,
      reveal: renderReveal,
      continue: renderPlay,
      start: () => { progress.mode = 'untimed'; saveProgress(); renderPlay(); },
      blitz: () => {
        progress.mode = 'blitz';
        progress.blitzEndsAt = Date.now() + BLITZ_SECONDS * 1000;
        saveProgress();
        renderPlay();
      },
    });
  }

  function bind(actions) {
    container.querySelectorAll('[data-act]').forEach((el) => {
      const fn = actions[el.dataset.act];
      if (fn) el.addEventListener('click', fn);
    });
  }

  // ---------- Play ----------
  function rankBarHtml(s, { compact = false } = {}) {
    const pct = Math.min(100, s.percent);
    const need = s.next ? Math.max(1, Math.ceil((s.next.min * s.total) / 100) - s.found) : 0;
    const nextLine = s.next ? `${need} more to ${h(s.next.name)}` : 'Top rank';
    const bar = `
      <div class="rg-bar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.percentShown}">
        <div class="rg-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="rg-ticks" aria-hidden="true">${RANKS.slice(1).map((r) => `<span style="left:${r.min}%">${r.min}</span>`).join('')}</div>`;
    if (compact) return `${bar}<p class="rg-muted rg-small">${nextLine}</p>`;
    return `
      <div class="rg-rank-line">
        <span><span class="rg-rank-name">${h(s.rank.name)}</span> <span class="rg-muted">· ${s.found} of ${s.total} (${s.percentShown}%)</span></span>
        <span class="rg-muted rg-small">${nextLine}</span>
      </div>${bar}`;
  }

  function renderPlay() {
    const { puzzle, progress } = game;
    if (progress.finished) return renderReveal();
    const accents = [...new Set(puzzle.languages.flatMap((l) => ACCENTS[l] ?? []))];
    let tab = puzzle.languages[0];
    const freshIds = new Set();

    wrap(`
      <div class="rg-play-head">
        <span class="rg-play-root" lang="${ROOT_LANG_ATTR[puzzle.roots[0].family] ?? ''}">${h(puzzle.roots[0].form)}<small>“${h(puzzle.roots[0].meaning)}”</small></span>
        ${progress.mode === 'blitz' ? '<span class="rg-timer" aria-live="off"></span>' : '<button class="rg-link" data-act="home">Puzzle info</button>'}
      </div>
      <div class="rg-rank"></div>
      <form class="rg-form" autocomplete="off">
        <label class="rg-visually-hidden" for="rg-word">Type a word</label>
        <input id="rg-word" class="rg-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Type a word">
        <button class="rg-btn" type="submit">Enter</button>
      </form>
      ${accents.length ? `<div class="rg-accents" aria-label="Accented letters (optional: words match without them)"><span class="rg-accents-note">Accents optional</span>${accents.map((a) => `<button type="button" class="rg-key" data-char="${h(a)}">${h(a)}</button>`).join('')}</div>` : ''}
      <div class="rg-feedback" aria-live="polite"></div>
      <div class="rg-tabs" role="tablist" aria-label="Found words by language"></div>
      <div class="rg-panel" role="tabpanel"></div>
      <div class="rg-finish"><button class="rg-btn rg-ghost" data-act="finish">Finish and see all words</button></div>`);

    const input = container.querySelector('#rg-word');
    const feedback = container.querySelector('.rg-feedback');
    const rankEl = container.querySelector('.rg-rank');
    const tabsEl = container.querySelector('.rg-tabs');
    const panel = container.querySelector('.rg-panel');

    function drawScore() {
      const s = score();
      rankEl.innerHTML = rankBarHtml(s);
      tabsEl.innerHTML = puzzle.languages.map((l) => {
        const pl = s.perLang[l];
        return `<button class="rg-tab" role="tab" data-lang="${l}" aria-selected="${l === tab}">${h(langName(l))}<span class="rg-tab-count">${pl.found} / ${pl.total}</span></button>`;
      }).join('');
      tabsEl.querySelectorAll('.rg-tab').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.lang; drawScore(); }));
      const found = new Set(progress.found);
      const words = puzzle.entries.filter((e) => e.lang === tab && found.has(e.id));
      // Most recent first.
      words.sort((a, b) => progress.found.indexOf(b.id) - progress.found.indexOf(a.id));
      panel.innerHTML = words.length
        ? `<ul class="rg-found">${words.map((e) => {
            const tier = puzzle.tiers[e.tier];
            const badge = tier?.scoring === 'bonus' ? `<span class="rg-badge">bonus</span>` : '';
            return `<li class="${freshIds.has(e.id) ? 'rg-new' : ''}">${h(e.word)}${badge}</li>`;
          }).join('')}</ul>`
        : `<p class="rg-empty">No ${h(langName(tab))} words yet.</p>`;
    }

    function say(cls, html) {
      feedback.className = `rg-feedback ${cls}`;
      feedback.innerHTML = html;
    }

    function submit() {
      const typed = input.value;
      const result = checkGuess(puzzle, typed, new Set(progress.found));
      input.value = '';
      if (result.kind === 'empty') return;
      if (result.kind === 'new') {
        freshIds.clear();
        for (const e of result.entries) { progress.found.push(e.id); freshIds.add(e.id); }
        saveProgress();
        const langs = [...new Set(result.entries.map((e) => e.lang))];
        if (!langs.includes(tab)) tab = langs[0];
        const bonusOnly = result.entries.every((e) => puzzle.tiers[e.tier]?.scoring === 'bonus');
        const note = bonusOnly
          ? (settings.bonusMode === 'off' ? ' · bonus word (not scored)' : ' · bonus word')
          : '';
        say('rg-good', `<span class="rg-mark">✓ Found</span> <span><strong>${h(result.entries[0].word)}</strong> in ${langs.map(langName).join(', ')}${note}</span>`);
      } else if (result.kind === 'repeat') {
        say('', `<span class="rg-mark">↺</span> <span>Already found: <strong>${h(result.entries[0].word)}</strong></span>`);
      } else if (result.kind === 'notRelated') {
        say('rg-close', `<span class="rg-mark">≈</span> <span>Close, but <strong>${h(typed.trim())}</strong> is not from this root.</span>`);
      } else {
        say('', `<span class="rg-mark">·</span> <span><strong>${h(result.text)}</strong> is not in this puzzle.</span> <button type="button" class="rg-link" data-belongs="${h(result.text)}">It belongs</button>`);
        feedback.querySelector('[data-belongs]').addEventListener('click', (e) => {
          flagWord(e.target.dataset.belongs, null);
          say('', '<span class="rg-mark">✓</span> <span>Thanks. Sent for review.</span>');
          input.focus();
        });
      }
      drawScore();
      input.focus();
    }

    container.querySelector('.rg-form').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    container.querySelectorAll('.rg-key').forEach((k) => {
      // Keep focus (and the phone keyboard) in the word box.
      k.addEventListener('pointerdown', (e) => e.preventDefault());
      k.addEventListener('click', () => {
        const { selectionStart: a = input.value.length, selectionEnd: b = input.value.length } = input;
        input.value = input.value.slice(0, a) + k.dataset.char + input.value.slice(b);
        const pos = a + k.dataset.char.length;
        input.focus();
        input.setSelectionRange(pos, pos);
      });
    });
    bind({ home: renderToday, finish: finish });

    if (progress.mode === 'blitz') {
      const timerEl = container.querySelector('.rg-timer');
      const tick = () => {
        const left = Math.max(0, Math.ceil((progress.blitzEndsAt - Date.now()) / 1000));
        timerEl.textContent = `0:${String(left).padStart(2, '0')}`;
        timerEl.classList.toggle('rg-low', left <= 10);
        timerEl.setAttribute('aria-label', `${left} seconds left`);
        if (left <= 0) finish();
      };
      tick();
      timer = setInterval(tick, 250);
    }

    drawScore();
    input.focus();
  }

  function finish() {
    stopTimer();
    game.progress.finished = true;
    saveProgress();
    const s = score();
    store.set(`result:${game.day.date ?? 'free'}:${game.puzzle.id}`, { rank: s.rank.name, percent: s.percentShown });
    renderReveal();
  }

  // ---------- Flag a word ----------
  function flagWord(word, lang) {
    const flag = { puzzle: game.puzzle.id, word: word.trim(), lang, date: today };
    if (!flag.word) return;
    if (options.onFlag) {
      try { options.onFlag(flag); } catch { /* host error; keep a local copy below */ }
    }
    const flags = store.get('flags', []);
    flags.push(flag);
    store.set('flags', flags);
  }

  // ---------- Reveal ----------
  function renderReveal() {
    stopTimer();
    const { day, puzzle, progress } = game;
    const s = score();
    const found = new Set(progress.found);
    const share = buildShareText({
      number: day.number, rootLabel: rootLabel(puzzle), score: s, languages: puzzle.languages,
      blitz: progress.mode === 'blitz', url: options.shareUrl,
    });
    const tierOrder = Object.keys(puzzle.tiers);
    const myFlags = store.get('flags', []).filter((f) => f.puzzle === puzzle.id);

    const langSections = puzzle.languages.map((l) => {
      const entries = puzzle.entries.filter((e) => e.lang === l)
        .sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
      const pl = s.perLang[l];
      return `
        <section>
          <div class="rg-lang-head"><h2>${h(langName(l))}</h2><span class="rg-muted rg-small">${pl.found} of ${pl.total} found</span></div>
          <ul class="rg-words">${entries.map((e) => {
            const isFound = found.has(e.id);
            const tier = puzzle.tiers[e.tier];
            const badge = e.tier !== 'core' ? `<span class="rg-badge">${h(tier?.label ?? e.tier)}</span>` : '';
            return `<li class="${isFound ? 'rg-was-found' : ''}">
              <span class="rg-status ${isFound ? 'rg-is-found' : 'rg-is-missed'}">${isFound ? '✓ Found' : '○ Missed'}</span>
              <span><span class="rg-word">${h(e.word)}</span>${e.gloss ? `<span class="rg-gloss">(${h(e.gloss)})</span>` : ''}${badge}</span>
              <span class="rg-path">${h(e.path)}</span>
            </li>`;
          }).join('')}</ul>
        </section>`;
    }).join('');

    wrap(`${header('<button class="rg-link" data-act="archive">Past puzzles</button>')}
      <main>
        <section class="rg-card rg-result">
          <p class="rg-kicker">${day.number ? `No. ${day.number} · ` : ''}${h(rootLabel(puzzle))} · “${h(puzzle.roots[0].meaning)}”${progress.mode === 'blitz' ? ' · blitz' : ''}</p>
          <span class="rg-rank-name">${h(s.rank.name)}</span>
          <p>${s.found - s.extra} of ${s.total} words · ${s.percentShown}%${s.extra ? ` · +${s.extra} bonus` : ''}</p>
          ${s.bonusFound && settings.bonusMode === 'off' ? `<p class="rg-muted rg-small">Plus ${s.bonusFound} bonus ${s.bonusFound === 1 ? 'word' : 'words'}, not scored.</p>` : ''}
          <div class="rg-rank" style="text-align:left">${rankBarHtml(s, { compact: true })}</div>
          <div class="rg-share">
            <pre aria-label="Shareable result">${h(share)}</pre>
            <div class="rg-btn-row"><button class="rg-btn" data-act="copy">Copy result</button></div>
          </div>
        </section>
        ${puzzle.context ? `<p class="rg-context">${h(puzzle.context)}</p>` : ''}
        ${langSections}
        ${puzzle.notRelated.length ? `
          <section>
            <div class="rg-lang-head"><h2>Not related</h2><span class="rg-muted rg-small">Lookalikes</span></div>
            <ul class="rg-words rg-nr">${puzzle.notRelated.map((n) => `
              <li><span><span class="rg-word">${h(n.word)}</span>${n.sense ? `<span class="rg-gloss">(${h(n.sense)})</span>` : ''} <span class="rg-badge">${h(langName(n.lang))}</span></span>
              <span class="rg-path">${h(n.why[0].toUpperCase() + n.why.slice(1))}.</span></li>`).join('')}
            </ul>
          </section>` : ''}
        <section class="rg-suggest">
          <h2 style="font-size:22px">Missing a word?</h2>
          <p class="rg-muted rg-small">If a word belongs here, tell us. Suggestions are checked before they join the list.</p>
          <form autocomplete="off">
            <label class="rg-visually-hidden" for="rg-suggest-word">Word</label>
            <input id="rg-suggest-word" class="rg-input" type="text" autocapitalize="off" spellcheck="false" placeholder="Word">
            <label class="rg-visually-hidden" for="rg-suggest-lang">Language</label>
            <select id="rg-suggest-lang">${puzzle.languages.map((l) => `<option value="${l}">${h(langName(l))}</option>`).join('')}</select>
            <button class="rg-btn" type="submit">Suggest</button>
          </form>
          ${myFlags.length ? `<p class="rg-muted rg-small" style="margin-top:10px">You have suggested ${myFlags.length} ${myFlags.length === 1 ? 'word' : 'words'} for this puzzle. ${options.onFlag ? '' : '<button class="rg-link" data-act="export">Copy suggestions</button>'}</p>` : ''}
        </section>
        <div class="rg-finish"><button class="rg-btn rg-ghost" data-act="archive">Past puzzles</button></div>
      </main>`);

    container.querySelector('.rg-suggest form').addEventListener('submit', (e) => {
      e.preventDefault();
      const w = container.querySelector('#rg-suggest-word').value;
      if (!w.trim()) return;
      flagWord(w, container.querySelector('#rg-suggest-lang').value);
      renderReveal();
      toast('Thanks. Sent for review.');
    });
    bind({
      archive: renderArchive,
      copy: async () => toast((await copyText(share)) ? 'Result copied' : 'Could not copy; select the text instead'),
      export: async () => {
        const text = JSON.stringify(store.get('flags', []), null, 2);
        toast((await copyText(text)) ? 'Suggestions copied' : 'Could not copy');
      },
    });
    window.scrollTo?.(0, 0);
  }

  // ---------- Archive ----------
  async function renderArchive() {
    stopTimer();
    const days = archive(schedule, today);
    const rows = await Promise.all(days.map(async (d) => {
      let p = null;
      try { p = await loadPuzzle(d.puzzle); } catch { /* skip broken */ }
      const result = store.get(`result:${d.date}:${d.puzzle}`, null);
      return { d, p, result };
    }));
    wrap(`${header('<button class="rg-link" data-act="back">Today</button>')}
      <main>
        <h1 style="font-size:28px">Past puzzles</h1>
        <ul class="rg-archive">${rows.filter((r) => r.p).map(({ d, p, result }) => `
          <li><button data-date="${h(d.date)}">
            <span><span class="rg-muted rg-small rg-sans">No. ${d.number}</span><br><span class="rg-ar-root">${h(rootLabel(p))}</span> <span class="rg-muted">“${h(p.roots[0].meaning)}”</span></span>
            <span class="rg-muted rg-small">${result ? `${h(result.rank)} · ${result.percent}%` : h(new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>
          </button></li>`).join('') || '<li class="rg-empty">No past puzzles yet.</li>'}
        </ul>
      </main>`);
    container.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => {
      openDay(days.find((d) => d.date === b.dataset.date));
    }));
    bind({ back: openToday });
  }

  function openToday() {
    if (freePuzzle) return openDay({ puzzle: freePuzzle, date: null, number: null });
    const day = puzzleForDate(schedule, today);
    if (!day) return wrap(`${header()}<p>No puzzle is scheduled.</p>`);
    return openDay(day);
  }

  await openToday();
  return {
    destroy() { stopTimer(); container.innerHTML = ''; container.classList.remove('roots-game'); },
    days: () => numberedDays(schedule),
  };
}

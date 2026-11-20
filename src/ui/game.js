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
//   testTools   true/false to show or hide the testing tools (default: shown
//               while the puzzle's word list is a draft)
//   data        { schedule, puzzles: { <id>: <key file> } } to skip fetching (play.html uses this)
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
    // Erases everything this game saved (progress, results, settings, flags).
    clearAll() {
      memory.clear();
      try {
        if (!backing) return;
        const keys = [];
        for (let i = 0; i < backing.length; i++) {
          const k = backing.key(i);
          if (k?.startsWith(STORE)) keys.push(k);
        }
        keys.forEach((k) => backing.removeItem(k));
      } catch { /* storage blocked: nothing to erase */ }
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
  const data = options.data; // { schedule, puzzles: { id: keyFile } } when bundled into one page
  async function loadPuzzle(id) {
    if (!cache.has(id) && data) {
      if (!data.puzzles[id]) throw new Error(`Could not load puzzle “${id}”.`);
      cache.set(id, Promise.resolve(preparePuzzle(data.puzzles[id])));
    }
    if (!cache.has(id)) {
      cache.set(id, fetch(`${keysUrl}${encodeURIComponent(id)}.json`).then((r) => {
        if (!r.ok) throw new Error(`Could not load puzzle “${id}”.`);
        return r.json();
      }).then(preparePuzzle));
    }
    return cache.get(id);
  }

  let schedule = data?.schedule ?? { days: [] };
  if (!data) try {
    const r = await fetch(`${keysUrl}schedule.json`);
    if (r.ok) schedule = await r.json();
  } catch { /* the game still works with ?puzzle= */ }

  // headerStyle: what the play screen leads with. 'stems' = the stems as they
  // show up in modern words (-graph-, -gram-); 'root' = the dictionary form (γράφω).
  const settings = { bonusMode: 'off', headerStyle: 'stems', ...store.get('settings', {}) };
  delete settings.header; // the older setting's name, from before stems-first was the default
  let timer = null;
  let game = null; // { day, puzzle, saveKey, progress }

  const wrap = (inner, cls = '') => { container.innerHTML = `<div class="rg-wrap ${cls}">${inner}</div>`; };
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
  function formsHtml(root, cls = 'rg-parts') {
    if (root.family === 'germanic') {
      return `<p class="${cls}">Written as ${root.writtenForms.map((f) =>
        `${h(f.language)} <i lang="${ROOT_LANG_ATTR.germanic}">${h(f.form)}</i>${f.note ? ` (${h(f.note)})` : ''}`).join(' · ')}</p>`;
    }
    if (root.family === 'greek') {
      return `<p class="${cls}">Forms: ${root.principalParts.map((p, i) =>
        `<i lang="grc">${h(p)}</i> <span class="rg-muted">(${h(root.principalPartsTransliterated?.[i] ?? '')})</span>`).join(', ')}</p>`;
    }
    return `<p class="${cls}">Forms: <i lang="la">${root.principalParts.map(h).join(', ')}</i></p>`;
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
        ${testing() ? testToolsHtml() : ''}
      </main>`);
    if (testing()) bindTestTools();

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

  // ---------- Testing tools ----------
  // Shown while the word lists are drafts, so testers can play any puzzle
  // and replay one without waiting a day or clearing browser data.
  function testing() {
    return options.testTools ?? game?.puzzle?.status !== 'ready';
  }

  function puzzleLabel(id) {
    const raw = data?.puzzles?.[id];
    return raw ? `${raw.root?.transliteration ?? id} “${raw.root?.meaning ?? ''}”` : id;
  }

  function testToolsHtml() {
    const days = numberedDays(schedule);
    return `
      <section class="rg-tester">
        <h2>Testing tools</h2>
        <p class="rg-muted rg-small">Shown while the word lists are drafts.</p>
        <label for="rg-test-puzzle">Play any puzzle, even future ones</label>
        <div class="rg-tester-row">
          <select id="rg-test-puzzle">${days.map((d) => `<option value="${h(d.date)}" ${d.date === game.day.date ? 'selected' : ''}>No. ${d.number} · ${h(puzzleLabel(d.puzzle))}</option>`).join('')}</select>
          <button type="button" class="rg-btn rg-ghost" data-act="test-go">Open</button>
        </div>
        <label for="rg-test-header">Puzzle screen leads with</label>
        <div class="rg-tester-row">
          <select id="rg-test-header">
            <option value="stems" ${settings.headerStyle === 'stems' ? 'selected' : ''}>The stems in modern words (-graph-, -gram-)</option>
            <option value="root" ${settings.headerStyle === 'root' ? 'selected' : ''}>The root word (γράφω)</option>
          </select>
        </div>
        <div class="rg-tester-row">
          <button type="button" class="rg-btn rg-ghost" data-act="test-replay">Replay this puzzle</button>
          <button type="button" class="rg-btn rg-ghost" data-act="test-wipe">Erase all saved progress</button>
        </div>
      </section>`;
  }

  function replayPuzzle() {
    game.progress = { found: [], mode: null, blitzEndsAt: null, finished: false };
    saveProgress();
    store.set(`result:${game.day.date ?? 'free'}:${game.puzzle.id}`, null);
    renderToday();
    toast('Progress cleared for this puzzle');
  }

  function bindTestTools() {
    container.querySelector('#rg-test-header')?.addEventListener('change', (e) => {
      settings.headerStyle = e.target.value;
      store.set('settings', settings);
      toast('Saved. Start or continue the puzzle to see it.');
    });
    bind({
      'test-go': () => {
        const date = container.querySelector('#rg-test-puzzle').value;
        const day = numberedDays(schedule).find((d) => d.date === date);
        if (day) openDay(day);
      },
      'test-replay': replayPuzzle,
      'test-wipe': () => {
        store.clearAll();
        Object.assign(settings, { bonusMode: 'off', headerStyle: 'stems' });
        openToday().then(() => toast('All saved progress erased'));
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

  // The stems-first header: the stems players will spot inside modern words
  // are the focal point; the original forms sit underneath in smaller type.
  const stemLabel = (stem) => `-${stem.replace(/^-+|-+$/g, '')}-`;

  function stemHeaderHtml(puzzle, progress) {
    const corner = progress.mode === 'blitz'
      ? '<span class="rg-timer" aria-live="off"></span>'
      : '<button class="rg-link" data-act="home">Puzzle info</button>';
    return `
      <div class="rg-stemhead">
        <div class="rg-stemhead-top">
          <p class="rg-kicker">Look for</p>
          ${corner}
        </div>
        ${puzzle.roots.map((r) => {
          let forms;
          if (r.family === 'germanic') {
            forms = `<p class="rg-stem-forms">${r.writtenForms.map((f) => `${h(f.language)} <i lang="ang">${h(f.form)}</i>`).join(' · ')}</p>`;
          } else if (r.family === 'greek') {
            forms = `<p class="rg-stem-forms" lang="grc">${r.principalParts.map(h).join(', ')}</p>
              <p class="rg-stem-translit">${(r.principalPartsTransliterated ?? []).map(h).join(', ')}</p>`;
          } else {
            forms = `<p class="rg-stem-forms" lang="la"><i>${r.principalParts.map(h).join(', ')}</i></p>`;
          }
          // displayStems: the shapes players actually see in modern words
          // (caput: -capit- -chef- -cab-); the scholarly stems are the fallback.
          const shown = r.displayStems?.length ? r.displayStems : r.stems;
          const size = shown.length <= 3 ? '' : shown.length <= 4 ? ' rg-stems-4' : ' rg-stems-many';
          return `
            <p class="rg-stems${size}">${shown.map((st) => `<span class="rg-stem">${h(stemLabel(st))}</span>`).join('')}
              <span class="rg-stem-meaning">“${h(r.meaning)}”</span></p>
            ${forms}`;
        }).join('')}
      </div>`;
  }

  function renderPlay() {
    const { puzzle, progress } = game;
    if (progress.finished) return renderReveal();
    const accents = [...new Set(puzzle.languages.flatMap((l) => ACCENTS[l] ?? []))];
    let tab = puzzle.languages[0];
    const freshIds = new Set();

    wrap(`
      ${settings.headerStyle === 'stems' ? stemHeaderHtml(puzzle, progress) : `
      <div class="rg-play-head">
        <span class="rg-play-root" lang="${ROOT_LANG_ATTR[puzzle.roots[0].family] ?? ''}">${h(puzzle.roots[0].form)}<small>“${h(puzzle.roots[0].meaning)}”</small></span>
        ${progress.mode === 'blitz' ? '<span class="rg-timer" aria-live="off"></span>' : '<button class="rg-link" data-act="home">Puzzle info</button>'}
      </div>
      <div class="rg-play-forms">${puzzle.roots.map((r) => formsHtml(r, 'rg-play-parts')).join('')}</div>`}
      <div class="rg-rank"></div>
      <form class="rg-form" autocomplete="off">
        <label class="rg-visually-hidden" for="rg-word">Type a word</label>
        <input id="rg-word" class="rg-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="Type a word">
        <button class="rg-btn" type="submit">Enter</button>
      </form>
      ${accents.length ? `<div class="rg-accents" aria-label="Accented letters (optional: words match without them)"><span class="rg-accents-note">Accents optional</span>${accents.map((a) => `<button type="button" class="rg-key" data-char="${h(a)}">${h(a)}</button>`).join('')}</div>` : ''}
      <div class="rg-feedback" aria-live="polite" aria-atomic="true"></div>
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

    // A big, unmissable card for every answer. Each answer builds a fresh card so
    // its entrance animation always plays. Shape and wording differ by result,
    // never color alone.
    function card(kind, { icon, title, sub = '', detail = '', plus = '', extra = '' }) {
      const el = document.createElement('div');
      el.className = `rg-fb rg-fb-${kind}`;
      el.innerHTML = `
        <span class="rg-fb-icon" aria-hidden="true">${icon}</span>
        <div class="rg-fb-body">
          <p class="rg-fb-title">${title}</p>
          ${sub ? `<p class="rg-fb-sub">${sub}</p>` : ''}
          ${detail ? `<p class="rg-fb-detail">${detail}</p>` : ''}
          ${extra}
        </div>
        ${plus ? `<span class="rg-fb-plus" aria-hidden="true">${plus}</span>` : ''}`;
      feedback.replaceChildren(el);
      return el;
    }

    function burst(el, big) {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const n = big ? 24 : 12;
      const layer = document.createElement('span');
      layer.className = 'rg-burst';
      layer.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < n; i++) {
        const dot = document.createElement('i');
        const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const dist = (big ? 70 : 44) + Math.random() * (big ? 50 : 24);
        dot.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
        dot.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
        dot.style.setProperty('--d', `${Math.random() * 80}ms`);
        if (i % 3 === 0) dot.className = 'rg-leaf';
        layer.appendChild(dot);
      }
      el.querySelector('.rg-fb-icon').appendChild(layer);
      setTimeout(() => layer.remove(), 1200);
    }

    function shake() {
      const form = container.querySelector('.rg-form');
      form.classList.remove('rg-shake');
      void form.offsetWidth; // restart the animation
      form.classList.add('rg-shake');
    }

    function submit() {
      const typed = input.value;
      const result = checkGuess(puzzle, typed, new Set(progress.found));
      input.value = '';
      if (result.kind === 'empty') return;
      if (result.kind === 'new') {
        const before = score();
        freshIds.clear();
        for (const e of result.entries) { progress.found.push(e.id); freshIds.add(e.id); }
        saveProgress();
        const after = score();
        const langs = [...new Set(result.entries.map((e) => e.lang))];
        if (!langs.includes(tab)) tab = langs[0];
        const bonusOnly = result.entries.every((e) => puzzle.tiers[e.tier]?.scoring === 'bonus');
        const gained = after.found - before.found;
        const rankUp = after.rank.min > before.rank.min;
        const defined = result.entries.find((e) => e.lang === 'en' && e.definition) ?? result.entries.find((e) => e.definition);
        const el = card('good', {
          icon: '✓',
          title: h(result.entries[0].word),
          sub: `${langs.map((l) => h(langName(l))).join(' · ')}${bonusOnly ? ` · bonus word${settings.bonusMode === 'off' ? ', not scored' : ''}` : ''}`,
          detail: defined ? h(defined.definition) : '',
          plus: gained > 0 ? `+${gained}` : '',
          extra: rankUp ? `<p class="rg-fb-rankup">New rank: <strong>${h(after.rank.name)}</strong></p>` : '',
        });
        if (rankUp) el.classList.add('rg-fb-big');
        burst(el, rankUp);
        drawScore();
        if (rankUp) rankEl.classList.add('rg-rank-up');
        setTimeout(() => rankEl.classList.remove('rg-rank-up'), 1200);
      } else if (result.kind === 'repeat') {
        card('repeat', { icon: '↺', title: 'Already found', sub: `<strong>${h(result.entries[0].word)}</strong> is on your list` });
        shake();
        drawScore();
      } else if (result.kind === 'notRelated') {
        const item = result.items[0];
        card('close', {
          icon: '≈',
          title: 'Close, but not from this root',
          sub: `<strong>${h(typed.trim())}</strong>: ${h(item.why)}`,
        });
        shake();
        drawScore();
      } else {
        card('miss', {
          icon: '✕',
          title: 'Not in this puzzle',
          sub: `<strong>${h(result.text)}</strong>`,
          extra: `<button type="button" class="rg-fb-flag" data-belongs="${h(result.text)}">I think it belongs</button>`,
        });
        feedback.querySelector('[data-belongs]').addEventListener('click', (e) => {
          flagWord(e.currentTarget.dataset.belongs, null);
          card('repeat', { icon: '✓', title: 'Thanks', sub: 'Sent for review.' });
          input.focus();
        });
        shake();
        drawScore();
      }
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
  // The key shows one column per language. Tapping a column (or a word in it)
  // zooms in: that column fills the width and every word opens up to show its
  // parts, what it was built from, and its path from the root.
  function setupZoom(langs) {
    const cols = container.querySelector('.rg-cols');
    const bar = container.querySelector('.rg-zoombar');
    const key = container.querySelector('.rg-family');
    let current = null;

    function zoom(lang, entry) {
      current = lang;
      cols.classList.toggle('is-zoomed', !!lang);
      bar.hidden = !lang;
      cols.querySelectorAll('.rg-col').forEach((c) => c.classList.toggle('is-active', c.dataset.lang === lang));
      cols.querySelectorAll('[data-zoom]').forEach((b) => b.setAttribute('aria-expanded', String(!!lang)));
      const target = entry != null ? container.querySelector(`#rg-e-${entry}`) : key;
      if (target) {
        target.scrollIntoView({ block: entry != null ? 'center' : 'start' });
        if (entry != null) {
          target.classList.remove('rg-flash');
          void target.offsetWidth;
          target.classList.add('rg-flash');
        }
      }
    }

    cols.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-zoom]');
      if (!btn) return;
      if (current && !btn.dataset.entry) return zoom(null);
      if (current) return; // already zoomed: words are open, nothing to do
      zoom(btn.dataset.zoom, btn.dataset.entry ?? null);
    });
    bar.querySelector('.rg-zoom-back').addEventListener('click', () => {
      const was = current;
      zoom(null);
      cols.querySelector(`.rg-col[data-lang="${was}"]`)?.scrollIntoView({ inline: 'start', block: 'nearest' });
    });
    bar.querySelectorAll('.rg-zoom-step').forEach((b) => b.addEventListener('click', () => {
      const i = langs.indexOf(current);
      zoom(langs[(i + Number(b.dataset.step) + langs.length) % langs.length]);
    }));
    container.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) zoom(null); });
  }

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

    // English first, then the puzzle's other languages in their usual order.
    const columnLangs = [...puzzle.languages].sort((a, b) => (b === 'en') - (a === 'en'));
    const entryIndex = new Map(puzzle.entries.map((e, i) => [e.id, i]));

    const partsInline = (e) => (e.morphemes ?? []).map((m) =>
      `<span class="${m.root ? 'rg-m-root' : ''}">${h(m.part)}</span>`).join('<span class="rg-m-plus"> + </span>');

    const partsFull = (e) => (e.morphemes ?? []).map((m) => `
      <span class="rg-chip${m.root ? ' rg-chip-root' : ''}">
        <span class="rg-chip-part">${h(m.part)}</span>
        <span class="rg-chip-meaning">${h(m.meaning)}</span>
      </span>`).join('<span class="rg-chip-plus" aria-hidden="true">+</span>');

    const wordItem = (e) => {
      const isFound = found.has(e.id);
      const i = entryIndex.get(e.id);
      return `
        <li class="rg-kw ${isFound ? 'rg-kw-found' : 'rg-kw-missed'}" id="rg-e-${i}">
          <button type="button" class="rg-kw-btn" data-zoom="${e.lang}" data-entry="${i}">
            <span class="rg-kw-mark" aria-hidden="true">${isFound ? '✓' : '○'}</span>
            <span class="rg-kw-main">
              <span class="rg-kw-word">${h(e.word)}${e.gloss ? ` <span class="rg-gloss">(${h(e.gloss)})</span>` : ''}</span>
              <span class="rg-visually-hidden">${isFound ? ', found' : ', missed'}</span>
              ${e.definition ? `<span class="rg-kw-def">${h(e.definition)}</span>` : ''}
              ${e.morphemes ? `<span class="rg-kw-parts">${partsInline(e)}</span>` : ''}
            </span>
          </button>
          <div class="rg-kw-detail">
            ${e.morphemes ? `<div class="rg-chips" aria-label="Word parts">${partsFull(e)}</div>` : ''}
            ${e.source ? `<p class="rg-kw-source">Built from ${h(e.source)}</p>` : ''}
            <p class="rg-kw-path"><span class="rg-kw-label">Path</span> ${h(e.path)}</p>
          </div>
        </li>`;
    };

    const columns = columnLangs.map((l) => {
      const pl = s.perLang[l];
      const groups = tierOrder.map((t) => ({ t, list: puzzle.entries.filter((e) => e.lang === l && e.tier === t) }))
        .filter((g) => g.list.length);
      return `
        <article class="rg-col" data-lang="${l}" aria-label="${h(langName(l))}">
          <button type="button" class="rg-col-head" data-zoom="${l}">
            <span class="rg-col-name">${h(langName(l))}</span>
            <span class="rg-col-count">${pl.found} of ${pl.total} found</span>
            <span class="rg-col-zoom" aria-hidden="true">Zoom in ⤢</span>
          </button>
          ${groups.map((g) => `
            ${g.t !== 'core' ? `<h3 class="rg-col-tier">${h(puzzle.tiers[g.t]?.label ?? g.t)}</h3>` : ''}
            <ul class="rg-kw-list">${g.list.map(wordItem).join('')}</ul>`).join('')}
        </article>`;
    }).join('');

    const langSections = `
      <section class="rg-family" aria-labelledby="rg-key-title">
        <div class="rg-key-head">
          <h2 id="rg-key-title">The whole family</h2>
          <p class="rg-muted rg-small rg-key-hint">Tap a language to zoom in and see what each part of a word means.</p>
        </div>
        <div class="rg-zoombar" hidden>
          <button type="button" class="rg-btn rg-ghost rg-zoom-back">← All languages</button>
          <span class="rg-zoom-steps">
            <button type="button" class="rg-key rg-zoom-step" data-step="-1" aria-label="Previous language">‹</button>
            <button type="button" class="rg-key rg-zoom-step" data-step="1" aria-label="Next language">›</button>
          </span>
        </div>
        <div class="rg-cols">${columns}</div>
      </section>`;

    wrap(`${header('<button class="rg-link" data-act="archive">Past puzzles</button>')}
      <main>
        <section class="rg-card rg-result rg-narrow">
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
        ${puzzle.context ? `<p class="rg-context rg-narrow">${h(puzzle.context)}</p>` : ''}
        ${langSections}
        ${puzzle.notRelated.length ? `
          <section class="rg-narrow">
            <div class="rg-lang-head"><h2>Not related</h2><span class="rg-muted rg-small">Lookalikes</span></div>
            <ul class="rg-words rg-nr">${puzzle.notRelated.map((n) => `
              <li><span><span class="rg-word">${h(n.word)}</span>${n.sense ? `<span class="rg-gloss">(${h(n.sense)})</span>` : ''} <span class="rg-badge">${h(langName(n.lang))}</span></span>
              <span class="rg-path">${h(n.why[0].toUpperCase() + n.why.slice(1))}.</span></li>`).join('')}
            </ul>
          </section>` : ''}
        <section class="rg-suggest rg-narrow">
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
        <div class="rg-finish rg-btn-row rg-narrow">
          ${testing() ? '<button class="rg-btn rg-ghost" data-act="test-replay">Replay (testing)</button>' : ''}
          <button class="rg-btn rg-ghost" data-act="archive">Past puzzles</button>
        </div>
      </main>`, 'rg-wide');

    setupZoom(columnLangs);
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
      'test-replay': replayPuzzle,
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

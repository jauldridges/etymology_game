#!/usr/bin/env node
// Phone-sized end-to-end run: plays the three starter puzzles start to finish,
// checks the share block copies, runs a blitz, and saves screenshots.
//   node test/e2e.mjs [outDir]
// Needs Playwright with Chromium installed.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const outDir = process.argv[2] ?? 'e2e-shots';
mkdirSync(outDir, { recursive: true });

const port = 8765;
const server = spawn(process.execPath, [fileURLToPath(new URL('../tools/serve.mjs', import.meta.url)), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const base = `http://localhost:${port}/`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base.slice(0, -1) });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function noHorizontalScroll() {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);
}

async function type(word) {
  await page.fill('#rg-word', word);
  await page.press('#rg-word', 'Enter');
  return (await page.textContent('.rg-feedback')).trim();
}

const STARTERS = [
  { date: '2026-11-18', id: 'caput', words: ['chef', 'cabeza', 'cabeca', 'capital', 'precipice', 'chapitre', 'capture', 'chef', 'zebra'] },
  { date: '2026-11-19', id: 'graphein', words: ['telegrama', 'grammar', 'paragraphe', 'glamour', 'grape'] },
  { date: '2026-11-20', id: 'hus', words: ['house', 'Haus', 'huis', 'hus', 'Gewachshaus', 'husband', 'hut'] },
];

for (const s of STARTERS) {
  await page.goto(`${base}?date=${s.date}`);
  await page.waitForSelector('.rg-root');
  await noHorizontalScroll();
  await page.screenshot({ path: `${outDir}/${s.id}-1-today.png`, fullPage: true });
  await page.click('[data-act="start"]');
  const log = [];
  for (const w of s.words) log.push(`${w}: ${await type(w)}`);
  console.log(`\n${s.id}\n  ${log.join('\n  ')}`);
  await noHorizontalScroll();
  await page.screenshot({ path: `${outDir}/${s.id}-2-play.png` });
  await page.click('[data-act="finish"]');
  await page.waitForSelector('.rg-result');
  await page.click('[data-act="copy"]');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const shown = await page.textContent('.rg-share pre');
  assert.equal(copied, shown, 'clipboard matches the share block');
  console.log(`  share:\n    ${copied.split('\n').join('\n    ')}`);
  await noHorizontalScroll();
  await page.screenshot({ path: `${outDir}/${s.id}-3-reveal.png` });
}

// Checks of specific behaviours
const caputLog = (await (async () => {
  await page.goto(`${base}?date=2026-11-18`);
  await page.waitForSelector('.rg-result, [data-act="reveal"]');
  return page.textContent('main');
})());
assert.ok(caputLog.includes('See your result'), 'a finished puzzle offers its result, not a replay');

// Blitz with a short clock: start, find a word, let it run out.
await page.goto(`${base}?puzzle=bonus`);
await page.click('[data-act="blitz"]');
await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.includes('progress:free:bonus'));
  const p = JSON.parse(localStorage.getItem(key));
  p.blitzEndsAt = Date.now() + 2500;
  localStorage.setItem(key, JSON.stringify(p));
});
await page.reload();
await page.click('[data-act="continue"]');
console.log(`\nblitz: ${await type('bueno')}`);
await page.waitForSelector('.rg-result', { timeout: 6000 });
assert.ok((await page.textContent('.rg-share pre')).includes('60s blitz'));
await page.screenshot({ path: `${outDir}/blitz-reveal.png` });

// Archive
await page.goto(`${base}?date=2026-11-20`);
await page.click('[data-act="archive"]');
await page.waitForSelector('.rg-archive');
await noHorizontalScroll();
await page.screenshot({ path: `${outDir}/archive.png` });
const archiveText = await page.textContent('.rg-archive');
assert.ok(archiveText.includes('No. 3') && !archiveText.includes('No. 4'), 'archive hides future puzzles');

// Dark mode
const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
const dp = await dark.newPage();
await dp.goto(`${base}?date=2026-11-19`);
await dp.waitForSelector('.rg-root');
await dp.screenshot({ path: `${outDir}/graphein-dark.png` });

assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
await browser.close();
server.kill();
console.log(`\nAll end-to-end checks passed. Screenshots in ${outDir}/`);

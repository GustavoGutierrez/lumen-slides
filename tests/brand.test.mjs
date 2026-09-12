import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, writeJSON } from '../src/core.mjs';
import { buildDeck, luminance, isLight } from '../src/build.mjs';

const LIGHT = ['paper', 'prisma-claro'];
const DARK = ['ink', 'prisma'];

// The demo deck carries slide-level brand overrides; they are dropped so one brand answers for the whole deck.
async function fixture(t, brand) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-brand-'));
  await fs.cp(path.join(ROOT, 'decks/demo'), dir, { recursive:true, filter:s => !s.includes(`${path.sep}output`) && !s.includes(`${path.sep}runs`) });
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  const deck = await json(path.join(dir, 'deck.json'));
  deck.brand = brand;
  deck.slides = deck.slides.map(({ brand:_, ...s }) => s);
  await writeJSON(path.join(dir, 'deck.json'), deck);
  await buildDeck(dir);
  return fs.readFile(path.join(dir, 'output/index.html'), 'utf8');
}
const count = (html, re) => (html.match(re) ?? []).length;

// The suite owns its brand fixtures: depending on a client's brand file would couple
// the test to whichever deck happens to live in the repo.
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20" viewBox="0 0 60 20"><rect width="60" height="20" fill="#fff"/></svg>';
const MARK_ON_LIGHT = MARK.replace('#fff', '#000');
async function brandFixture(t, { onLight = false, logo = true } = {}) {
  const id = `t-brand-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(ROOT, 'assets/brands-test');
  await fs.mkdir(dir, { recursive:true });
  const brand = { id, name:'TEST BRAND' };
  if (logo) { await fs.writeFile(path.join(dir, `${id}.svg`), MARK); brand.logo = `assets/brands-test/${id}.svg`; }
  if (onLight) { await fs.writeFile(path.join(dir, `${id}-on-light.svg`), MARK_ON_LIGHT); brand.logoOnLight = `assets/brands-test/${id}-on-light.svg`; }
  await writeJSON(path.join(ROOT, `brands/${id}.json`), brand);
  t.after(async () => {
    await fs.rm(path.join(ROOT, `brands/${id}.json`), { force:true });
    await fs.rm(path.join(dir, `${id}.svg`), { force:true });
    await fs.rm(path.join(dir, `${id}-on-light.svg`), { force:true });
    await fs.rm(dir, { recursive:true, force:true }).catch(()=>{});
  });
  return brand;
}

test('relative luminance separates the light fields from the dark ones', () => {
  assert.ok(luminance('#ffffff') > luminance('#f5f3ed'));
  assert.ok(luminance('#22243a') < 0.05);
  for (const hex of ['#ffffff', '#f5f3ed', '#6bd9ec', '#ec5512']) assert.equal(isLight(hex), true, `${hex} should be light`);
  for (const hex of ['#22243a', '#101923', '#000002']) assert.equal(isLight(hex), false, `${hex} should be dark`);
});

test('a brand with logoOnLight emits both marks', async t => {
  const brand = await brandFixture(t, { onLight:true });
  assert.equal(typeof brand.logoOnLight, 'string');
  const html = await fixture(t, brand.id);
  const slides = (await json(path.join(ROOT, 'decks/demo/deck.json'))).slides.length;
  assert.equal(count(html, /class="brand-logo"/g), slides);
  assert.equal(count(html, /class="brand-logo-on-light"/g), slides);
  assert.ok(!html.includes('src=""'));
});

test('a brand without logoOnLight still emits exactly one mark', async t => {
  const brand = await brandFixture(t);
  assert.equal(brand.logoOnLight, undefined);
  const html = await fixture(t, brand.id);
  const slides = (await json(path.join(ROOT, 'decks/demo/deck.json'))).slides.length;
  assert.equal(count(html, /class="brand-logo"/g), slides);
  assert.equal(count(html, /class="brand-logo-on-light"/g), 0);
  assert.ok(!html.includes('src=""'));
});

test('a brand with no logo at all keeps the text wordmark', async t => {
  const brand = await brandFixture(t, { logo:false });
  const html = await fixture(t, brand.id);
  assert.equal(count(html, /class="brand-logo/g), 0);
  assert.ok(html.includes(`<span class="brand"><span>${brand.name}</span></span>`));
});

test('only the light themes override the visible mark', async t => {
  const html = await fixture(t, (await brandFixture(t, { onLight:true })).id);
  assert.match(html, /\.brand-logo-on-light\{display:none\}/);
  for (const theme of LIGHT) {
    assert.ok(html.includes(`[data-theme="${theme}"] .brand-logo:has(+.brand-logo-on-light){display:none}`), `${theme} must hide the dark mark`);
    assert.ok(html.includes(`[data-theme="${theme}"] .brand-logo-on-light{display:inline}`), `${theme} must show the on-light mark`);
  }
  for (const theme of DARK) assert.ok(!html.includes(`[data-theme="${theme}"] .brand-logo`), `${theme} must emit no override`);
});

test('the inverted templates force the on-light mark whatever the theme', async () => {
  for (const layout of ['cover-cyan', 'section-orange']) {
    const css = await fs.readFile(path.join(ROOT, 'templates', layout, 'style.css'), 'utf8');
    assert.match(css, new RegExp(`section\\.layout-${layout} \\.brand-logo\\{display:none\\}`));
    assert.match(css, new RegExp(`section\\.layout-${layout} \\.brand-logo-on-light\\{display:inline\\}`));
    // Reveal's controls sit outside the section, so the field has to repaint them or they vanish.
    assert.match(css, new RegExp(`section\\.present\\.layout-${layout}\\) \\.reveal \\.controls\\{color:#`));
  }
});

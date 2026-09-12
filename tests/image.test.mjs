import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, validateDeck, writeJSON } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

const LIGHT = ['paper', 'prisma-claro', 'ocean'];
const DARK = ['ink', 'prisma'];
// The suite writes its own marks: only decks/demo is tracked, so copying from any other deck
// passes locally and fails wherever that deck does not exist, such as CI.
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20" viewBox="0 0 60 20"><rect width="60" height="20" fill="#fff"/></svg>';
const MARK_ON_LIGHT = MARK.replace('#fff', '#000');

// The demo deck carries no image slide, so the fixture replaces its slides with the two cases under test:
// a wordmark that needs a light twin, and a mark that has none.
async function fixture(t, slide) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-image-'));
  await fs.cp(path.join(ROOT, 'decks/demo'), dir, { recursive:true, filter:s => !s.includes(`${path.sep}output`) && !s.includes(`${path.sep}runs`) });
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  await fs.mkdir(path.join(dir, 'resources'), { recursive:true });
  await fs.writeFile(path.join(dir, 'resources/meridian-logo.svg'), MARK);
  await fs.writeFile(path.join(dir, 'resources/meridian-logo-black.svg'), MARK_ON_LIGHT);
  const deck = await json(path.join(dir, 'deck.json'));
  deck.slides = [{ id:'contexto', layout:'image', title:'Contexto', alt:'Meridian', basis:'demo', sourceIds:[], ...slide }];
  await writeJSON(path.join(dir, 'deck.json'), deck);
  return dir;
}
const built = async (t, slide) => { const dir = await fixture(t, slide); await buildDeck(dir); return fs.readFile(path.join(dir, 'output/index.html'), 'utf8'); };
const count = (html, re) => (html.match(re) ?? []).length;

test('a slide with imageOnLight emits both images and names only the visible one', async t => {
  const html = await built(t, { image:'resources/meridian-logo.svg', imageOnLight:'resources/meridian-logo-black.svg' });
  assert.equal(count(html, /class="content-image"/g), 1);
  assert.equal(count(html, /class="content-image-on-light"/g), 1);
  assert.match(html, /<img class="content-image" src="data:image\/svg\+xml;base64,[^"]+" alt="Meridian">/);
  assert.match(html, /<img class="content-image-on-light" src="data:image\/svg\+xml;base64,[^"]+" alt="">/);
  assert.ok(!html.includes('src=""'));
});

test('a slide without imageOnLight still emits exactly one image', async t => {
  const html = await built(t, { image:'resources/meridian-logo.svg' });
  assert.equal(count(html, /class="content-image"/g), 1);
  assert.equal(count(html, /class="content-image-on-light"/g), 0);
  assert.ok(!html.includes('src=""'));
  assert.equal(count(html, /<img class="content-image[^"]*"[^>]*alt=""/g), 0);
});

test('imageOnLight holds the same asset guarantees as image', async t => {
  const dir = await fixture(t, { image:'resources/meridian-logo.svg', imageOnLight:'resources/missing-logo.svg' });
  await assert.rejects(validateDeck(dir), /ENOENT|missing-logo/);
  const deck = await json(path.join(dir, 'deck.json'));
  // A real file that exists outside the deck: the guard has to be containment, not a missing path.
  deck.slides[0].imageOnLight = path.relative(dir, path.join(ROOT, 'assets/brand/favicon.png'));
  await writeJSON(path.join(dir, 'deck.json'), deck);
  await assert.rejects(validateDeck(dir), /outside allowed directory/);
  deck.slides[0] = { ...deck.slides[0], layout:'statement', body:'Sin imagen', image:undefined, alt:undefined, imageOnLight:'resources/meridian-logo-black.svg' };
  await writeJSON(path.join(dir, 'deck.json'), deck);
  await assert.rejects(validateDeck(dir), /imageOnLight requires image/);
});

test('only the light themes reveal the on-light content image', async t => {
  const html = await built(t, { image:'resources/meridian-logo.svg', imageOnLight:'resources/meridian-logo-black.svg' });
  assert.match(html, /\.content-image-on-light\{display:none\}/);
  for (const theme of LIGHT) {
    assert.ok(html.includes(`[data-theme="${theme}"] .content-image:has(+.content-image-on-light){display:none}`), `${theme} must hide the dark image`);
    assert.ok(!html.includes(`[data-theme="${theme}"] .content-image{display:none}`), `${theme} must not hide an image that has no twin`);
    assert.ok(html.includes(`[data-theme="${theme}"] .content-image-on-light{display:inline}`), `${theme} must show the on-light image`);
  }
  for (const theme of DARK) assert.ok(!html.includes(`[data-theme="${theme}"] .content-image`), `${theme} must emit no override`);
});

test('both content images are sized so neither collapses', async () => {
  const css = await fs.readFile(path.join(ROOT, 'src/style.css'), 'utf8');
  // Both axes come from CSS, so a viewBox-only SVG cannot lay out at 0x0 the way a brand mark can.
  assert.match(css, /\.content-image,\.content-image-on-light\{width:100%;height:540px;object-fit:contain/);
});

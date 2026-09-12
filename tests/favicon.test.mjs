import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, writeJSON } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

async function fixture(t, mutate) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-favicon-'));
  await fs.cp(path.join(ROOT, 'decks/demo'), dir, { recursive:true, filter:s=>!s.includes(`${path.sep}output`) && !s.includes(`${path.sep}runs`) });
  if (mutate) { const deck = await json(path.join(dir, 'deck.json')); await mutate(deck); await writeJSON(path.join(dir, 'deck.json'), deck); }
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  return dir;
}

test('every generated deck carries the project favicon inline', async t => {
  const built = await buildDeck(await fixture(t));
  const html = await fs.readFile(path.join(built.out, 'index.html'), 'utf8');
  const link = html.match(/<link rel="icon"[^>]*>/);
  assert.ok(link, 'no <link rel="icon"> in the generated head');
  assert.match(link[0], /href="data:image\/png;base64,[A-Za-z0-9+/=]+"/, 'favicon must be embedded, not a file reference');
});

test('a brand may override the default favicon', async t => {
  const built = await buildDeck(await fixture(t, deck => { deck.brand = 'research-lab'; }));
  const html = await fs.readFile(path.join(built.out, 'index.html'), 'utf8');
  assert.match(html, /<link rel="icon" href="data:image\/png;base64,/, 'brand decks still get a favicon');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-mark-'));
  await fs.cp(path.join(ROOT, 'decks/demo'), dir, { recursive:true, filter:s=>!s.includes(`${path.sep}output`) && !s.includes(`${path.sep}runs`) });
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  return dir;
}

test('the toolbar mark is a credits button ahead of the deck title', async t => {
  const built = await buildDeck(await fixture(t));
  const html = await fs.readFile(path.join(built.out, 'index.html'), 'utf8');
  const mark = html.match(/<button id="credits" class="toolbar-mark"[^>]*>\s*<img[^>]*>/);
  assert.ok(mark, 'no <button class="toolbar-mark"> in the toolbar');
  assert.match(mark[0], /src="data:image\/png;base64,/, 'the mark must be embedded, not a file reference');
  // The button carries the name, so the image inside it stays decorative.
  assert.match(mark[0], /alt=""/, 'the button already names the control, so the image must not be announced');
  assert.match(mark[0], /title="[^"]+"/, 'the mark needs a tooltip');
  assert.match(mark[0], /aria-label="[^"]+"/, 'the mark needs an accessible name');
  assert.ok(html.indexOf(mark[0]) < html.indexOf('class="toolbar-title"'), 'the mark must precede the title');
});

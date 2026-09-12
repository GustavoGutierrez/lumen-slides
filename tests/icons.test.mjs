import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, writeJSON, iconSVG } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lumen-icons-'));await fs.cp(path.join(ROOT,'decks/demo'),dir,{recursive:true,filter:s=>!s.includes(`${path.sep}output`)&&!s.includes(`${path.sep}runs`)});t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('an outline icon inherits the theme colour and drops its intrinsic size',async()=>{
  const svg=await iconSVG('tabler:ai-agent');
  assert.match(svg,/^<svg [^>]*>.*<\/svg>$/);
  assert.ok(svg.includes('currentColor'));
  assert.ok(!svg.includes('width="24"')&&!svg.includes('height="24"'));
  assert.match(svg,/viewBox="0 0 24 24"/);
  assert.equal(svg.includes('\n'),false);
  assert.match(svg,/class="icon"/);
  assert.ok(!svg.includes('icon-tabler'));
});
test('the three prefixes resolve from their own directories',async()=>{
  const outline=await iconSVG('tabler:star'),filled=await iconSVG('tabler-filled:star'),brand=await iconSVG('brand:anthropic');
  assert.notEqual(outline,filled);
  assert.match(outline,/stroke="currentColor"/);
  assert.match(filled,/fill="currentColor"/);
  assert.match(brand,/fill="currentColor"/);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(brand));
});
test('decorative icons are hidden from assistive technology',async()=>{
  for(const ref of ['tabler:ai-agent','tabler-filled:star','brand:anthropic']){
    const svg=await iconSVG(ref);
    assert.match(svg,/aria-hidden="true"/);
    assert.match(svg,/focusable="false"/);
    assert.ok(!svg.includes('<title'));
    assert.ok(!svg.includes('role="img"'));
  }
});
test('untrusted icon references cannot escape the icon packages',async()=>{
  await assert.rejects(iconSVG('tabler:../../../../etc/passwd'),/Invalid icon name/);
  await assert.rejects(iconSVG('brand:../../../package'),/Invalid icon name/);
  await assert.rejects(iconSVG('tabler:Star_1'),/Invalid icon name/);
  await assert.rejects(iconSVG('tabler:-star'),/Invalid icon name/);
  await assert.rejects(iconSVG('feather:star'),/Unknown icon set/);
  await assert.rejects(iconSVG('star'),/Unknown icon set/);
  await assert.rejects(iconSVG('tabler:database-check'),/Unknown icon: tabler:database-check/);
  await assert.rejects(iconSVG('brand:openai'),/Unknown icon: brand:openai/);
});
test('icons are reported as a deck feature only when a deck uses them',async t=>{
  const dir=await fixture(t);
  const plain=await buildDeck(dir);
  assert.ok(!plain.features.includes('icons'));
  const deck=await json(path.join(dir,'deck.json'));
  deck.slides.find(s=>s.layout==='statement').icon='tabler:rocket';
  const bullets=deck.slides.find(s=>s.layout==='columns');bullets.layout='bullets';bullets.items[0].icon='brand:anthropic';
  await writeJSON(path.join(dir,'deck.json'),deck);
  const iconed=await buildDeck(dir);
  assert.ok(iconed.features.includes('icons'));
  const html=await fs.readFile(path.join(iconed.out,'index.html'),'utf8');
  // The raw reference still travels in the embedded deck payload; what matters is that the slide markup carries the SVG.
  const rendered=html.slice(html.indexOf('<div class="slides">'),html.indexOf('id="lumen-data"'));
  assert.match(rendered,/<p class="hero-icon"><svg [^>]*class="icon"/);
  assert.match(rendered,/<li><svg [^>]*class="icon"[^>]*>.*?<strong>/);
  assert.ok(!rendered.includes('tabler:rocket')&&!rendered.includes('brand:anthropic'));
});

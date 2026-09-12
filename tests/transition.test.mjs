import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, writeJSON, checkSchema, validateDeck } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

const NAMES=['fade','crossfade','slide','morph','fade-dark','none'];
// The Lumen name is the authored intent; the Reveal attribute is the mechanism it maps onto.
const REVEAL={fade:'fade',crossfade:'fade',slide:'slide',morph:'fade','fade-dark':'fade',none:'none'};
const DURATIONS={fade:'300ms',crossfade:'320ms',slide:'300ms',morph:'400ms','fade-dark':'420ms',none:'0ms'};

const deckWith=(extra={},slides)=>({schemaVersion:'1.0',id:'t',title:'T',lang:'es',author:'A',theme:'ink',font:'inter',brand:'lumen',sources:[],...extra,slides:slides??[{id:'s',layout:'statement',title:'T',body:'B',basis:'demo',sourceIds:[]}]});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lumen-transition-'));await fs.cp(path.join(ROOT,'decks/demo'),dir,{recursive:true,filter:s=>!s.includes(`${path.sep}output`)&&!s.includes(`${path.sep}runs`)});t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
const section=(html,id)=>html.match(new RegExp(`<section id="${id}"[^>]*>`))?.[0]??'';

test('the schema accepts the six transition names on a slide and on the deck',async()=>{
  for(const name of NAMES){
    await checkSchema('deck',deckWith({},[{id:'s',layout:'statement',title:'T',body:'B',basis:'demo',sourceIds:[],transition:name}]));
    await checkSchema('deck',deckWith({transition:name}));
  }
});
test('the schema rejects an unknown transition name at either level',async()=>{
  await assert.rejects(checkSchema('deck',deckWith({},[{id:'s',layout:'statement',title:'T',body:'B',basis:'demo',sourceIds:[],transition:'zoom'}])),/transition/);
  await assert.rejects(checkSchema('deck',deckWith({transition:'convex'})),/transition/);
});
test('a deck without any transition still validates and builds on the fade default',async t=>{
  const dir=await fixture(t);
  const deck=await validateDeck(dir);
  assert.ok(deck.slides.every(s=>s.transition===undefined));
  assert.equal(deck.transition,undefined);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  for(const s of deck.slides)assert.match(section(html,s.id),/data-transition="fade"/);
});
test('the built sections carry the Reveal mechanism and the authored Lumen name',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  // morph is skipped here: it is pairwise and gets its own test.
  const authored=['fade','crossfade','slide','fade-dark','none'];
  deck.slides.forEach((s,i)=>{s.transition=authored[i%authored.length];});
  await writeJSON(path.join(dir,'deck.json'),deck);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  deck.slides.forEach((s,i)=>{
    const name=authored[i%authored.length],tag=section(html,s.id);
    assert.match(tag,new RegExp(`data-transition="${REVEAL[name]}"`),`${s.id} lost its Reveal mechanism for ${name}`);
    assert.match(tag,new RegExp(`data-lumen-transition="${name}"`),`${s.id} lost its Lumen name`);
    assert.doesNotMatch(tag,/data-auto-animate/,`${s.id} must not carry auto-animate for ${name}`);
  });
});
test('the deck level transition is the default and a slide overrides it',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.transition='slide';deck.slides[2].transition='none';
  await writeJSON(path.join(dir,'deck.json'),deck);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  assert.match(section(html,deck.slides[0].id),/data-lumen-transition="slide"/);
  assert.match(section(html,deck.slides[2].id),/data-lumen-transition="none"/);
  assert.match(section(html,deck.slides[2].id),/data-transition="none"/);
});
test('a morph slide marks itself and its predecessor for auto-animate',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.slides[3].transition='morph';
  await writeJSON(path.join(dir,'deck.json'),deck);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  for(const i of [2,3]){
    const tag=section(html,deck.slides[i].id);
    assert.match(tag,/data-auto-animate(=""|[ >])/,`${deck.slides[i].id} is missing data-auto-animate`);
    assert.match(tag,/data-auto-animate-duration="0.4"/,`${deck.slides[i].id} is missing the morph duration`);
  }
  assert.match(section(html,deck.slides[3].id),/data-lumen-transition="morph"/);
  // The predecessor keeps its own authored transition; it only lends the pair its half of auto-animate.
  assert.match(section(html,deck.slides[2].id),/data-lumen-transition="fade"/);
  assert.doesNotMatch(section(html,deck.slides[4].id),/data-auto-animate/);
  assert.doesNotMatch(section(html,deck.slides[1].id),/data-auto-animate/);
});
test('morph on the first slide is rejected, because it has nothing to animate from',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.slides[0].transition='morph';
  await writeJSON(path.join(dir,'deck.json'),deck);
  await assert.rejects(validateDeck(dir),/morph/);
});
test('the stylesheet owns one duration per transition and Reveal cannot outrank it',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.slides[1].transition='fade-dark';
  await writeJSON(path.join(dir,'deck.json'),deck);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  for(const [name,value] of Object.entries(DURATIONS))assert.match(html,new RegExp(`--transition-${name}:${value}`),`no duration token for ${name}`);
  for(const name of NAMES){
    const rule=html.match(new RegExp(`\\.reveal \\.slides section\\[data-lumen-transition=${name}\\]\\{([^}]*)\\}`))?.[1];
    assert.ok(rule,`no duration rule for ${name}`);
    assert.ok(name==='none'?/transition:none/.test(rule):rule.includes(`var(--transition-${name})`),`${name} does not use its own token: ${rule}`);
    assert.ok(html.indexOf(`[data-lumen-transition=${name}]`)>html.lastIndexOf('[data-transition-speed=slow]'),`${name} is declared before Reveal's own duration rules`);
  }
  assert.match(html,/id="transition-veil"/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, writeJSON, checkSchema, validateDeck } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

const chain=['Problema','Especificación','Gates humanos','TDD','Evaluación','Evidencia','Aprendizaje'];
const steps=chain.map((title,i)=>({title,detail:`Paso ${i+1}: qué ocurre en ${title.toLowerCase()}.`}));
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lumen-scene-'));await fs.cp(path.join(ROOT,'decks/demo'),dir,{recursive:true,filter:s=>!s.includes(`${path.sep}output`)&&!s.includes(`${path.sep}runs`)});t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
const deckWith=(scene)=>({schemaVersion:'1.0',id:'t',title:'T',lang:'es',author:'A',theme:'ink',font:'inter',brand:'lumen',sources:[],slides:[{id:'s',layout:'scene',title:'T',body:'B',scene,basis:'demo',sourceIds:[]}]});

test('the schema accepts an ordered pipeline scene and keeps the existing kinds without steps',async()=>{
  await checkSchema('deck',deckWith({kind:'pipeline',caption:'Ilustración del recorrido.',steps}));
  await checkSchema('deck',deckWith({kind:'pipeline',caption:'Ciclo ilustrado.',loop:true,steps}));
  await checkSchema('deck',deckWith({kind:'network',caption:'Ilustración conceptual.'}));
  await checkSchema('deck',deckWith({kind:'robot',caption:'Ilustración conceptual.'}));
});
test('the schema rejects an over-cap sequence, a malformed step and a pipeline without steps',async()=>{
  const many=Array.from({length:9},(_,i)=>({title:`Paso ${i}`,detail:'Detalle.'}));
  await assert.rejects(checkSchema('deck',deckWith({kind:'pipeline',caption:'C.',steps:many})),/steps/);
  await assert.rejects(checkSchema('deck',deckWith({kind:'pipeline',caption:'C.',steps:[{title:'Solo título'},{title:'B',detail:'D'}]})),/detail/);
  await assert.rejects(checkSchema('deck',deckWith({kind:'pipeline',caption:'C.',steps:[{title:'A',detail:'D',node:'A'},{title:'B',detail:'D'}]})),/additional properties/);
  await assert.rejects(checkSchema('deck',deckWith({kind:'pipeline',caption:'C.'})),/steps/);
});
test('validateDeck accepts the pipeline scene and rejects one without its ordered steps',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json')),slide=deck.slides.find(s=>s.scene);
  slide.scene={kind:'pipeline',caption:'Ilustración del recorrido, no una simulación.',steps};
  await writeJSON(path.join(dir,'deck.json'),deck);
  assert.equal((await validateDeck(dir)).slides.find(s=>s.scene).scene.steps.length,7);
  delete slide.scene.steps;await writeJSON(path.join(dir,'deck.json'),deck);
  await assert.rejects(validateDeck(dir),/steps/);
});
test('the no-GPU fallback carries the ordered step list, not only the caption',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json')),slide=deck.slides.find(s=>s.scene);
  slide.scene={kind:'pipeline',caption:'Ilustración del recorrido, no una simulación.',steps};
  await writeJSON(path.join(dir,'deck.json'),deck);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  const fallback=html.match(/<[^>]*class="scene-fallback[^"]*"[\s\S]*?<\/(?:ol|div)>/)?.[0]??'';
  for(const title of chain)assert.ok(fallback.includes(title),`fallback is missing ${title}`);
  assert.match(fallback,/<ol/);
  assert.ok(fallback.indexOf('Problema')<fallback.indexOf('Aprendizaje'),'the fallback must keep the authored order');
  assert.ok(html.includes(steps[0].detail),'the fallback must explain each step');
});
test('the pipeline slide keeps a stepper and the pause control',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json')),slide=deck.slides.find(s=>s.scene);
  slide.scene={kind:'pipeline',caption:'Ilustración del recorrido, no una simulación.',steps};
  await writeJSON(path.join(dir,'deck.json'),deck);
  const built=await buildDeck(dir),html=await fs.readFile(path.join(built.out,'index.html'),'utf8');
  assert.match(html,/class="step-controls"/);
  assert.match(html,/data-scene-step="-1"/);
  assert.match(html,/data-scene-step="1"/);
  assert.match(html,/class="scene-toggle" data-for="network"/);
});

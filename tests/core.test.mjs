import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, stable, validateDeck, safeFile, writeJSON } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';
import { packDeck } from '../src/export.mjs';
import { parseEvents, parseArtifact, invokeAdapter, acceptStage } from '../src/harness.mjs';
import { researchPlan } from '../src/research.mjs';

async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lumen-test-'));await fs.cp(path.join(ROOT,'decks/demo'),dir,{recursive:true,filter:s=>!s.includes(`${path.sep}output`)&&!s.includes(`${path.sep}runs`)});t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('evidence rejects dangling references and fabricated uncited factual slides',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.slides[0].sourceIds=['missing'];await writeJSON(path.join(dir,'deck.json'),deck);await assert.rejects(validateDeck(dir),/unknown source/);
  deck.slides[0].sourceIds=[];deck.slides[0].basis='evidence';await writeJSON(path.join(dir,'deck.json'),deck);await assert.rejects(validateDeck(dir),/requires a source/);
});
test('invalid chart dimensions and active diagram content are rejected',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.slides.find(s=>s.chart).chart.series[0].values.pop();await writeJSON(path.join(dir,'deck.json'),deck);await assert.rejects(validateDeck(dir),/lengths differ/);
  deck.slides.find(s=>s.chart).chart.series[0].values.push(22);deck.slides.find(s=>s.diagram).diagram.code+='\nclick A "javascript:alert(1)"';await writeJSON(path.join(dir,'deck.json'),deck);await assert.rejects(validateDeck(dir),/disabled/);
});
test('build bytes are reproducible and content cannot break out of inline JSON/HTML',async t=>{
  const dir=await fixture(t),deck=await json(path.join(dir,'deck.json'));
  deck.slides[0].title='</script><img src=x onerror=alert(1)>';await writeJSON(path.join(dir,'deck.json'),deck);
  const first=await buildDeck(dir),second=await buildDeck(dir);
  assert.equal(first.sha256,second.sha256);
  const html=await fs.readFile(path.join(first.out,'index.html'),'utf8');assert.ok(!html.includes('<img src=x onerror='));assert.ok(html.includes('\\u003c/script>'));
});
test('asset traversal and symlink escape fail',async t=>{
  const dir=await fixture(t);await assert.rejects(safeFile(dir,'../'),/outside/);
  try{await fs.symlink(path.join(ROOT,'package.json'),path.join(dir,'linked.json'),'file');}catch(e){if(process.platform==='win32'&&e.code==='EPERM')return;throw e;}
  await assert.rejects(safeFile(dir,'linked.json'),/outside/);
});
test('resource indexing exposes truncation and preserves content hash',async t=>{
  const dir=await fixture(t);await fs.writeFile(path.join(dir,'resources','long.txt'),'x'.repeat(13000));
  const p=await researchPlan(dir),res=p.resources.find(x=>x.path.endsWith('long.txt'));assert.equal(res.excerpt.length,12000);assert.equal(res.truncated,true);assert.equal(res.sha256.length,64);assert.ok(p.queries.length>0);
});
test('provider outputs parse final artifacts, unknown usage stays null',()=>{
  const events={codex:[{type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:5,cached_input_tokens:3}}],claude:[{type:'result',result:'{"ok":true}',usage:{input_tokens:10,output_tokens:5}}],opencode:[{type:'text',part:{text:'{"ok":true}'}},{type:'step_finish',part:{tokens:{input:10,output:5}}}],pi:[{type:'message_end',message:{role:'assistant',content:[{type:'text',text:'{"ok":true}'}],usage:{input:10,output:5}}}]};
  for(const[name,lines]of Object.entries(events)){const p=parseEvents(name,lines.map(JSON.stringify).join('\n'));assert.deepEqual(parseArtifact(p.text),{ok:true});assert.equal(p.usage.input,10);assert.equal(p.usage.output,5);}
  assert.equal(parseEvents('pi','').usage,null);assert.ok(parseEvents('claude',JSON.stringify({type:'result',is_error:true,result:'failed'})).failure);
});
test('all four adapters invoke a real subprocess and parse its contract',async t=>{
  const dir=await fixture(t);
  const script=path.join(dir,'mock.mjs');await fs.writeFile(script,`let input='';for await(const b of process.stdin)input+=b;const p=process.argv[2];const text=JSON.stringify({ok:true});const events={codex:{type:'item.completed',item:{type:'agent_message',text}},claude:{type:'result',result:text},opencode:{type:'text',part:{text}},pi:{type:'message_end',message:{role:'assistant',content:[{type:'text',text}]}}};console.log(JSON.stringify(events[p]));`);
  const config=Object.fromEntries(['codex','claude','opencode','pi'].map(p=>[p,{command:process.execPath,args:[script,p],input:'stdin'}]));await writeJSON(path.join(dir,'adapters.json'),config);
  for(const provider of Object.keys(config)){const r=await invokeAdapter(provider,'A task',path.join(dir,'calls',provider),{adapters:path.join(dir,'adapters.json'),timeoutMs:10000});assert.deepEqual(r.artifact,{ok:true});assert.equal(r.metrics.usage,null);assert.ok(r.metrics.elapsedMs>=0);}
});
test('rejected review and unresearched sources cannot overwrite accepted artifacts',async t=>{
  const dir=await fixture(t);await assert.rejects(acceptStage('review',dir,{approved:false,issues:[{detail:'Missing source'}],checkedClaims:[]}),/corrections/);
  await assert.rejects(acceptStage('review',dir,{approved:true,issues:[],checkedClaims:[]}),/did not check/);
  const deck=await json(path.join(dir,'deck.json'));deck.sources[0].url='https://example.org/invented';await assert.rejects(acceptStage('compose',dir,deck),/unresearched/);
});
test('packaging refuses a stale PDF',async t=>{
  const dir=await fixture(t);await buildDeck(dir);await fs.writeFile(path.join(dir,'output/presentation.pdf'),'stale');await writeJSON(path.join(dir,'output/pdf-manifest.json'),{htmlHash:'old',pdfHash:'old'});await assert.rejects(packDeck(dir),/stale/);
});

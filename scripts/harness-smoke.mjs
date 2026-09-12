// An end-to-end deterministic pipeline check with a simulated provider, not a live LLM.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { ROOT, json, writeJSON } from '../src/core.mjs';
import { runHarness } from '../src/harness.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lumen-pipeline-'));
try{
  await fs.cp(path.join(ROOT,'decks/demo'),dir,{recursive:true,filter:p=>!p.includes(`${path.sep}output`)&&!p.includes(`${path.sep}runs`)});
  const deck=await json(path.join(dir,'deck.json'));
  const review={approved:true,issues:[],checkedClaims:deck.slides.filter(s=>s.basis==='evidence').map(s=>({slideId:s.id,sourceIds:s.sourceIds,result:'supported',detail:'Simulated review of fixture'}))};
  const fixtures=path.join(dir,'fixtures');await fs.mkdir(fixtures);
  for(const [stage,file]of Object.entries({research:'research.json',storyboard:'storyboard.json',compose:'deck.json'}))await fs.copyFile(path.join(dir,file),path.join(fixtures,`${stage}.json`));
  await writeJSON(path.join(fixtures,'review.json'),review);
  const script=path.join(dir,'provider.mjs');
  await fs.writeFile(script,`import fs from 'node:fs/promises';import path from 'node:path';let prompt='';for await(const b of process.stdin)prompt+=b;const stage=prompt.startsWith('# Researcher')?'research':prompt.startsWith('# Storyboard')?'storyboard':prompt.startsWith('# Presentation composer')?'compose':'review';const text=await fs.readFile(path.join(process.argv[2],stage+'.json'),'utf8');console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:20}}));`);
  const adapters=path.join(dir,'adapters.json');await writeJSON(adapters,{codex:{command:process.execPath,args:[script,fixtures],input:'stdin'}});
  const report=await runHarness(dir,'codex',{adapters,timeoutMs:30000});assert.equal(report.status,'completed');assert.equal(report.stages.length,4);assert.equal(report.usage.input,400);assert.equal(report.verification.passed,true);await fs.access(report.portable.out);
  const resumed=await runHarness(dir,'codex',{adapters,stage:'research',resume:true});assert.equal(resumed.stages[0].status,'reused');
  await fs.writeFile(path.join(dir,'resources','new-note.txt'),'A new source resource changes the input fingerprint.');
  const changed=await runHarness(dir,'codex',{adapters,stage:'research',resume:true});assert.equal(changed.stages[0].status,'completed');
  const result={passed:true,provider:'simulated codex event contract',stages:report.stages.map(s=>s.stage),exports:['HTML','PDF','ZIP'],resume:'reused unchanged stage',invalidation:'resource change reran research',usage:report.usage};
  await writeJSON(path.join(ROOT,'.qa/harness-report.json'),result);console.log(JSON.stringify(result,null,2));
}finally{await fs.rm(dir,{recursive:true,force:true});}

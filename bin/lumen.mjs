#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { parseArgs } from 'node:util';
import spawn from 'cross-spawn';
import { ROOT, json, id, validateDeck, writeJSON, safeFile } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';
import { researchPlan } from '../src/research.mjs';
import { promptFor, runHarness, acceptStage, parseArtifact } from '../src/harness.mjs';
import { exportPDF, verifyDeck, packDeck } from '../src/export.mjs';

const version=(await json(path.join(ROOT,'package.json'))).version;
const help=`Lumen Slides ${version} · Node.js 22+

node bin/lumen.mjs new <name> [--title "Tema"] [--theme ink]
node bin/lumen.mjs research <deck-dir>
node bin/lumen.mjs prompt <deck-dir> --stage research|storyboard|compose|review
node bin/lumen.mjs accept <deck-dir> --stage <stage> --file <artifact.json>
node bin/lumen.mjs run <deck-dir> --agent codex|claude|opencode|pi [--model <id>] [--resume]
node bin/lumen.mjs validate|build|verify|pdf|pack|serve <deck-dir> [--out <path>]
node bin/lumen.mjs sources [--topic software|ai|llm|statistics|robotics|science|math|news]
node bin/lumen.mjs themes
node bin/lumen.mjs template <name> [--from statement]
node bin/lumen.mjs doctor

run supports --stage, --timeout <seconds>, --adapters <config.json>.
serve binds to 127.0.0.1, --port defaults to 4173. The recipient only needs index.html.
Manual agent workflow: read AGENTS.md and use the same deterministic build/verify commands.
`;
const {values:opts,positionals}=parseArgs({allowPositionals:true,options:{help:{type:'boolean',short:'h'},title:{type:'string'},theme:{type:'string'},out:{type:'string'},stage:{type:'string'},file:{type:'string'},agent:{type:'string'},model:{type:'string'},resume:{type:'boolean'},timeout:{type:'string'},adapters:{type:'string'},topic:{type:'string'},from:{type:'string'},port:{type:'string'}}});
const [command,arg]=positionals;const dir=path.resolve(arg??'decks/demo');
const print=x=>process.stdout.write(JSON.stringify(x,null,2)+'\n');
try {
  if(!command||opts.help){process.stdout.write(help);process.exit(0);}
  if(command==='new'){
    const name=id(arg),dest=path.join(ROOT,'decks',name);
    try{await fs.access(dest);throw new Error(`Deck exists: ${dest}`);}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.mkdir(path.join(dest,'resources'),{recursive:true});
    const title=opts.title??name;
    await writeJSON(path.join(dest,'brief.json'),{topic:title,audience:'Audiencia con conocimiento de tecnología',topics:['software','ai'],objective:'Explicar el tema con evidencia y ejemplos',slideCount:8,language:'es',theme:opts.theme??'ink',font:'inter',brand:'lumen',dateCutoff:new Date().toISOString().slice(0,10),researchMode:'web-and-local'});
    await writeJSON(path.join(dest,'deck.json'),{schemaVersion:'1.0',id:name,title,lang:'es',author:'',theme:opts.theme??'ink',font:'inter',brand:'lumen',sources:[],slides:[{id:'cover',layout:'cover',title,eyebrow:'Presentación',subtitle:'Borrador inicial',basis:'analysis',sourceIds:[]}]});
    await fs.writeFile(path.join(dest,'resources','README.md'),'Añade aquí documentos, notas, datos CSV/JSON, imágenes y PDFs. Conserva el origen y licencia de los recursos.\n');
    print({created:dest});
  }else if(command==='validate'){const d=await validateDeck(dir);print({valid:true,slides:d.slides.length});}
  else if(command==='build')print(await buildDeck(dir,opts.out));
  else if(command==='pdf')print(await exportPDF(dir,opts.out));
  else if(command==='pack')print(await packDeck(dir,opts.out));
  else if(command==='verify')print(await verifyDeck(dir));
  else if(command==='research') {const p=await researchPlan(dir);print({plan:path.join(dir,'research-plan.json'),queries:p.queries.length,resources:p.resources.length});}
  else if(command==='prompt'){
    const p=await promptFor(opts.stage??'research',dir);const file=opts.out??path.join(dir,'tasks',`${opts.stage??'research'}.md`);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,p);print({prompt:path.resolve(file)});
  }else if(command==='accept'){
    if(!opts.file||!opts.stage)throw new Error('accept requires --file and --stage');
    print({accepted:await acceptStage(opts.stage,dir,parseArtifact(await fs.readFile(opts.file,'utf8')))});
  }else if(command==='run'){
    if(!opts.agent)throw new Error('run requires --agent');
    const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
    const timeoutMs=Number(opts.timeout??600)*1000;if(!Number.isFinite(timeoutMs)||timeoutMs<1000)throw new Error('timeout must be positive seconds');
    print(await runHarness(dir,opts.agent,{model:opts.model,stage:opts.stage,resume:opts.resume,timeoutMs,adapters:opts.adapters,signal:controller.signal,onStage:s=>process.stderr.write(`Running ${s} with ${opts.agent}\n`)}));
  }else if(command==='sources'){
    const registry=await json(path.join(ROOT,'config/sources.json'));print(registry.sources.filter(s=>!opts.topic||s.topics.includes(opts.topic)));
  }else if(command==='themes'){
    const themes=[];for(const f of (await fs.readdir(path.join(ROOT,'themes'))).sort())if(f.endsWith('.json'))themes.push(await json(path.join(ROOT,'themes',f)));print(themes);
  }else if(command==='template'){
    const name=id(arg),source=id(opts.from??'statement'),dest=path.join(ROOT,'templates',name);
    await fs.mkdir(dest);await fs.copyFile(path.join(ROOT,'templates',source,'slide.hbs'),path.join(dest,'slide.hbs'));
    const manifest=await json(path.join(ROOT,'templates',source,'manifest.json'));await writeJSON(path.join(dest,'manifest.json'),{...manifest,id:name,name});
    print({template:dest});
  }else if(command==='serve'){
    const built=await buildDeck(dir),port=Number(opts.port??4173);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
    const server=http.createServer(async(req,res)=>{
      try{
        const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
        const file=await safeFile(built.out,name);
        const mime={'.html':'text/html; charset=utf-8','.json':'application/json','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8'}[path.extname(file)]??'application/octet-stream';
        res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff'});res.end(await fs.readFile(file));
      }catch{res.writeHead(404);res.end('Not found');}
    });
    server.listen(port,'127.0.0.1',()=>print({url:`http://127.0.0.1:${port}`}));
  }else if(command==='doctor'){
    const adapters=await json(path.join(ROOT,'config/adapters.json')),checks=[];
    for(const[name,a]of Object.entries(adapters))checks.push(await new Promise(resolve=>{
      const p=spawn(a.command,['--version'],{shell:false,windowsHide:true});let output='';const t=setTimeout(()=>{p.kill();resolve({agent:name,available:false,reason:'timeout'});},5000);
      p.stdout.on('data',b=>output+=b);p.on('error',()=>{clearTimeout(t);resolve({agent:name,available:false});});p.on('close',code=>{clearTimeout(t);resolve({agent:name,available:code===0,version:output.trim().slice(0,150)});});
    }));print({node:process.version,platform:process.platform,agents:checks,pdf:'Install Chromium: npx playwright install chromium. Or set LUMEN_CHROMIUM_PATH to Chrome/Edge executable.'});
  }else throw new Error(`Unknown command ${command}. Use --help.`);
}catch(e){process.stderr.write(`Lumen: ${e.message}\n`);process.exitCode=1;}

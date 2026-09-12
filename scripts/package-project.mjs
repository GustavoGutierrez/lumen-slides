import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { ROOT, json } from '../src/core.mjs';
import { packDeck } from '../src/export.mjs';

// Package source and a ready-to-open demo. Never include installed dependencies,
// private environment files, agent responses or the contents of other decks.
const version=(await json(path.join(ROOT,'package.json'))).version;
const output=path.join(ROOT,'dist');await fs.mkdir(output,{recursive:true});
await packDeck(path.join(ROOT,'decks/demo'),path.join(output,'lumen-demo-portable.zip'));
const entries={};const date=new Date(2020,0,1);
async function walk(relative=''){
  for(const entry of (await fs.readdir(path.join(ROOT,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    const p=path.posix.join(relative,entry.name);
    if(['node_modules','.git','.qa','dist'].includes(entry.name)||entry.name.startsWith('.env')||entry.isSymbolicLink())continue;
    if(p.startsWith('decks/')&&!['decks/demo'].some(x=>p===x||p.startsWith(x+'/')))continue;
    if(/^decks\/demo\/(output|runs|tasks)(\/|$)/.test(p)||/^decks\/demo\/(research-plan.json|verification.json|presentation.zip)$/.test(p))continue;
    if(entry.isDirectory())await walk(p);else if(entry.isFile())entries[`lumen-slides/${p}`]=[new Uint8Array(await fs.readFile(path.join(ROOT,p))),{mtime:date}];
  }
}
await walk();
for(const p of ['index.html','deck.json','sources.json','LEEME.txt','THIRD-PARTY-LICENSES.txt','manifest.json','presentation.pdf','pdf-manifest.json']){
  entries[`lumen-slides/demo/${p}`]=[new Uint8Array(await fs.readFile(path.join(ROOT,'decks/demo/output',p))),{mtime:date}];
}
try{entries['lumen-slides/source.bundle']=[new Uint8Array(await fs.readFile(path.join(output,'source.bundle'))),{mtime:date}];}catch(e){if(e.code!=='ENOENT')throw e;}
const file=path.join(output,`lumen-slides-v${version}.zip`);await fs.writeFile(file,zipSync(entries,{level:6}));console.log(JSON.stringify({file,files:Object.keys(entries).length,bytes:(await fs.stat(file)).size},null,2));

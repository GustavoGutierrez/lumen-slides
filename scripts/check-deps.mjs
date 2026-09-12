// Preflight for every dependency the project needs: reports what is missing and the exact command to fix it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';

// A preflight must survive uninstalled dependencies, so the shared helpers are optional:
// src/core.mjs pulls in ajv, and cross-spawn is itself a checked dependency.
const local={ROOT:fileURLToPath(new URL('../',import.meta.url)),json:async p=>JSON.parse(await fs.readFile(p,'utf8'))};
const {ROOT,json}=await import('../src/core.mjs').catch(()=>local);

const parts=v=>String(v??'').replace(/^[^\d]*/,'').split(/[.\-+]/).slice(0,3).map(n=>Number.parseInt(n,10)||0);
const compare=(a,b)=>{const x=parts(a),y=parts(b);for(let i=0;i<3;i++)if((x[i]??0)!==(y[i]??0))return (x[i]??0)<(y[i]??0)?-1:1;return 0;};

// The project pins engines.node as a single `>=` floor; anything else is treated as satisfied rather than guessed at.
export function satisfiesNode(required,actual){
  const m=/^\s*>=\s*v?(\d+(?:\.\d+)*)/.exec(String(required??''));
  return m?compare(actual,m[1])>=0:true;
}
export function diffDependencies(declared,installed){
  return Object.entries(declared??{}).flatMap(([name,expected])=>{
    const actual=installed?.[name]??null;
    if(actual===null)return [{name,status:'missing',expected,actual:null}];
    return compare(actual,expected)===0?[]:[{name,status:'mismatch',expected,actual}];
  });
}
export function nodeCheck(required,actual){
  const ok=satisfiesNode(required,actual);
  return {name:'Node.js runtime',group:'required',ok,detail:`${actual} installed, package.json requires "${required}"`,unlocks:'every lumen command',remediation:ok?null:`install Node 22 or newer (nvm install 22 && nvm use 22)`};
}
export function dependencyCheck(declared,installed){
  const diff=diffDependencies(declared,installed),missing=diff.filter(d=>d.status==='missing'),mismatch=diff.filter(d=>d.status==='mismatch');
  const total=Object.keys(declared??{}).length,detail=diff.length===0?`${total} pinned dependencies installed at the expected versions`
    :[`${missing.length} missing`,`${mismatch.length} version mismatch`].join(', ')+` of ${total}`
      +(missing.length?`; missing: ${missing.map(d=>d.name).join(', ')}`:'')
      +(mismatch.length?`; mismatch: ${mismatch.map(d=>`${d.name} ${d.actual} != ${d.expected}`).join(', ')}`:'');
  return {name:'npm dependencies',group:'required',ok:diff.length===0,detail,unlocks:'every lumen command',remediation:diff.length===0?null:'npm ci',dependencies:diff};
}
export const exitCodeFor=checks=>checks.some(c=>c.group==='required'&&!c.ok)?1:0;
// A passing check can still carry a nextStep: a discovered system browser works now but is worth making permanent.
export const nextSteps=checks=>[...new Set(checks.flatMap(c=>[...(c.nextStep?[c.nextStep]:[]),...(!c.ok&&c.remediation?[c.remediation]:[])]))];

// Chrome first (the channel Playwright officially supports), then Edge, then Chromium, then Brave (works, unsupported).
export function browserCandidates(platform,env={}){
  if(platform==='win32'){
    const out=[],push=(base,name,...segments)=>{if(base)out.push({name,path:path.win32.join(base,...segments)});};
    const pf=env.PROGRAMFILES,px=env['PROGRAMFILES(X86)'],la=env.LOCALAPPDATA;
    const chrome=['Google','Chrome','Application','chrome.exe'],edge=['Microsoft','Edge','Application','msedge.exe'],brave=['BraveSoftware','Brave-Browser','Application','brave.exe'];
    push(pf,'Google Chrome',...chrome);push(px,'Google Chrome',...chrome);push(la,'Google Chrome',...chrome);
    push(px,'Microsoft Edge',...edge);push(pf,'Microsoft Edge',...edge);
    push(pf,'Brave',...brave);push(px,'Brave',...brave);push(la,'Brave',...brave);
    return out;
  }
  if(platform==='darwin')return [
    {name:'Google Chrome',path:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},
    {name:'Microsoft Edge',path:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'},
    {name:'Chromium',path:'/Applications/Chromium.app/Contents/MacOS/Chromium'},
    {name:'Brave',path:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'},
  ];
  return [
    {name:'Google Chrome',path:'/usr/bin/google-chrome'},
    {name:'Google Chrome',path:'/usr/bin/google-chrome-stable'},
    {name:'Google Chrome',path:'/opt/google/chrome/chrome'},
    {name:'Microsoft Edge',path:'/usr/bin/microsoft-edge'},
    {name:'Microsoft Edge',path:'/usr/bin/microsoft-edge-stable'},
    {name:'Chromium',path:'/usr/bin/chromium'},
    {name:'Chromium',path:'/usr/bin/chromium-browser'},
    {name:'Chromium',path:'/snap/bin/chromium'},
    {name:'Brave',path:'/snap/bin/brave'},
    {name:'Brave',path:'/usr/bin/brave-browser'},
    {name:'Brave',path:'/opt/brave.com/brave/brave'},
  ];
}
// Double quotes keep macOS paths such as "Google Chrome.app" intact in both shells.
export function setEnvCommand(platform,value){
  return platform==='win32'
    ?`$env:LUMEN_CHROMIUM_PATH = "${value}"  (persist it with: setx LUMEN_CHROMIUM_PATH "${value}")`
    :`export LUMEN_CHROMIUM_PATH="${value}"  (persist it by adding that line to ~/.bashrc or ~/.zshrc)`;
}
const CHROMIUM_ONLY='Note: LUMEN_CHROMIUM_PATH only substitutes chromium — npm run test:browser still needs npm run setup:browsers for firefox and webkit.';
export function formatReport(checks){
  const lines=[];
  for(const[group,title]of [['required','REQUIRED (blocks everything)'],['optional','OPTIONAL (gates a specific feature)']]){
    const group_=checks.filter(c=>c.group===group);if(!group_.length)continue;
    lines.push(title);
    for(const c of group_){
      lines.push(`  [${c.ok?'ok':'missing'}] ${c.name} — ${c.detail??''}`);
      lines.push(`         unlocks: ${c.unlocks??'—'}`);
      if(!c.ok&&c.remediation)lines.push(`         fix: ${c.remediation}`);
    }
    lines.push('');
  }
  const steps=nextSteps(checks);
  if(steps.length){lines.push('Next steps (run in this order):');steps.forEach((s,i)=>lines.push(`  ${i+1}. ${s}`));}
  else lines.push('All checks passed. Nothing to install.');
  if(checks.some(c=>c.chromiumSubstitute))lines.push(CHROMIUM_ONLY);
  return lines.join('\n')+'\n';
}

async function installedVersions(names){
  const installed={};
  for(const name of names){
    try{installed[name]=(await json(path.join(ROOT,'node_modules',...name.split('/'),'package.json'))).version??null;}catch{}
  }
  return installed;
}
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
// X_OK is not meaningful on Windows, where an existing .exe is launchable.
async function launchable(p){try{await fs.access(p,process.platform==='win32'?fs.constants.F_OK:fs.constants.X_OK);return true;}catch{return false;}}
async function discoverSystemBrowser(){
  for(const candidate of browserCandidates(process.platform,process.env))if(await launchable(candidate.path))return candidate;
  return null;
}
async function browserCheck(kind,name,unlocks,remediation){
  try{
    if(kind==='chromium'&&process.env.LUMEN_CHROMIUM_PATH){
      const ok=await exists(process.env.LUMEN_CHROMIUM_PATH);
      return {name,group:'optional',ok,chromiumSubstitute:true,detail:ok?`LUMEN_CHROMIUM_PATH=${process.env.LUMEN_CHROMIUM_PATH} exists`:`LUMEN_CHROMIUM_PATH=${process.env.LUMEN_CHROMIUM_PATH} points at a file that does not exist`,unlocks,remediation:ok?null:`point LUMEN_CHROMIUM_PATH at an existing Chrome/Edge binary, or unset it and run: ${remediation}`};
    }
    const browser=(await import('playwright'))[kind];
    const executable=browser.executablePath(),ok=executable?await exists(executable):false;
    if(!ok&&kind==='chromium'){
      const found=await discoverSystemBrowser();
      // A discovered system browser makes pdf and verify genuinely work, so the check passes and only asks to be made permanent.
      if(found)return {name,group:'optional',ok:true,chromiumSubstitute:true,systemBrowser:found,detail:`Playwright chromium not installed; discovered system browser ${found.name} at ${found.path}`,unlocks,remediation:null,nextStep:`make the discovered ${found.name} permanent for lumen pdf and lumen verify: ${setEnvCommand(process.platform,found.path)}`};
    }
    return {name,group:'optional',ok,detail:ok?executable:`not installed (expected at ${executable||'unknown path'})`,unlocks,remediation:ok?null:remediation};
  }catch(e){
    return {name,group:'optional',ok:false,detail:`probe failed: ${e.message}`,unlocks,remediation};
  }
}
async function agentVersion(command){
  const spawn=await import('cross-spawn').then(m=>m.default,()=>null);
  if(!spawn)return {available:false,reason:'cross-spawn not installed'};
  return new Promise(resolve=>{
    let output='',done=false;const finish=v=>{if(!done){done=true;clearTimeout(timer);resolve(v);}};
    const child=spawn(command,['--version'],{shell:false,windowsHide:true});
    const timer=setTimeout(()=>{child.kill();finish({available:false,reason:'timeout'});},5000);
    child.stdout?.on('data',b=>output+=b);child.stderr?.on('data',()=>{});
    child.on('error',e=>finish({available:false,reason:e.code==='ENOENT'?'not found on PATH':e.message}));
    child.on('close',code=>finish({available:code===0,version:output.trim().slice(0,150),reason:code===0?undefined:`exit code ${code}`}));
  });
}
async function agentChecks(){
  let adapters;
  try{adapters=await json(path.join(ROOT,'config/adapters.json'));}catch(e){return [{name:'Agent CLIs',group:'optional',ok:false,detail:`config/adapters.json unreadable: ${e.message}`,unlocks:'lumen run --agent <name>',remediation:null}];}
  const manual='no agent CLI required: node bin/lumen.mjs prompt <deck> --stage <stage>, then node bin/lumen.mjs accept <deck> --stage <stage> --file <artifact.json>';
  const checks=[];
  for(const[name,adapter]of Object.entries(adapters)){
    const r=await agentVersion(adapter.command);
    checks.push({name:`Agent CLI: ${name}`,group:'optional',ok:r.available,detail:r.available?(r.version||`${adapter.command} responded to --version`):`${adapter.command} unavailable (${r.reason??'unknown'})`,unlocks:`lumen run --agent ${name}`,remediation:null,agent:name});
  }
  if(checks.length&&!checks.some(c=>c.ok))checks[checks.length-1].remediation=`install any agent CLI (${Object.values(adapters).map(a=>a.command).join(', ')}) — or stay with the manual workflow: ${manual}`;
  return checks;
}
export async function runChecks(){
  const pkg=await json(path.join(ROOT,'package.json'));
  const declared=pkg.dependencies??{};
  const checks=[nodeCheck(pkg.engines?.node??'',process.version),dependencyCheck(declared,await installedVersions(Object.keys(declared)))];
  checks.push(await browserCheck('chromium','Chromium (Playwright)','lumen pdf and lumen verify','npx playwright install chromium'));
  checks.push(await browserCheck('firefox','Firefox (Playwright)','npm run test:browser','npm run setup:browsers'));
  checks.push(await browserCheck('webkit','WebKit (Playwright)','npm run test:browser','npm run setup:browsers'));
  checks.push(...await agentChecks());
  return checks;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {values:opts}=parseArgs({allowPositionals:true,options:{json:{type:'boolean'},help:{type:'boolean',short:'h'}}});
  if(opts.help)process.stdout.write('node scripts/check-deps.mjs [--json]\nVerifies every dependency and prints the exact fix for anything missing.\n');
  else{
    let checks;
    try{checks=await runChecks();}catch(e){checks=[{name:'Preflight',group:'required',ok:false,detail:`checker failed: ${e.message}`,unlocks:'every lumen command',remediation:'npm ci'}];}
    process.stdout.write(opts.json?JSON.stringify({node:process.version,platform:process.platform,ok:exitCodeFor(checks)===0,checks,nextSteps:nextSteps(checks)},null,2)+'\n':formatReport(checks));
    process.exitCode=exitCodeFor(checks);
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satisfiesNode, diffDependencies, nodeCheck, dependencyCheck, exitCodeFor, nextSteps, formatReport, browserCandidates, setEnvCommand } from '../scripts/check-deps.mjs';

const first=(list,name)=>list.findIndex(c=>c.name===name);

test('node version range accepts current and newer, rejects older, includes the boundary',()=>{
  assert.equal(satisfiesNode('>=22','v22.19.0'),true);
  assert.equal(satisfiesNode('>=22','v24.0.0'),true);
  assert.equal(satisfiesNode('>=22','v22.0.0'),true);
  assert.equal(satisfiesNode('>=22','v20.19.0'),false);
  assert.equal(satisfiesNode('>=22.19.0','v22.19.0'),true);
  assert.equal(satisfiesNode('>=22.19.1','v22.19.0'),false);
  assert.equal(satisfiesNode('','v22.19.0'),true);
});
test('dependency diff separates present, missing and mismatched pins',()=>{
  const declared={ajv:'8.17.1','@fontsource/inter':'5.3.0'};
  assert.deepEqual(diffDependencies(declared,{ajv:'8.17.1','@fontsource/inter':'5.3.0'}),[]);
  assert.deepEqual(diffDependencies(declared,{'@fontsource/inter':'5.3.0'}),[{name:'ajv',status:'missing',expected:'8.17.1',actual:null}]);
  assert.deepEqual(diffDependencies(declared,{ajv:'8.16.0','@fontsource/inter':'5.3.0'}),[{name:'ajv',status:'mismatch',expected:'8.17.1',actual:'8.16.0'}]);
});
test('checks carry status, detail and remediation text',()=>{
  const good=nodeCheck('>=22','v22.19.0');assert.equal(good.ok,true);assert.equal(good.group,'required');
  const bad=nodeCheck('>=22','v20.19.0');assert.equal(bad.ok,false);assert.match(bad.remediation,/nvm install 22/);assert.match(bad.detail,/v20\.19\.0/);
  const deps=dependencyCheck({ajv:'8.17.1'},{});assert.equal(deps.ok,false);assert.equal(deps.remediation,'npm ci');assert.match(deps.detail,/1 missing/);
  const ok=dependencyCheck({ajv:'8.17.1'},{ajv:'8.17.1'});assert.equal(ok.ok,true);assert.equal(ok.remediation,null);
});
test('only required failures change the exit code',()=>{
  const pass={name:'a',group:'required',ok:true},optional={name:'b',group:'optional',ok:false,remediation:'npx playwright install chromium'};
  assert.equal(exitCodeFor([pass,optional]),0);
  assert.equal(exitCodeFor([{...pass,ok:false},optional]),1);
  assert.equal(exitCodeFor([]),0);
});
test('next steps list remediations of failing checks only, in order, without duplicates',()=>{
  const checks=[{name:'a',group:'required',ok:false,remediation:'npm ci'},{name:'b',group:'optional',ok:true,remediation:null},{name:'c',group:'optional',ok:false,remediation:'npm ci'},{name:'d',group:'optional',ok:false,remediation:'npx playwright install chromium'}];
  assert.deepEqual(nextSteps(checks),['npm ci','npx playwright install chromium']);
  assert.deepEqual(nextSteps([{name:'a',group:'required',ok:true,remediation:null}]),[]);
});
test('the report groups checks and prints remediation for every missing item',()=>{
  const checks=[nodeCheck('>=22','v20.0.0'),dependencyCheck({ajv:'8.17.1'},{ajv:'8.17.1'}),{name:'Chromium',group:'optional',ok:false,detail:'not installed',unlocks:'pdf and verify',remediation:'npx playwright install chromium'}];
  const text=formatReport(checks);
  assert.match(text,/REQUIRED/);assert.match(text,/OPTIONAL/);
  assert.match(text,/Next steps/);
  assert.match(text,/npx playwright install chromium/);
  assert.match(text,/nvm install 22/);
  assert.match(text,/pdf and verify/);
  const clean=formatReport([dependencyCheck({ajv:'8.17.1'},{ajv:'8.17.1'})]);
  assert.match(clean,/All checks passed/);
});
test('windows candidates are built from env vars and skip the ones that are unset',()=>{
  const full=browserCandidates('win32',{PROGRAMFILES:'C:\\Program Files','PROGRAMFILES(X86)':'C:\\Program Files (x86)',LOCALAPPDATA:'C:\\Users\\ana\\AppData\\Local'});
  const paths=full.map(c=>c.path);
  assert.ok(paths.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(paths.includes('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(paths.includes('C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(paths.includes('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'));
  assert.ok(paths.includes('C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'));
  const partial=browserCandidates('win32',{PROGRAMFILES:'D:\\Apps'});
  assert.deepEqual(partial.map(c=>c.path),['D:\\Apps\\Google\\Chrome\\Application\\chrome.exe','D:\\Apps\\Microsoft\\Edge\\Application\\msedge.exe','D:\\Apps\\BraveSoftware\\Brave-Browser\\Application\\brave.exe']);
  assert.equal(browserCandidates('win32',{}).length,0);
  assert.ok(!full.some(c=>c.path.includes('undefined')));
});
test('macos and linux candidates are absolute paths and need no env',()=>{
  const mac=browserCandidates('darwin',{}).map(c=>c.path);
  assert.deepEqual(mac,['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']);
  const linux=browserCandidates('linux',{}).map(c=>c.path);
  assert.deepEqual(linux,['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/opt/google/chrome/chrome','/usr/bin/microsoft-edge','/usr/bin/microsoft-edge-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/snap/bin/chromium','/snap/bin/brave','/usr/bin/brave-browser','/opt/brave.com/brave/brave']);
  assert.ok([...mac,...linux].every(p=>p.startsWith('/')));
});
test('an unknown platform falls back to the linux list',()=>{
  assert.deepEqual(browserCandidates('freebsd',{}),browserCandidates('linux',{}));
  assert.deepEqual(browserCandidates(undefined,{}),browserCandidates('linux',{}));
});
test('chrome is preferred over brave on every platform',()=>{
  const win=browserCandidates('win32',{PROGRAMFILES:'C:\\Program Files','PROGRAMFILES(X86)':'C:\\Program Files (x86)',LOCALAPPDATA:'C:\\L'});
  for(const list of [win,browserCandidates('darwin',{}),browserCandidates('linux',{})]){
    assert.ok(first(list,'Google Chrome')>=0);
    assert.ok(first(list,'Google Chrome')<first(list,'Brave'));
    assert.ok(first(list,'Microsoft Edge')<first(list,'Brave'));
  }
});
test('the set-env command matches the shell of the platform and quotes spaces',()=>{
  const win=setEnvCommand('win32','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.match(win,/^\$env:LUMEN_CHROMIUM_PATH = "C:\\Program Files\\Google/);
  assert.match(win,/setx LUMEN_CHROMIUM_PATH "/);
  const linux=setEnvCommand('linux','/usr/bin/google-chrome');
  assert.match(linux,/^export LUMEN_CHROMIUM_PATH="\/usr\/bin\/google-chrome"/);
  assert.match(linux,/bashrc|zshrc/);
  const mac=setEnvCommand('darwin','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.match(mac,/export LUMEN_CHROMIUM_PATH="\/Applications\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome"/);
});
test('a passing check can still contribute a next step, and the caveat is printed only when chromium is substituted',()=>{
  const discovered={name:'Chromium (Playwright)',group:'optional',ok:true,chromiumSubstitute:true,detail:'discovered system browser Google Chrome at /usr/bin/google-chrome',unlocks:'lumen pdf and lumen verify',remediation:null,nextStep:`make it permanent: ${setEnvCommand('linux','/usr/bin/google-chrome')}`};
  assert.deepEqual(nextSteps([discovered]),[discovered.nextStep]);
  assert.equal(exitCodeFor([discovered]),0);
  const text=formatReport([discovered]);
  assert.match(text,/export LUMEN_CHROMIUM_PATH="\/usr\/bin\/google-chrome"/);
  assert.match(text,/only substitutes chromium/);
  assert.doesNotMatch(formatReport([dependencyCheck({ajv:'8.17.1'},{ajv:'8.17.1'})]),/only substitutes chromium/);
});
test('a LUMEN_CHROMIUM_PATH pointing at a missing file is a failing check, not a silent skip',()=>{
  const broken={name:'Chromium (Playwright)',group:'optional',ok:false,chromiumSubstitute:true,detail:'LUMEN_CHROMIUM_PATH=/does/not/exist points at a file that does not exist',unlocks:'lumen pdf and lumen verify',remediation:'point LUMEN_CHROMIUM_PATH at an existing Chrome/Edge binary, or unset it and run: npx playwright install chromium'};
  assert.equal(exitCodeFor([broken]),0);
  const text=formatReport([broken]);
  assert.match(text,/\[missing\] Chromium/);
  assert.match(text,/points at a file that does not exist/);
  assert.deepEqual(nextSteps([broken]),[broken.remediation]);
});

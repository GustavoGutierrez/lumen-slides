import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toHex, contrastRatio, contrastReport, ink, fix, oklch, auditTheme, auditTemplate, exitCodeFor } from '../scripts/wcag.mjs';

const round2=n=>Math.round(n*100)/100;
const THEME_GOOD={id:'good',colors:{background:'#ffffff',foreground:'#000002',muted:'#55598c',accent:'#00596b',secondary:'#3f3f9c',surface:'#e6f6fa'},chart:['#00596b','#8d1f84','#3f3f9c','#8a3208']};
const THEME_BAD={id:'bad',colors:{background:'#ffffff',foreground:'#000002',muted:'#bbbbbb',accent:'#6bd9ec',secondary:'#00849b',surface:'#e6f6fa'},chart:['#6bd9ec','#f0f0f0','#00596b','#3f3f9c']};

test('input parsing accepts #rgb, #rrggbb and rgb(), and rejects anything else',()=>{
  assert.deepEqual(parseColor('#fff'),{r:255,g:255,b:255});
  assert.deepEqual(parseColor('#00849B'),{r:0,g:132,b:155});
  assert.deepEqual(parseColor('rgb(107, 217, 236)'),{r:107,g:217,b:236});
  assert.equal(toHex(parseColor('#6BD9EC')),'#6bd9ec');
  for(const bad of ['00849b','#0084','#gggggg','hsl(200 50% 50%)','rgb(300,0,0)','',null])
    assert.throws(()=>parseColor(bad),/colour/i,`expected ${String(bad)} to be rejected`);
});

test('contrast ratios match the measurements this project already recorded',()=>{
  assert.equal(round2(contrastRatio('#ffffff','#000000')),21);
  assert.equal(round2(contrastRatio('#00849B','#ffffff')),4.40);
  assert.equal(round2(contrastRatio('#6bd9ec','#ffffff')),1.65);
  assert.equal(round2(contrastRatio('#000002','#6bd9ec')),12.75);
  assert.equal(round2(contrastRatio('#ffffff','#00849B')),4.40); // the pair is symmetric
});

test('a contrast report carries the four WCAG verdicts',()=>{
  const r=contrastReport('#00849B','#ffffff');
  assert.equal(r.ratio,4.40);
  assert.deepEqual(r.checks,{aaNormal:false,aaLarge:true,aaaNormal:false,nonText:true});
  assert.equal(contrastReport('#000002','#6bd9ec').checks.aaaNormal,true);
});

test('ink picks the display ink from the field and a supporting ink that clears 4.5:1',()=>{
  for(const light of ['#6bd9ec','#ec5512']){
    const r=ink(light);
    assert.equal(r.display.hex,'#000002',`${light} should take dark ink`);
    assert.ok(r.display.ratio>=4.5);
    assert.ok(r.supporting.ratio>=4.5,`${light} supporting ink measured ${r.supporting.ratio}`);
  }
  for(const dark of ['#22243a','#1034a6']){
    const r=ink(dark);
    assert.equal(r.display.hex,'#ffffff',`${dark} should take white ink`);
    assert.ok(r.supporting.ratio>=4.5);
  }
});

test('fix reaches the target while holding the hue of the input',()=>{
  const r=fix('#00849B','#ffffff',4.5);
  assert.equal(r.ok,true);
  assert.ok(contrastRatio(r.hex,'#ffffff')>=4.5,`${r.hex} measured ${r.ratio}`);
  assert.equal(r.ratio,round2(contrastRatio(r.hex,'#ffffff')));
  assert.ok(Math.abs(oklch('#00849B').h-oklch(r.hex).h)<1,`hue moved from ${oklch('#00849B').h} to ${oklch(r.hex).h}`);
  assert.ok(r.distance>0);
});

test('fix reports an unreachable target instead of returning a colour that lost its identity',()=>{
  const r=fix('#808080','#767676',7);
  assert.equal(r.ok,false);
  assert.equal(r.hex,null);
  assert.match(r.reason,/unreachable/i);
  assert.ok(r.best<7);
});

test('audit theme passes a sound palette and flags a deliberately bad one',()=>{
  const good=auditTheme(THEME_GOOD);
  assert.equal(good.ok,true,`unexpected failures: ${good.pairs.filter(p=>p.gated&&!p.pass).map(p=>p.role).join(', ')}`);
  const bad=auditTheme(THEME_BAD);
  assert.equal(bad.ok,false);
  const failed=bad.pairs.filter(p=>p.gated&&!p.pass).map(p=>p.role);
  assert.deepEqual(failed,['muted','accent','secondary','chart[0]','chart[1]']);
  assert.equal(bad.pairs.find(p=>p.role==='surface').gated,false); // a field, reported but never gating
});

test('audit template reads the field and the colours declared against it',()=>{
  const css='.reveal .slides>section.layout-x{--background:#6bd9ec;--foreground:#000002;--muted:#00434f}\n.x-content h1{color:#ffffff}\n.x .rule{border-top-color:#00849b}\n';
  const r=auditTemplate('x',css);
  assert.equal(r.field,'#6bd9ec');
  assert.equal(r.pairs.find(p=>p.role==='--foreground').ratio,12.75);
  assert.equal(r.pairs.find(p=>p.role==='color').ratio,1.65);
  assert.equal(r.pairs.find(p=>p.role==='border-top-color').threshold,3); // non-text floor
  assert.equal(r.ok,false);
  assert.equal(auditTemplate('y','.y-content h2{font-size:52px}\n').field,null); // no field, nothing to audit
  assert.equal(auditTemplate('y','.y-content h2{font-size:52px}\n').ok,true);
});

test('exit code is non-zero only when a gated pair fails',()=>{
  assert.equal(exitCodeFor([auditTheme(THEME_GOOD)]),0);
  assert.equal(exitCodeFor([auditTheme(THEME_GOOD),auditTheme(THEME_BAD)]),1);
  assert.equal(exitCodeFor([]),0);
});

test('importing the module runs no CLI and leaves the exit code untouched',()=>{
  assert.equal(process.exitCode,undefined);
});

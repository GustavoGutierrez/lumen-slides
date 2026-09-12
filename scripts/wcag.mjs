// WCAG contrast tooling for the themes and templates this project ships: measure a pair, resolve the ink
// a field takes, walk a colour to a target ratio without losing its hue, and audit everything at once.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ROOT, json } from '../src/core.mjs';
// The deck CSS is generated from these three; a second implementation here would drift from the shipped output.
import { luminance, LIGHT_THRESHOLD, isLight } from '../src/build.mjs';

// The project paints dark ink as #000002 rather than pure black; both inks are named so the audit and the CLI agree.
export const DARK_INK='#000002', LIGHT_INK='#ffffff';
export const THRESHOLDS={aaNormal:4.5,aaLarge:3,aaaNormal:7,nonText:3};

const clamp=(n,lo,hi)=>n<lo?lo:n>hi?hi:n;
const round2=n=>Number(n.toFixed(2)),round=(n,d)=>Number(n.toFixed(d));
const ratio2=n=>n.toFixed(2);// printed ratios always carry both decimals, so 4.4 and 4.50 never read as different precisions
const byte=v=>{const n=Number(v);if(!Number.isInteger(n)||n<0||n>255)throw new Error(`Not a colour: rgb channel "${v}" is outside 0-255`);return n;};

export function parseColor(input){
  const s=String(input??'').trim();
  const hex=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if(hex){
    const h=hex[1].length===3?[...hex[1]].map(c=>c+c).join(''):hex[1],n=parseInt(h,16);
    return {r:n>>16&255,g:n>>8&255,b:n&255};
  }
  const rgb=/^rgb\(\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*[, ]\s*([0-9]{1,3})\s*\)$/i.exec(s);
  if(rgb)return {r:byte(rgb[1]),g:byte(rgb[2]),b:byte(rgb[3])};
  throw new Error(`Not a colour: "${s}". Accepted forms are #rgb, #rrggbb and rgb(r, g, b).`);
}
export const toHex=({r,g,b})=>'#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
export const normalize=input=>toHex(parseColor(input));
export const relativeLuminance=input=>luminance(normalize(input));

export function contrastRatio(a,b){
  const x=relativeLuminance(a),y=relativeLuminance(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
export function contrastReport(fg,bg){
  const ratio=contrastRatio(fg,bg);
  return {fg:normalize(fg),bg:normalize(bg),ratio:round2(ratio),checks:{
    // Rounded ratios are compared, so a pair the report prints as 4.50 is never also printed as failing 4.5.
    aaNormal:round2(ratio)>=THRESHOLDS.aaNormal,aaLarge:round2(ratio)>=THRESHOLDS.aaLarge,
    aaaNormal:round2(ratio)>=THRESHOLDS.aaaNormal,nonText:round2(ratio)>=THRESHOLDS.nonText}};
}

// OKLab/OKLCh (Björn Ottosson). Perceptually uniform, so holding H and C while moving L keeps the colour's identity;
// the same walk in RGB drifts in hue and reads as a different colour.
const gamma=c=>c<=0.0031308?12.92*c:1.055*c**(1/2.4)-0.055;
const linear=c=>(c/=255)<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;
export function oklab(input){
  const {r,g,b}=parseColor(input),R=linear(r),G=linear(g),B=linear(b);
  const l=Math.cbrt(0.4122214708*R+0.5363325363*G+0.0514459929*B);
  const m=Math.cbrt(0.2119034982*R+0.6806995451*G+0.1073969566*B);
  const s=Math.cbrt(0.0883024619*R+0.2817188376*G+0.6299787005*B);
  return {L:0.2104542553*l+0.7936177850*m-0.0040720468*s,a:1.9779984951*l-2.4285922050*m+0.4505937099*s,b:0.0259040371*l+0.7827717662*m-0.8086757660*s};
}
export function oklch(input){
  const {L,a,b}=oklab(input);
  return {l:L,c:Math.hypot(a,b),h:(Math.atan2(b,a)*180/Math.PI+360)%360};
}
// Out-of-gamut results are clipped per channel: `fix` reports the ratio it measures back from the clipped hex,
// so a clipped colour is still judged on what it actually renders as.
export function oklchToHex(l,c,h){
  const rad=h*Math.PI/180,A=c*Math.cos(rad),B=c*Math.sin(rad);
  const l_=(l+0.3963377774*A+0.2158037573*B)**3,m_=(l-0.1055613458*A-0.0638541728*B)**3,s_=(l-0.0894841775*A-1.2914855480*B)**3;
  const R=4.0767416621*l_-3.3077115913*m_+0.2309699292*s_,G=-1.2684380046*l_+2.6097574011*m_-0.3413193965*s_,Bl=-0.0041960863*l_-0.7034186147*m_+1.7076147010*s_;
  return toHex({r:clamp(gamma(R),0,1)*255,g:clamp(gamma(G),0,1)*255,b:clamp(gamma(Bl),0,1)*255});
}
export const deltaE=(a,b)=>{const x=oklab(a),y=oklab(b);return Math.hypot(x.L-y.L,x.a-y.a,x.b-y.b);};

// Nearest colour to `colour` that reaches `target` against `bg`, holding hue and chroma and moving only lightness.
export function fix(colour,bg,target=THRESHOLDS.aaNormal){
  const from=normalize(colour),field=normalize(bg),{l,c,h}=oklch(from);
  if(!(Number(target)>1))throw new Error(`Not a target ratio: "${target}". Use a number above 1, such as 4.5.`);
  if(round2(contrastRatio(from,field))>=target)return {ok:true,hex:from,ratio:round2(contrastRatio(from,field)),distance:0,moved:false,from,bg:field,target:Number(target)};
  // Contrast against a light field grows as the colour darkens, and against a dark field as it lightens.
  const edge=isLight(field)?0:1;
  const limit=oklchToHex(edge,c,h),best=round2(contrastRatio(limit,field));
  if(best<target)return {ok:false,hex:null,ratio:null,distance:null,best,from,bg:field,target:Number(target),
    reason:`unreachable: holding hue ${round2(h)} and chroma ${round(c,3)}, the most this colour reaches on ${field} is ${ratio2(best)}:1`};
  let lo=edge,hi=l;// lo always meets the target, hi never does; 40 halvings settle far below one 8-bit step.
  for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(round2(contrastRatio(oklchToHex(mid,c,h),field))>=target)lo=mid;else hi=mid;}
  const hex=oklchToHex(lo,c,h);
  return {ok:true,hex,ratio:round2(contrastRatio(hex,field)),distance:round(deltaE(from,hex),3),moved:true,from,bg:field,target:Number(target)};
}

// The display ink is the one the build itself picks; the supporting ink is the softest tint of the field that still
// carries body copy, which is what a caption or a lead paragraph on that field can use.
export function ink(field){
  const hex=normalize(field),light=isLight(hex),display=light?DARK_INK:LIGHT_INK;
  const supporting=fix(hex,hex,THRESHOLDS.aaNormal);
  return {field:hex,luminance:round(relativeLuminance(hex),4),light,threshold:round(LIGHT_THRESHOLD,4),
    display:{hex:display,ratio:round2(contrastRatio(display,hex))},
    supporting:supporting.ok?{hex:supporting.hex,ratio:supporting.ratio}:{hex:display,ratio:round2(contrastRatio(display,hex))}};
}

const pair=(role,hex,bg,threshold,gated=true)=>{
  const r=contrastReport(hex,bg);
  return {role,hex:r.fg,bg:r.bg,ratio:r.ratio,threshold,gated,pass:threshold===null?true:r.ratio>=threshold,checks:r.checks};
};
// Roles that carry glyphs are held to body-copy contrast; chart series are graphical objects at the 3:1 floor.
const INK_ROLES=['foreground','muted','accent','secondary'];
export function auditTheme(theme){
  const bg=theme?.colors?.background;
  if(!bg)throw new Error(`Theme "${theme?.id??'?'}" declares no background colour.`);
  const pairs=[
    ...INK_ROLES.filter(r=>theme.colors[r]).map(r=>pair(r,theme.colors[r],bg,THRESHOLDS.aaNormal)),
    // surface is a second field, not ink on the first: it is measured for information and never gates.
    ...(theme.colors.surface?[pair('surface',theme.colors.surface,bg,null,false)]:[]),
    ...(theme.chart??[]).map((c,i)=>pair(`chart[${i}]`,c,bg,THRESHOLDS.nonText)),
  ];
  return {kind:'theme',id:theme.id,field:normalize(bg),pairs,ok:pairs.every(p=>!p.gated||p.pass)};
}

const CSS_COMMENT=/\/\*[\s\S]*?\*\//g;
// Declarations only ever follow `{` or `;`, and anchoring there keeps `border-top-color` whole and
// keeps a selector's own `:` (`body:has(...)`) from reading as a property.
const DECLARATION=/[{;]\s*(-{0,2}[a-z][a-z0-9-]*)\s*:\s*([^;{}]+)/gi;
// Six digits are tried before three so a #rrggbb literal is never truncated to its first half.
const HEX=/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i;
// A field is a surface behind other colours, so it is the reference of the audit and never one of its pairs.
const FIELD_ROLES=new Set(['--background','--surface','background','background-color']);
const TEXT_ROLES=new Set(['color','--foreground','--muted','--accent','--secondary']);
export function auditTemplate(id,css){
  const clean=String(css??'').replace(CSS_COMMENT,'');
  const field=new RegExp(`--background\\s*:\\s*(${HEX.source})`,'i').exec(clean)?.[1];
  if(!field)return {kind:'template',id,field:null,pairs:[],ok:true,note:'declares no field of its own; it inherits the theme background'};
  const bg=normalize(field),seen=new Set(),pairs=[];
  for(const[,property,value]of clean.matchAll(DECLARATION)){
    const role=property.toLowerCase(),hex=HEX.exec(value)?.[0];
    if(!hex||FIELD_ROLES.has(role))continue;
    const key=`${role} ${hex.toLowerCase()}`;
    if(seen.has(key)||normalize(hex)===bg)continue;
    seen.add(key);
    pairs.push(pair(role,hex,bg,TEXT_ROLES.has(role)?THRESHOLDS.aaNormal:THRESHOLDS.nonText));
  }
  return {kind:'template',id,field:bg,pairs,ok:pairs.every(p=>!p.gated||p.pass)};
}

export const exitCodeFor=results=>results.some(r=>!r.ok)?1:0;

const listDirs=async dir=>(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
export const themeIds=async()=>(await fs.readdir(path.join(ROOT,'themes'))).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)).sort();
export const templateIds=async()=>listDirs(path.join(ROOT,'templates'));
export const loadTheme=async id=>auditTheme(await json(path.join(ROOT,'themes',`${id}.json`)));
export const loadTemplate=async id=>auditTemplate(id,await fs.readFile(path.join(ROOT,'templates',id,'style.css'),'utf8').catch(()=>''));
export async function auditAll(){
  const results=[];
  for(const id of await themeIds())results.push(await loadTheme(id));
  for(const id of await templateIds())results.push(await loadTemplate(id));
  return results;
}

const verdict=p=>p.threshold===null?'info':p.pass?'ok':'FAIL';
const need=p=>p.threshold===null?'field, not gated':`needs ${p.threshold}:1`;
export function formatAudit(results){
  const lines=[];
  for(const r of results){
    if(!r.pairs.length){lines.push(`${r.kind} ${r.id} — ${r.note??'nothing to audit'}`,'');continue;}
    lines.push(`${r.kind} ${r.id} — field ${r.field}${r.ok?'':'  [FAILS]'}`);
    for(const p of r.pairs)lines.push(`  [${verdict(p)}] ${p.role.padEnd(18)} ${p.hex}  ${ratio2(p.ratio).padStart(5)}:1  (${need(p)})`);
    lines.push('');
  }
  const failed=results.filter(r=>!r.ok);
  lines.push(failed.length?`${failed.length} of ${results.length} audited items carry a failing pair: ${failed.map(r=>`${r.kind} ${r.id}`).join(', ')}`
    :`All ${results.length} audited items pass their applicable thresholds.`);
  return lines.join('\n')+'\n';
}
const mark=ok=>ok?'pass':'FAIL';
export const formatContrast=reports=>reports.map(r=>
  `${r.fg} on ${r.bg}  ${ratio2(r.ratio)}:1\n  AA normal (4.5)  ${mark(r.checks.aaNormal)}\n  AA large (3)     ${mark(r.checks.aaLarge)}\n  AAA normal (7)   ${mark(r.checks.aaaNormal)}\n  non-text (3)     ${mark(r.checks.nonText)}`).join('\n')+'\n';
export const formatInk=r=>`field ${r.field} is ${r.light?'light':'dark'} (luminance ${r.luminance}, threshold ${r.threshold})\n`
  +`  display ink     ${r.display.hex}  ${ratio2(r.display.ratio)}:1\n  supporting copy ${r.supporting.hex}  ${ratio2(r.supporting.ratio)}:1\n`;
export const formatFix=r=>r.ok
  ?`${r.from} on ${r.bg} -> ${r.hex}  ${ratio2(r.ratio)}:1 (target ${r.target})\n  moved ${r.distance} in OKLab; hue and chroma held\n`
  :`${r.from} on ${r.bg} -> ${r.reason}\n  target ${r.target} not met; nothing returned rather than a colour that lost its identity\n`;

const USAGE=`node scripts/wcag.mjs <command> [--json]

  contrast <fg> <bg> [<fg> <bg> ...]   ratio and AA/AAA/non-text verdicts for every pair
  ink <field>                          the display ink the field takes and a supporting ink at 4.5:1
  fix <colour> <bg> [--target 4.5]     nearest colour reaching the target, holding hue and chroma
  audit theme <id> | template <id> | all
`;
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {values:opts,positionals:args}=parseArgs({allowPositionals:true,options:{json:{type:'boolean'},target:{type:'string'},help:{type:'boolean',short:'h'}}});
  const out=(text,value)=>process.stdout.write(opts.json?JSON.stringify(value,null,2)+'\n':text);
  const [command,...rest]=args;
  try{
    if(opts.help||!command)process.stdout.write(USAGE);
    else if(command==='contrast'){
      if(!rest.length||rest.length%2)throw new Error('contrast takes pairs: <fg> <bg> [<fg> <bg> ...]');
      const reports=[];for(let i=0;i<rest.length;i+=2)reports.push(contrastReport(rest[i],rest[i+1]));
      out(formatContrast(reports),reports);
    }
    else if(command==='ink'){
      if(rest.length!==1)throw new Error('ink takes one field colour');
      const r=ink(rest[0]);out(formatInk(r),r);
    }
    else if(command==='fix'){
      if(rest.length!==2)throw new Error('fix takes <colour> <bg>');
      const r=fix(rest[0],rest[1],opts.target?Number(opts.target):THRESHOLDS.aaNormal);
      out(formatFix(r),r);
      if(!r.ok)process.exitCode=1;
    }
    else if(command==='audit'){
      const [scope,id]=rest;
      const results=scope==='all'?await auditAll()
        :scope==='theme'&&id?[await loadTheme(id)]
        :scope==='template'&&id?[await loadTemplate(id)]
        :null;
      if(!results)throw new Error('audit takes: all | theme <id> | template <id>');
      out(formatAudit(results),{ok:exitCodeFor(results)===0,results});
      process.exitCode=exitCodeFor(results);
    }
    else throw new Error(`Unknown command "${command}"`);
  }catch(e){
    process.stderr.write(`${e.message}\n\n${USAGE}`);
    process.exitCode=1;
  }
}

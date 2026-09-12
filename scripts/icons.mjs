// Icon catalogue for the three prefixes a deck can reference: search it by meaning, verify a batch of
// references before validate does, and browse the categories. The catalogue is far too large to inject
// into a prompt, so the harness ships the command instead and the agent asks this script.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ROOT, iconSets } from '../src/core.mjs';

// The resolver's own set map, so the catalogue is enumerated from the very directories iconSVG reads and
// `has` answers exactly what a build would accept rather than what a second list claims exists.
export const ICON_SETS=iconSets;
export const SEARCH_COMMAND='node scripts/icons.mjs search <terms>';
// Simple Icons ships no tag index, so its searchable set is the filename alone.
const BRAND_CATEGORY='Brands';
const PREFIX_ORDER=Object.keys(ICON_SETS);
const NAME=/^[a-z0-9][a-z0-9-]*$/;

const svgNames=async dir=>(await fs.readdir(path.join(ROOT,dir))).filter(f=>f.endsWith('.svg')).map(f=>f.slice(0,-4)).sort();
export async function loadCatalog(){
  // Tabler's metadata is keyed by the outline name and covers the filled twins too; a package without it
  // still yields a searchable catalogue, just one ranked on names alone.
  let meta={};
  try{meta=JSON.parse(await fs.readFile(path.join(ROOT,'node_modules/@tabler/icons/icons.json'),'utf8'));}catch{}
  const entries=[];
  for(const prefix of PREFIX_ORDER){
    for(const name of await svgNames(ICON_SETS[prefix])){
      const m=prefix==='brand'?null:meta[name];
      entries.push({ref:`${prefix}:${name}`,prefix,name,category:m?.category??BRAND_CATEGORY,tags:(m?.tags??[]).map(String)});
    }
  }
  return entries;
}
export const parseTerms=values=>[...new Set(values.flatMap(v=>String(v??'').toLowerCase().split(/[\s,]+/)).filter(Boolean))];

// A term earns the strongest name match it can, then adds whatever the tags and the category contribute:
// an exact name always outranks a word inside a longer name, which outranks a tag hit.
export function termScore(entry,term){
  const {name}=entry;
  let score=name===term?100:name.split('-').includes(term)?60:name.startsWith(term)?40:name.includes(term)?25:0;
  if(entry.tags.includes(term))score+=20;else if(entry.tags.some(t=>t.includes(term)))score+=8;
  const category=entry.category.toLowerCase();
  if(category===term)score+=10;else if(category.includes(term))score+=4;
  return score;
}
export function scoreEntry(entry,terms){
  const each=terms.map(t=>termScore(entry,t));
  const total=each.reduce((a,b)=>a+b,0);
  // An icon answering every term is a better answer than one answering a single term loudly.
  return total&&each.every(Boolean)&&terms.length>1?total*1.5:total;
}
export const matchingTags=(entry,terms)=>entry.tags.filter(t=>terms.some(term=>t.includes(term)));
export function search(catalog,terms,limit=12){
  if(!terms.length)throw new Error('search takes one or more terms');
  return catalog.map(entry=>({entry,score:scoreEntry(entry,terms)})).filter(r=>r.score>0)
    .sort((a,b)=>b.score-a.score
      ||PREFIX_ORDER.indexOf(a.entry.prefix)-PREFIX_ORDER.indexOf(b.entry.prefix)
      ||a.entry.name.length-b.entry.name.length
      ||a.entry.name.localeCompare(b.entry.name))
    .slice(0,limit)
    .map(({entry,score})=>({ref:entry.ref,category:entry.category,tags:matchingTags(entry,terms),score:Number(score.toFixed(1))}));
}
// A malformed reference is reported as missing rather than thrown: `has` exists to hand back the whole
// list of what will fail at validate, not to stop at the first bad entry.
export function has(catalog,refs){
  if(!refs.length)throw new Error('has takes one or more icon references');
  const known=new Set(catalog.map(e=>e.ref));
  const checked=refs.map(ref=>{
    const [prefix,name,...rest]=String(ref).split(':');
    const reason=!ICON_SETS[prefix]||rest.length?`unknown icon set; use ${PREFIX_ORDER.join(':, ')}:`
      :!NAME.test(name??'')?'invalid icon name; lowercase letters, digits and hyphens only'
      :known.has(ref)?null:'no icon of that name in the set';
    return {ref,ok:reason===null,...(reason?{reason}:{})};
  });
  return {ok:checked.every(c=>c.ok),checked,missing:checked.filter(c=>!c.ok).map(c=>c.ref)};
}
export function categories(catalog){
  const counts=new Map();
  for(const e of catalog)counts.set(e.category,(counts.get(e.category)??0)+1);
  return {total:catalog.length,categories:[...counts].map(([category,count])=>({category,count}))
    .sort((a,b)=>b.count-a.count||a.category.localeCompare(b.category))};
}

export const formatSearch=results=>results.length
  ?results.map(r=>`  ${r.ref.padEnd(34)} ${r.category.padEnd(14)} ${r.tags.slice(0,6).join(', ')}`).join('\n')+'\n'
  :'  no icon matches those terms; try a broader word or browse: node scripts/icons.mjs categories\n';
export const formatHas=report=>report.checked.map(c=>`  [${c.ok?'ok':'MISSING'}] ${c.ref}${c.ok?'':` — ${c.reason}`}`).join('\n')
  +'\n'+(report.ok?`All ${report.checked.length} references resolve.\n`:`${report.missing.length} of ${report.checked.length} references do not exist: ${report.missing.join(', ')}\n`);
export const formatCategories=report=>report.categories.map(c=>`  ${String(c.count).padStart(5)}  ${c.category}`).join('\n')
  +`\n  ${String(report.total).padStart(5)}  total reachable icons\n`;

const USAGE=`node scripts/icons.mjs <command> [--json]

  search <terms...> [--limit 12]   rank icons by name, tags and category; prints pasteable references
  has <ref...>                     verify references exist; exits 1 when any is missing
  categories                       every category with its icon count

References take one of ${PREFIX_ORDER.map(p=>`${p}:<name>`).join(', ')}, for example tabler:ai-agent.
`;
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {values:opts,positionals:args}=parseArgs({allowPositionals:true,options:{json:{type:'boolean'},limit:{type:'string'},help:{type:'boolean',short:'h'}}});
  const out=(text,value)=>process.stdout.write(opts.json?JSON.stringify(value,null,2)+'\n':text);
  const [command,...rest]=args;
  try{
    if(opts.help||!command)process.stdout.write(USAGE);
    else if(command==='search'){
      const limit=opts.limit===undefined?12:Number(opts.limit);
      if(!Number.isInteger(limit)||limit<1)throw new Error(`Not a limit: "${opts.limit}". Use a positive whole number.`);
      const terms=parseTerms(rest),results=search(await loadCatalog(),terms,limit);
      out(formatSearch(results),{terms,results});
    }
    else if(command==='has'){
      const report=has(await loadCatalog(),rest);
      out(formatHas(report),report);
      // The only non-zero exit of a command that ran: a deck carrying these references would fail validate.
      if(!report.ok)process.exitCode=1;
    }
    else if(command==='categories'){
      const report=categories(await loadCatalog());
      out(formatCategories(report),report);
    }
    else throw new Error(`Unknown command "${command}"`);
  }catch(e){
    process.stderr.write(`${e.message}\n\n${USAGE}`);
    process.exitCode=1;
  }
}

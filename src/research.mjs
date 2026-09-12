import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, json, stable, hash, listFiles, writeJSON, safeFile } from './core.mjs';

export async function indexResources(dir) {
  const base=path.join(dir,'resources'); await fs.mkdir(base,{recursive:true});
  const result=[];
  for(const name of await listFiles(base)) {
    const file=await safeFile(base,name), bytes=await fs.readFile(file);
    const textType=/\.(md|txt|csv|tsv|json|ya?ml|tex)$/i.test(name);
    result.push({path:`resources/${name}`,bytes:bytes.length,sha256:hash(bytes),type:textType?'text':/\.pdf$/i.test(name)?'pdf':'asset',...(textType?{excerpt:bytes.toString('utf8').slice(0,12000),truncated:bytes.toString('utf8').length>12000}:{})});
  }
  return result;
}
export async function researchPlan(dir) {
  const brief=await json(path.join(dir,'brief.json'));
  if(!brief.topic || !brief.audience || !Array.isArray(brief.topics)) throw new Error('brief.json requires topic, audience and topics[]');
  const registry=await json(path.join(ROOT,'config/sources.json'));
  const sources=registry.sources.filter(s=>s.topics.some(t=>brief.topics.includes(t)));
  const resources=await indexResources(dir);
  const queries=sources.map(s=>({source:s.id,query:`site:${s.domain} ${brief.topic}`,kind:s.kind,guidance:s.guidance}));
  const plan={brief,policy:registry.policy,queries,resources};
  await writeJSON(path.join(dir,'research-plan.json'),plan);
  return plan;
}

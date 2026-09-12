import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/core.mjs';

// Every directory under .agents/skills is a skill, copied whole so a skill's references/ and assets/ travel with it.
const skills=path.join(ROOT,'.agents/skills');
for(const entry of await fs.readdir(skills,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  for(const folder of ['.claude/skills','.opencode/skills','.pi/skills'])
    await fs.cp(path.join(skills,entry.name),path.join(ROOT,folder,entry.name),{recursive:true});
}
for(const name of ['research','storyboard','compose','review']){
  const body=await fs.readFile(path.join(ROOT,'agents',`${name}.md`),'utf8');
  for(const folder of ['.claude/agents','.opencode/agents']){
    await fs.mkdir(path.join(ROOT,folder),{recursive:true});
    const header=folder.startsWith('.claude')?`---\nname: lumen-${name}\ndescription: ${name} stage for Lumen Slides presentations\n---\n\n`:`---\ndescription: ${name} stage for Lumen Slides presentations\nmode: subagent\n---\n\n`;
    await fs.writeFile(path.join(ROOT,folder,`lumen-${name}.md`),header+body);
  }
}
process.stdout.write('Project agent files synchronized.\n');

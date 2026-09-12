import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../src/core.mjs';

const source=path.join(ROOT,'.agents/skills/lumen-decks/SKILL.md');
for(const folder of ['.claude/skills','.opencode/skills','.pi/skills']){
  const target=path.join(ROOT,folder,'lumen-decks');await fs.mkdir(target,{recursive:true});
  await fs.copyFile(source,path.join(target,'SKILL.md'));
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

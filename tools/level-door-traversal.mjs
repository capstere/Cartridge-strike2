import {readFileSync} from 'node:fs';
import {createWorld} from '../src/fps/world.mjs';
import {parseProject} from '../furniture-editor/build/level-project.mjs';
import {testDoorTraversal} from '../furniture-editor/build/door-traversal.mjs';
const path=process.argv[2]||'levels/synthetic-demo.json',project=parseProject(readFileSync(path,'utf8'));
const rows=testDoorTraversal(createWorld({levelProject:project,fresh:true}));
console.log(JSON.stringify({project:project.projectId,directions:rows.length,pass:rows.filter(r=>r.status==='pass').length,fail:rows.filter(r=>r.status!=='pass')},null,2));
if(rows.some(r=>r.status!=='pass'))process.exitCode=1;

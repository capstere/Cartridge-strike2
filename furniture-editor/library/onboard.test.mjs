import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {ONBOARD_LIBRARY} from './onboard-catalog.mjs?v=4.7.0';import {LIBRARY_ALL,LIBRARY_MAP} from './catalog.mjs';import {inspectGLB} from './glb-utils.mjs';
test('owner-authorized onboard models are unique, bounded, self-contained and hash verified',()=>{
 assert.equal(ONBOARD_LIBRARY.length,15);assert.equal(new Set(LIBRARY_ALL.map(x=>x.id)).size,LIBRARY_ALL.length);
 for(const entry of ONBOARD_LIBRARY){const bytes=readFileSync(new URL(entry.url,new URL('../',import.meta.url)));inspectGLB(bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.length,entry.bytes);assert.equal(LIBRARY_MAP.get(entry.id),entry);for(const n of [entry.width,entry.depth,entry.height])assert(Number.isFinite(n)&&n>0&&n<=10,entry.id);}
});

import {exportProject,parseProject,exportProjectZip,parseProjectZip} from '../build/level-project.mjs?v=5.7.2';
test('all onboard IDs and sizes survive the real project ZIP roundtrip',async()=>{
 const furniture={added:ONBOARD_LIBRARY.map((e,i)=>({id:`NY-OBJ-${String(i+1).padStart(4,'0')}`,roomId:'',kind:'prop',assetId:e.id,assetName:e.name,x:2,z:2,yaw:0,w:e.width,d:e.depth,height:e.height})),placements:[],removed:[]};
 const p=exportProject({furniture,assets:{library:ONBOARD_LIBRARY.map(e=>e.id),local:[],posters:[]}});
 const restored=await parseProjectZip(await exportProjectZip(p));
 assert.deepEqual(parseProject(p).furniture.added,restored.project.furniture.added);
});

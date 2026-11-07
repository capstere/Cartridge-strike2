import test from 'node:test';
import assert from 'node:assert/strict';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from '../../furniture-editor/build/level-project.mjs?v=5.7.2';
import {validateLevel} from '../../furniture-editor/build/validate-level.mjs?v=5.7.2';
import {createWorld} from './world.mjs?v=5.7.2';
import {findWalkStart} from './walk-start.mjs';

const furniture={id:'NY-OBJ-0001',kind:'prop',assetId:'studio:desk-120',assetName:'Skrivbord',roomId:'',x:5,z:5,yaw:0,w:1.2,d:.7,height:.75};
test('draft can place, save and reopen a colliding/off-floor object before gameplay exists',async()=>{
 const draft=exportProject({furniture:{placements:[],added:[furniture],removed:[]},assets:{library:[furniture.assetId],local:[],posters:[]}});
 assert.equal(parseProject(draft).furniture.added[0].x,5);
 const {project}=await parseProjectZip(await exportProjectZip(draft));
 assert.deepEqual(project.furniture.added,[furniture]);
 const report=validateLevel(project,{engine:true});
 assert.equal(report.summary.playable,false);
 assert(report.results.some(r=>r.check==='V04'&&r.status==='fail'));
});
test('walk starts on a free floor position without spawns, objectives or validation success',()=>{
 const draft=exportProject({ground:{bounds:{x0:0,z0:0,x1:20,z1:20},wallHeightDefault:2.85,floors:[{id:'BYGG-G-0001',name:'Rum',role:'room',surface:'carpet',x0:2,z0:2,x1:8,z1:8}]},
  furniture:{placements:[],added:[{...furniture,roomId:'BYGG-G-0001'}],removed:[]}});
 const world=createWorld({levelProject:draft,fresh:true}),start=findWalkStart(world);
 assert(start);assert(world.staticCanOccupy(start.x,start.z,.22,1.7,0));
 assert.notDeepEqual([start.x,start.z],[5,5]);
 assert.equal(world.anchors.bomb,null);
});

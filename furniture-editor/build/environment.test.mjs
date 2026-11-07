import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld} from '../../src/fps/world.mjs';
import {levelProjectToWorldData} from '../../src/fps/level-adapter.mjs';
import {insidePolygon,distanceSegment} from '../../src/fps/physics.mjs';
import {parseProject,exportProject} from './level-project.mjs';
import {FIXTURES,DISPLAY_FACES,fixturePose,validateEnvironment} from './environment-layout.mjs';

const project=JSON.parse(readFileSync(new URL('../../levels/floor5-prepared.json',import.meta.url)));
const {environment:env,...baseline}=project,world=createWorld({levelProject:project}),scene=world.projectScene;
const walls=new Map(scene.entries.map(w=>[w.id,w]));
test('visual dressing cannot change objectives, doorways, obstacles or playable surfaces',()=>{
 const before=levelProjectToWorldData(baseline),after=levelProjectToWorldData(project);
 assert.deepEqual(after.data,before.data);assert.deepEqual(after.anchors,before.anchors);
 assert.equal(env.collision,'none');assert.equal(world.doors.elevators.cabins.length,2);
});
test('wall details fit surviving solids and green arrows follow real routes to entrances',()=>{
 const targets={I11:{x:-23.5,z:32},I31:world.anchors.rescue};
 for(const f of env.fixtures){
  const host=walls.get(f.wallId),pose=fixturePose(f,host);assert(pose,f.id);
  const dx=host.b[0]-host.a[0],dz=host.b[1]-host.a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
  const x=host.a[0]+dx*f.t,z=host.a[1]+dz*f.t;
  const half=FIXTURES[f.kind][0]/2;
  assert(world.data.walls.some(w=>w.sourceId===host.id&&w.surfaceType==='opaque'&&
   [-half,half].every(offset=>distanceSegment(x+ux*offset,z+uz*offset,w.a,w.b)<.007)),f.id+' spans an opening');
  assert(f.y+FIXTURES[f.kind][1]/2<host.height&&f.y-FIXTURES[f.kind][1]/2>0,f.id);
  if(f.kind!=='exit')continue;
  const start={x:x+pose.nx*.73,z:z+pose.nz*.73},target=targets[f.target];
  assert(world.staticCanOccupy(start.x,start.z,.20)&&world.roomAt(target.x,target.z)?.id===f.target);
  const step=world.findPath(start,target).find(s=>Math.hypot(s.x-start.x,s.z-start.z)>.45);assert(step);
  const along=((step.x-start.x)*ux+(step.z-start.z)*uz)*f.side;
  assert.equal(f.arrow,along>0?'right':'left',f.id);
 }
});
test('background labs and offices stay in excluded polygons and clear both playable cabins',()=>{
 const lab=new Set(env.background.filter(b=>b.kind==='labBench').map(b=>b.roomId));
 assert.deepEqual([...lab].sort(),['X01','X12','X14','X15','X21','X24']);
 assert(env.background.some(b=>b.roomId==='X26'&&b.kind==='workstation'));
 for(const b of env.background){
  const room=scene.closed.find(r=>r.id===b.roomId);
  assert(room&&insidePolygon(b.x,b.z,room.polygon),b.id);
  assert.equal(world.canOccupy(b.x,b.z),false,b.id);
 }
 for(const [glass,corridor] of [['WALL-127-v1-1','C02'],['WALL-144-v1-1','C22']]){
  const front=world.data.walls.find(w=>w.sourceId===glass&&w.surfaceType==='window');assert(front);
  const z=front.a[1],toward=corridor==='C02'?1:-1;
  const seen=env.background.filter(b=>b.roomId==='X21'&&b.kind==='labBench'&&Math.abs(b.z-z)<2.5);
  assert(seen.some(b=>{
   // The centre of some panes is a metal mullion. Look from the adjacent clear glass.
   const eye={x:b.x+.34,z:z-toward*.7,y:1.65};
   return world.roomAt(eye.x,eye.z)?.id===corridor&&world.segmentClear(eye,{x:b.x,z:b.z,y:1.12},{vision:true});
  }),glass);
 }
});
test('display artwork belongs to fitted screen or writing surfaces and authored options survive export',()=>{
 const items=new Map(scene.items.map(o=>[o.id,o]));
 assert.equal(env.displays.length,61);
 for(const d of env.displays)assert(Object.hasOwn(DISPLAY_FACES,items.get(d.host).assetId),d.host);
 assert.equal(env.displays.filter(d=>['snow','glitch'].includes(d.art)).length,2);
 assert(env.facade.outline.length>10);assert(env.facade.edges.some(e=>walls.get(e.wallId).kind==='window'));
 assert.deepEqual(parseProject(JSON.stringify(project)).environment,env);
 assert.deepEqual(exportProject(project).environment,env);
 assert.throws(()=>validateEnvironment({...env,collision:'solid'}),/Miljödekoren/);
 assert.throws(()=>validateEnvironment({...env,displays:[env.displays[0],env.displays[0]]}),/Miljödekoren/);
});

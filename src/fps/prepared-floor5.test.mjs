import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game,direction} from './game.mjs';
import {respawnActor} from './action-rules.mjs';
import {createWorld} from './world.mjs';
import {exportProjectZip,parseProjectZip} from '../../furniture-editor/build/level-project.mjs';
import {testDoorTraversal} from '../../furniture-editor/build/door-traversal.mjs';
import {validateLevel} from '../../furniture-editor/build/validate-level.mjs';
import {furnitureVisibility} from './project-visibility.mjs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url));
const manifest=JSON.parse(read('levels/manifest.json'));
const level=JSON.parse(read(manifest.levels.find(v=>v.id===manifest.defaultLevel).file));
const world=createWorld({levelProject:level});
const lifts=world.doors.elevators;
const run=(game,n)=>{for(let i=0;i<n;i++)game.step(1/60);};

test('ordinary start uses the reviewed inherited project and its content-addressed models',async()=>{
 assert.equal(level.mode,'edit-floor5');assert.equal(level.legacyPatch.emptyFixed,true);
 const files=new Map();
 for(const row of level.assets.local){
  const bytes=read(row.file);assert.equal('local:'+createHash('sha256').update(bytes).digest('hex'),row.assetId);
  files.set(row.file,bytes);
 }
 assert.equal(files.size,13);
 const {project}=await parseProjectZip(await exportProjectZip(level,files));
 assert.deepEqual(project,level);
 const s=world.projectScene;
 assert.equal(s.items.length,1020);assert.equal(s.fixed.length,0);
 assert.equal(project.ground.tape.length,20);assert.equal(project.architecture.posters.length,16);assert.equal(project.architecture.treatments.length,112);
 const packs=s.items.filter(o=>o.mountId&&o.assetId?.startsWith('local:')&&s.items.some(r=>r.id===o.mountId&&r.assetId==='hissrum12:shelf'));
 assert.equal(packs.length,72);
 for(const o of s.items.filter(o=>o.collision==='none'))assert(!world.staticBoxes.some(b=>b.id===o.id));
 for(const id of ['I18','I27']){
  const printer=s.items.find(o=>o.roomId===id&&o.assetId==='office:ricoh-printer');
  assert.equal(printer.height,1.2);assert.equal(printer.yaw,-Math.PI/2);
  assert(s.items.some(o=>o.roomId===id&&o.assetName?.includes('etikettprinter')));
  const front={x:printer.x-.85,z:printer.z};assert(world.canOccupy(front.x,front.z));
  assert(world.findPath(front,world.anchors.rescue).length);
 }
 assert.deepEqual([world.anchors.bomb.x,world.anchors.bomb.z,world.anchors.rescue.x,world.anchors.rescue.z],[-31.5,-8.5,27.8,33.2]);
 assert.deepEqual(world.anchors.hostages.map(v=>[v.x,v.z]),[[-21.042,-22.13526],[-22.4,-21.7]]);
});

test('only the two selected shafts admit five separated, outward-facing actors each',()=>{
 world.setElevatorProgress(0);
 assert.deepEqual(lifts.cabins.map(c=>c.id).sort(),['BYGG-D-41000','D02']);
 assert(world.doors.doors.some(d=>d.id==='D38'));
 for(const id of ['D01','D03']){
  const d=world.data.doors.find(v=>v.id===id);
  assert(d.lockedUntilImplemented);assert(!world.canOccupy(d.center[0],d.center[1]));
 }
 assert(!world.scopeAllowed(-24,-30,.2));assert(!world.scopeAllowed(-20.541,-31.3,.2));
 for(const cfg of level.gameplay.startElevators){
  const points=level.gameplay.spawns.filter(s=>s.team===cfg.team);
  const door=lifts.cabins.find(d=>d.id===cfg.doorId);
  for(const [index,p] of points.entries()){
   assert.equal(p.id,'SP-'+(cfg.team==='analysts'?'A-':'C-')+String(index+1).padStart(2,'0'));
   assert.equal(world.roomAt(p.x,p.z)?.id,cfg.floorId);assert(world.canOccupy(p.x,p.z));
   assert(direction(p.yaw).z>.99);assert(p.z<door.z-.22);
   for(const q of points.slice(index+1))assert(Math.hypot(p.x-q.x,p.z-q.z)>.45);
  }
 }
 world.setElevatorProgress(1);
});

test('both sliding apertures use the simulation clock for collision, visibility, gunfire and paths',()=>{
 const game=new Game(world,{seed:42,autoplay:true,config:{buyTime:3,wanderers:false}}).start();
 const crossing=(c,open)=>{
  const a={x:c.x,z:c.z-.65,y:1.4},b={x:c.x,z:c.z+.65,y:1.4};
  assert.equal(world.canOccupy(c.x,c.z),open);
  for(const vision of [false,true])assert.equal(world.segmentClear(a,b,{vision}),open);
  assert.equal(Boolean(world.findPath(a,b).length),open);
 };
 for(const c of lifts.cabins)crossing(c,false);
 run(game,135);const progress=lifts.progress;assert(Math.abs(progress-.5)<1e-5);
 for(const c of lifts.cabins){
  crossing(c,true);
  for(const p of c.panels)assert.equal(world.canOccupy(p.x,p.z),false);
 }
 game.pause();run(game,120);assert.equal(lifts.progress,progress);game.pause(false);run(game,45);
 assert.equal(game.phase,'active');assert.equal(lifts.progress,1);
 for(const c of lifts.cabins)crossing(c,true);
 const left=new Set();
 for(let i=0;i<1200&&left.size<10;i++){game.step(1/60);for(const a of game.actors){
  const cfg=level.gameplay.startElevators.find(c=>c.team===a.team);
  if(world.roomAt(a.x,a.z)?.id===cfg.lobbyId)left.add(a.id);
 }}
 assert.equal(left.size,10,[...left].join(', '));
 game.beginRound();assert.equal(lifts.progress,0);for(const c of lifts.cabins)crossing(c,false);
 const endless=new Game(world,{config:{mode:'endless',wanderers:false}}).start('counterAnalysts');
 assert.equal(endless.phase,'active');assert.equal(lifts.progress,1);
 const a=endless.actors[3];a.alive=false;assert(respawnActor(endless,a));assert.equal(lifts.progress,1);
 assert(world.canOccupy(a.x,a.z));assert(endless.actors.every(b=>b===a||Math.hypot(b.x-a.x,b.z-a.z)>=.4));
});

test('real navigation and capsule traversal through the WC and the adjacent opening',()=>{
 const result=validateLevel(level,{engine:true});assert.equal(result.summary.errors,0);
 assert.deepEqual(testDoorTraversal(world,{ids:new Set(['BYGG-D-0013','D38'])}).map(r=>r.status),Array(4).fill('pass'));
 const d=world.data.doors.find(v=>v.id==='BYGG-D-0033');
 const ux=(d.b[0]-d.a[0])/d.width,uz=(d.b[1]-d.a[1])/d.width;
 const x=d.center[0]+ux*.12,z=d.center[1]+uz*.12;
 for(const side of [-1,1]){
  const a={x:x-uz*.85*side,y:0,z:z+ux*.85*side,radius:.2,height:1.7};
  const end={x:x+uz*.85*side,z:z-ux*.85*side};
  assert(world.navigation.clear(a,end)&&world.findPath(a,end).length);
  for(let t=0;t<40;t++){world.doors.update(t/60,1/60,[a]);world.move(a,uz*.043*side,0,-ux*.043*side);}
  assert(Math.hypot(a.x-end.x,a.z-end.z)<.08);
 }
});

test('cell culling requires an entire box behind one solid span, with glass and openings visible',()=>{
 const wall=(a,b,surfaceType)=>({a,b,surfaceType,height:2.85});
 const v=furnitureVisibility({data:{walls:[wall([-3,0],[-.5,0],'opaque'),wall([.5,0],[3,0],'opaque'),wall([-.5,0],[.5,0],'glazed')]},doors:{elevators:{boxes:[],progress:1}}});
 const box=(x0,x1)=>({min:{x:x0,y:0,z:1},max:{x:x1,y:2,z:2}});
 v.update({x:0,y:1.5,z:-2});assert(v.hidden(box(1.2,2)));assert(!v.hidden(box(-.4,.4)));assert(!v.hidden(box(-.2,2)));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {exportProject,parseProject,migrateV1,exportProjectZip,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {exportPatch,BASE_COMMIT} from '../core.mjs?v=5.7.2';
import {assetHash} from '../library/glb-utils.mjs';
import {makeZip,readZip} from '../library/zip.mjs?v=5.7.2';

const floor={id:'BYGG-G-0001',name:'Rum',role:'room',surface:'vinyl',x0:0,z0:0,x1:8,z1:8};
test('empty new level is independent of Floor 5 and serializes',()=>{
 const p=exportProject();assert.equal(p.mode,'new-level');assert.deepEqual(p.ground.floors,[]);
 assert.deepEqual(p.architecture.added,[]);assert.equal(p.schemaVersion,2);
 assert.deepEqual(parseProject(JSON.stringify(p)),p);
});
test('ground, game and width contracts reject malformed documents',()=>{
 const p=exportProject({ground:{bounds:{x0:0,z0:0,x1:10,z1:10},wallHeightDefault:2.85,floors:[floor]}});
 assert.equal(parseProject(p).ground.floors[0].surface,'vinyl');
 for(const edit of [q=>q.rules.minDoorWidth=.5,q=>q.game.baseCommit='main',q=>q.ground.floors.push({...floor}),
  q=>q.architecture.added.push({id:'BYGG-V-0001',kind:'wall',a:[0,0],b:[0,8],height:2.85,thickness:.1,sill:.9})]){
  const q=structuredClone(p);edit(q);if(q.architecture.added.length)q.architecture.added[0].a[0]=Infinity;
  assert.throws(()=>parseProject(q));
 }
});
test('malformed wall attachments are rejected before a new level can render',()=>{
 const p=exportProject();p.architecture.posters=[null];assert.throws(()=>parseProject(p));
 p.architecture.posters=[];p.architecture.treatments=[{id:'BYGG-T-0001',type:'blind',wallId:'missing',t0:0,t1:1,side:1}];
 assert.throws(()=>parseProject(p));
});
test('schema 1 migration retains every original field, including decorations and mounts',()=>{
 const v1=exportPatch([],[],{createdAt:'2026-10-28T12:00:00.000Z'});
 v1.emptyFixed=true;v1.added=[{id:'NY-OBJ-0001',kind:'prop',roomId:'I09',x:1,z:2,yaw:0,w:.4,d:.5,height:.6,assetId:'local:'+'a'.repeat(64),mountId:'old-bench',elevation:.8}];
 v1.architecture={schemaVersion:1,edits:[],added:[],removed:[],floors:[],posters:[{id:'POSTER-1',image:'data:image/webp;base64,AA=='}],treatments:[{type:'blind',wallId:'WALL-1'}]};
 const migrated=migrateV1(v1);assert.equal(migrated.game.baseCommit,BASE_COMMIT);
 assert.deepEqual(migrated.legacyPatch,v1);assert.equal(migrated.mode,'edit-floor5');
 assert(migrated.migrationNotes.length>0);
});
test('new ZIP round trip verifies local binary hashes and blocks unsafe paths',async()=>{
 const bytes=new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0]),hash=await assetHash(bytes),file=`assets/models/${hash}.glb`;
 const p=exportProject({assets:{library:[],local:[{assetId:'local:'+hash,file,bytes:bytes.length}],posters:[]}});
 const zip=await exportProjectZip(p,new Map([[file,bytes]]));
 const read=await parseProjectZip(zip);assert.deepEqual(read.project,p);assert.deepEqual(read.files.get(file),bytes);
 await assert.rejects(()=>parseProjectZip(makeZip([{name:'project.json',data:JSON.stringify(p)},{name:'AGENT_BRIEF.md',data:'x'}])));
 assert.throws(()=>makeZip([{name:'../evil',data:'x'}]));
});
test('orange kitchen chair keeps the authored dining-chair shape and finish in JSON and ZIP',async()=>{
 const chair={id:'NY-OBJ-0001',kind:'chair',assetId:'studio:orange-kitchen-chair',assetName:'Orange köksstol · vanlig stol',
  chairRole:'kitchen',roomId:floor.id,x:2,z:2,yaw:0,w:.48,d:.48,height:.76};
 const project=exportProject({ground:{bounds:{x0:0,z0:0,x1:10,z1:10},wallHeightDefault:2.85,floors:[floor]},
  furniture:{placements:[],added:[chair],removed:[]},assets:{library:[chair.assetId],local:[],posters:[]}});
 assert.deepEqual(parseProject(JSON.stringify(project)).furniture.added[0],chair);
 assert.deepEqual((await parseProjectZip(await exportProjectZip(project))).project.furniture.added[0],chair);
});
test('legacy ZIP imports without losing binary model identity or editor-only metadata',async()=>{
 const bytes=new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0]),hash=await assetHash(bytes),v1=exportPatch([],[]);
 v1.added=[{id:'NY-OBJ-0001',kind:'prop',roomId:'I09',x:1,z:2,yaw:0,w:.4,d:.5,height:.6,assetId:'local:'+hash,assetName:'Egen'}];
 v1.emptyFixed=true;v1.architecture={schemaVersion:1,edits:[],added:[],removed:[],floors:[],posters:[],treatments:[{type:'curtain'}]};
 const zip=makeZip([{name:'projekt.json',data:JSON.stringify(v1)},{name:`models/${hash}.glb`,data:bytes}]);
 const result=await parseProjectZip(zip);assert.deepEqual(result.project.legacyPatch,v1);assert.equal(result.project.assets.local[0].bytes,8);
 assert.deepEqual(result.files.get(`assets/models/${hash}.glb`),bytes);
});
test('ZIP rejects inconsistent central-directory filename even when local entry is safe',()=>{
 const zip=makeZip([{name:'project.json',data:'{}'}]);const changed=zip.slice();
 const central=changed.findIndex((_,i)=>i+4<changed.length&&changed[i]===0x50&&changed[i+1]===0x4b&&changed[i+2]===1&&changed[i+3]===2);
 changed[central+46]=46;assert.throws(()=>readZip(changed));
});

test('AI handoff ZIP validates derived collision map and accepts older ZIP',async()=>{
 const {collisionExport}=await import('./ai-export.mjs?v=5.7.2');
 const p=exportProject(),zip=await exportProjectZip(p),files=readZip(zip),decode=new TextDecoder();
 assert.equal(JSON.parse(decode.decode(files.get('COLLISION_MAP.json'))).floor5Inherited,false);
 assert.equal(collisionExport(p).walkableFloors.length,0);
 assert.match(decode.decode(files.get('AGENT_BRIEF.md')),/project.json/);
 assert.deepEqual((await parseProjectZip(zip)).project,p);
 const pack=entries=>makeZip(entries.map(([name,data])=>({name,data})));
 await assert.rejects(()=>parseProjectZip(pack([...files].map(([n,d])=>[n,n==='COLLISION_MAP.json'?'{}':d]))),/kollisionskarta/);
 assert.deepEqual((await parseProjectZip(pack([...files].filter(([n])=>n!=='COLLISION_MAP.json')))).project,p);
 const invalid=structuredClone(p);invalid.furniture.added=[{id:'NY-OBJ-0001',kind:'prop',x:1,z:1,yaw:0,w:.3,d:.3,height:.5,collision:'ghost'}];
 assert.throws(()=>parseProject(invalid),/möbelkollision/);
});


test('wall-hung furniture is saved exactly in JSON and ZIP with its height, face and physical noncollision',async()=>{
 const wall={id:'BYGG-V-0001',kind:'wall',a:[0,0],b:[8,0],height:2.85,thickness:.11,sill:.9,finish:'white'};
 const fixture={id:'NY-OBJ-0001',kind:'prop',assetId:'studio:wall-picture',assetName:'Tavla med ram · blå',
  roomId:'BYGG-G-0001',x:4,z:.12,yaw:Math.PI,w:.85,d:.07,height:.62,elevation:1.24,
  wallMount:{wallId:wall.id,t:.5,side:1,y:1.55},mountId:null,collision:'none',snapRole:'wall'};
 const floor={id:'BYGG-G-0001',name:'Test',role:'room',surface:'carpet',x0:0,z0:0,x1:8,z1:8};
 const p=exportProject({
  ground:{bounds:{x0:0,z0:0,x1:10,z1:10},wallHeightDefault:2.85,floors:[floor]},
  architecture:{schemaVersion:1,edits:[],added:[wall],removed:[],floors:[],posters:[],treatments:[]},
  furniture:{placements:[],added:[fixture],removed:[]},assets:{library:[fixture.assetId],local:[],posters:[]}
 });
 assert.deepEqual(parseProject(JSON.stringify(p)).furniture.added[0],fixture);
 assert.deepEqual((await parseProjectZip(await exportProjectZip(p))).project.furniture.added[0],fixture);
 for(const illegal of [
  {wallId:wall.id,t:-1,side:1,y:1.55},
  {wallId:wall.id,t:.5,side:0,y:1.55},
  {wallId:'',t:.5,side:1,y:1.55},
  {wallId:wall.id,t:.5,side:1,y:99}
 ]){
  const bad=structuredClone(p);bad.furniture.added[0].wallMount=illegal;
  assert.throws(()=>parseProject(bad),/väggfäste/);
 }
 const both=structuredClone(p);both.furniture.added[0].mountId='NY-OBJ-0002';
 assert.throws(()=>parseProject(both),/väggfäste/);
});

test('calibrated GLB fronts and canonical anchors are optional, bounded and round-trip intact',async()=>{
 const item={id:'NY-OBJ-0001',kind:'prop',assetId:'onboard:tv-with-a-wall-mount',x:0,z:0,yaw:0,w:3,d:.25,height:1.8,wallFacing:'+z',modelSize:[3.065,1.789,.2504],wallMount:{wallId:'BYGG-V-0001',t:.4,y:1.5,side:1,frame:1}};
 const p=exportProject();p.furniture.added.push(item);p.assets.library.push(item.assetId);
 assert.deepEqual(parseProject(JSON.stringify(p)).furniture.added[0],item);
 assert.deepEqual((await parseProjectZip(await exportProjectZip(p))).project.furniture.added[0],item);
 for(const bad of [{wallFacing:'up'},{modelSize:[0,1,1]},{modelSize:[1,Infinity,1]},{modelSize:[1,1]},{wallMount:{...item.wallMount,frame:2}}]){const copy=structuredClone(p);Object.assign(copy.furniture.added[0],bad);assert.throws(()=>parseProject(copy));}
 const legacy=structuredClone(p);delete legacy.furniture.added[0].wallFacing;delete legacy.furniture.added[0].modelSize;delete legacy.furniture.added[0].wallMount.frame;assert.doesNotThrow(()=>parseProject(legacy));
});

test('5S tape crosses adjoining floors, survives ZIP and adds no collision',async()=>{
 const {makeFloorTape}=await import('./floor-tape.mjs');
 const {collisionExport}=await import('./ai-export.mjs');
 const p=exportProject(),neighbor={...floor,id:'BYGG-G-0002',x0:8,x1:12};
 p.ground.floors=[floor,neighbor];
 const collision=collisionExport(p),a={x:7,z:3},b={x:9,z:3};
 const appearance={style:'hazard',color:'#ffcf00'};
 assert.throws(()=>makeFloorTape(a,b,appearance,[],[floor,{...neighbor,x0:8.02}]),/golvet/);
 p.ground.tape=[makeFloorTape(a,b,appearance,[],p.ground.floors)];
 const restored=(await parseProjectZip(await exportProjectZip(p))).project;
 assert.deepEqual(restored.ground.tape,p.ground.tape);
 assert.deepEqual(collisionExport(restored),collision);
 restored.ground.tape[0].color='invalid';assert.throws(()=>parseProject(restored),/tejp/);
});

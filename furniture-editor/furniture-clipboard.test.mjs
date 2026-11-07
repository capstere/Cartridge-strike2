import test from 'node:test';import assert from 'node:assert/strict';
import {captureFurniture,pasteFurniture} from './furniture-clipboard.mjs';
import {poseOnWall} from './wall-mounts.mjs';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from './build/level-project.mjs?v=5.7.2';
import {resolveProjectScene,writeProjectScene} from './build/project-scene.mjs?v=5.7.2';
const base=(id,x=1)=>({id,kind:'desk',roomId:'',x,z:2,yaw:.2,w:1,d:1,height:.8,elevation:0,collision:'solid',mirrored:true});
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const wall={id:'w',kind:'wall',a:[0,0],b:[8,0],height:3,thickness:.12};
test('snapshot is independent, selected descendants copied once, all IDs and attachments remapped',()=>{
 const desk=base('NY-OBJ-0001'),cup={...base('NY-OBJ-0002'),w:.2,d:.2,height:.2,mountId:desk.id,elevation:.792},leaf={...cup,id:'NY-OBJ-0003',mountId:cup.id},chair=base('NY-OBJ-0004',3),items=[desk,cup,leaf,chair],before=structuredClone(items);
 const clip=captureFurniture(items,[desk.id,cup.id,chair.id],[],'p');assert.equal(clip.items.length,4);desk.x=9;
 const result=pasteFurniture(clip,items,[],'p',{usedIds:['NY-OBJ-0005']});assert.equal(result.items.length,4);assert.equal(result.inPlace,false);assert(!result.ids.includes('NY-OBJ-0005'));
 near(result.items[0].x,1.4);assert.equal(result.items[1].mountId,result.items[0].id);assert.equal(result.items[2].mountId,result.items[1].id);
 result.items.forEach((o,i)=>{for(const key of ['yaw','w','d','height','elevation','mirrored'])assert.equal(o[key],before[i][key]);assert.equal(o.source,'added');});assert.equal(items[1].mountId,desk.id);assert.equal(clip.items[0].x,1);
 const again=pasteFurniture(clip,[...items,...result.items],[],'p',{step:2});assert(!again.ids.some(id=>result.ids.includes(id)));near(again.items[0].x,1.8);
});
test('wall copy preserves side, true geometry offset, roll and original source',()=>{
 const tv={...base('TV'),kind:'prop',height:.7,d:.1,wallFacing:'-x',wallRoll:.2};Object.assign(tv,poseOnWall(tv,{wallId:'w',t:.5,y:1.5,side:-1,frame:1},[wall]));const original=structuredClone(tv);
 const clip=captureFurniture([tv],['TV'],[wall],'p'),r=pasteFurniture(clip,[tv],[wall],'p');const copy=r.items[0];assert.equal(copy.wallMount.wallId,'w');assert.equal(copy.wallMount.side,-1);assert.equal(copy.wallRoll,.2);near(copy.z,tv.z);near(copy.x,tv.x+.4);assert.deepEqual(tv,original);assert(poseOnWall(copy,copy.wallMount,[wall]));
 assert.throws(()=>pasteFurniture(clip,[tv],[],'p'),/vägg/);assert.throws(()=>pasteFurniture(clip,[tv],[{...wall,height:2}],'p'),/vägg/);
});
test('child copied alone keeps external support, rejects deleted/moved support and other project',()=>{
 const desk=base('d'),cup={...base('c'),kind:'prop',w:.2,d:.2,height:.2,elevation:.792,mountId:'d'};const items=[desk,cup],clip=captureFurniture(items,['c'],[],'p');const r=pasteFurniture(clip,items,[],'p');assert.equal(r.items[0].mountId,'d');
 assert.throws(()=>pasteFurniture(clip,[cup],[],'p'),/Möbelytan/);assert.throws(()=>pasteFurniture(clip,[{...desk,x:5},cup],[],'p'),/Möbelytan/);assert.throws(()=>pasteFurniture(clip,items,[],'other'),/annan bana/);
});
test('perpendicular wall mounts use identical placement when group translation is impossible',()=>{
 const walls=[wall,{...wall,id:'w2',a:[0,0],b:[0,8]}];const rows=walls.map((w,i)=>{const o={...base('TV'+i),d:.1,height:.5};return Object.assign(o,poseOnWall(o,{wallId:w.id,t:.5,y:1.3,side:1,frame:1},walls));});
 const result=pasteFurniture(captureFurniture(rows,rows.map(o=>o.id),walls,'p'),rows,walls,'p');assert(result.inPlace);result.items.forEach((o,i)=>{near(o.x,rows[i].x);near(o.z,rows[i].z);assert.deepEqual(o.wallMount,rows[i].wallMount);});
});
test('both project modes serialize paste and survive ZIP without changing original scene',async()=>{
 for(const mode of ['new-level','edit-floor5']){const project=exportProject({mode}),scene=resolveProjectScene(project),source=structuredClone(scene.entries);const row=base('NY-OBJ-0001');scene.items.push(row);writeProjectScene(project,scene);
 const clipboard=captureFurniture(scene.items,[row.id],scene.entries,project.projectId),result=pasteFurniture(clipboard,scene.items,scene.entries,project.projectId);scene.items.push(...result.items);writeProjectScene(project,scene);parseProject(project);
 const reloaded=(await parseProjectZip(await exportProjectZip(project))).project;assert.deepEqual(resolveProjectScene(reloaded).entries,source);assert(resolveProjectScene(reloaded).items.some(o=>o.id===result.ids[0]));}
});
test('empty/cyclic selections fail and local asset metadata stays detached',()=>{
 assert.throws(()=>captureFurniture([],[],[],'p'),/Markera/);const a={...base('a'),assetId:'local:abc'},assets=[{assetId:a.assetId,name:'test.glb'}];const clip=captureFurniture([a],['a'],[],'p',assets);assets[0].name='changed';assert.equal(clip.assets[0].name,'test.glb');
 assert.throws(()=>captureFurniture([{...a,mountId:'b'},{...base('b'),mountId:'a'}],['a'],[],'p'),/cirkel/);assert.throws(()=>captureFurniture([{...a,mountId:'b'},{...base('b'),mountId:'a'},base('free')],['a','free'],[],'p'),/cirkel/);
});
test('actual original Floor 5 furniture becomes an added instance, never an override of the original',()=>{
 const project=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(project),original=scene.items[0],snapshot=structuredClone(original);
 const clip=captureFurniture(scene.items,[original.id],scene.entries,project.projectId),result=pasteFurniture(clip,scene.items,scene.entries,project.projectId);scene.items.push(...result.items);writeProjectScene(project,scene);parseProject(project);
 assert.deepEqual(scene.items.find(o=>o.id===original.id),snapshot);assert(!project.furniture.placements.some(o=>o.id===original.id));assert(project.furniture.added.some(o=>o.id===result.ids[0]));assert(!('original' in result.items[0]));
});

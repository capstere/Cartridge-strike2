import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ROOM_NAMES,GAME_NAME,COMPLEX_NAME,roomDisplayName,missionRoomName} from './player-names.mjs';
import {createWorld} from './world.mjs';
import {createControlZones} from './combat-flow.mjs';
import {TEAMS} from './config.mjs';
const p=JSON.parse(readFileSync(new URL('../../levels/floor5-prepared.json',import.meta.url)));
const hash=value=>createHash('sha256').update(JSON.stringify(value,(k,v)=>['name','assetName','text','title','subtitle'].includes(k)?undefined:v)).digest('hex');

test('the fiction registry preserves the three names and never rewrites technical IDs',()=>{
 assert.equal(missionRoomName({anchors:{}}),COMPLEX_NAME);
 assert.equal(GAME_NAME,'Cartridge-Strike');assert.equal(TEAMS.analysts,'Analysts');assert.equal(TEAMS.counterAnalysts,'Counter Analysts');
 const room={id:'I01',name:'untrusted imported display name'};assert.equal(roomDisplayName(room),'North Laboratory');assert.equal(room.id,'I01');
 assert.equal(roomDisplayName('I02'),'Analysis Chamber');assert.equal(roomDisplayName('I12'),'Technical Storage');assert.equal(roomDisplayName('I31'),'Main Atrium');
 assert.equal(roomDisplayName('C02'),'Sector B');assert.notEqual(roomDisplayName('X32b'),roomDisplayName('X32c'));
 assert.equal(new Set(Object.values(ROOM_NAMES)).size,Object.keys(ROOM_NAMES).length);
});
test('published signs and editable copies use the same room names',()=>{
 assert.equal(p.name,COMPLEX_NAME);
 for(const f of p.environment.fixtures.filter(f=>f.kind==='room'))assert.equal(f.title,roomDisplayName(f.roomId),f.id);
 for(const f of p.environment.fixtures.filter(f=>f.kind==='exit'))assert.equal(f.title,roomDisplayName(f.target),f.id);
 assert.deepEqual(p.legacyPatch.architecture.posters,p.architecture.posters);
 for(const f of p.ground.floors)assert.equal(f.name,roomDisplayName(f.id));
});
test('the naming pass preserves all prepared geometry, collision, navigation and gameplay inputs',()=>{
 // Baseline fingerprints exclude only presentation text. No original-name lookup list.
 assert.equal(hash([p.ground,p.architecture,p.furniture,p.gameplay,p.rules,p.navHints,p.legacyPatch]),'2cd4d1b0c541b87a36014928bc43ab9ee76d2530fb1e0356f51651c5463f172f');
 const w=createWorld({levelProject:p});
 assert.equal(hash(w.staticBoxes),'d01c0510ddcce2ad958d04f5dda8dffeeef29d3d50c43174cd52fd64c4358a44');
 assert.equal(hash(w.navigation.nodes),'fc5840bc6f873fc9439b52c84eee3d1cadd841a6fa7d9b3c15a8a52fc6e5c68f');
 assert.equal(w.projectScene.items.length,1020);assert.equal(missionRoomName(w),ROOM_NAMES.I01);
 const zones=createControlZones(w);for(const z of zones.filter(z=>z.id!=='neutral-opening'))assert.equal(z.name,ROOM_NAMES[z.id]);
});

test('equipment art replaces clone textures while preserving source resources and mesh buffers',async()=>{
 const T=await import('../../vendor/three/three.module.js');
 const {applyEquipmentArt,releaseEquipmentArt}=await import('./fictional-equipment.mjs');
 const oldDocument=globalThis.document;
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
 const geometry=new T.BoxGeometry(),sourceMap=new T.Texture(),sourceNormal=new T.Texture(),source=new T.MeshPhysicalMaterial({map:sourceMap,normalMap:sourceNormal});
 const slots=new Map([[source,0]]),root=new T.Group(),a=new T.Mesh(geometry,source),b=new T.Mesh(geometry,source);root.add(a,b);root.position.set(2,3,4);
 const vertices=Array.from(geometry.attributes.position.array);let sourceDisposed=false;source.addEventListener('dispose',()=>sourceDisposed=true);
 try{
  applyEquipmentArt(root,'office:ricoh-printer',slots);
  assert.equal(a.geometry,geometry);assert.deepEqual(Array.from(geometry.attributes.position.array),vertices);assert.deepEqual(root.position.toArray(),[2,3,4]);
  assert.equal(a.material,b.material,'copies share the replacement material');assert.notEqual(a.material,source);assert.notEqual(a.material.map,sourceMap);assert.equal(a.material.normalMap,null);
  assert.equal(source.map,sourceMap);assert.equal(source.normalMap,sourceNormal);assert.equal(source.userData.fictionalEquipment,undefined);
  releaseEquipmentArt();assert.equal(sourceDisposed,false,'cleanup cannot dispose source model materials');
 }finally{globalThis.document=oldDocument;geometry.dispose();source.dispose();sourceMap.dispose();sourceNormal.dispose();}
});

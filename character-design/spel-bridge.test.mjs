import test from 'node:test';
import assert from 'node:assert/strict';
import {BRIDGE_VERSION,makeSpelBridge,makeSpelGuide} from './spel-bridge.mjs';
const project={kind:'character',base:{gender:'male',original_glb:'quaternius-operator-male.glb'},body:{height:97,width:100,shoulders:85,chest:90,arms:82,waist:95},creative:{outfit:'hoodie',hair:'swept'},parts:[{visible:true,name:'My Hair',asset:'hair.glb',anchor:'Head',hairReplacement:true}]};
test('SPEL handoff carries regional shape, rig and imported hair without claiming runtime certification',()=>{
 const b=makeSpelBridge(project,['Idle_Loop','Walk_Loop'],['Head','spine_03']);
 assert.equal(BRIDGE_VERSION,1);
 assert.equal(b.schema,'cartridge-strike-spel-bridge-v1');
 assert.equal(b.import_file,'SPEL_SOURCE.glb');
 assert.deepEqual(b.appearance.regional_shape_percent,{shoulders:85,chest:90,arms:82,waist:95});
 assert.deepEqual(b.appearance.imported_hair_parts,[{name:'My Hair',source:'hair.glb',anchor:'Head'}]);
 assert.deepEqual(b.rig.observed_clips,['Idle_Loop','Walk_Loop']);
 assert.equal(b.verification.game_runtime_modified,false);
 assert.equal(b.verification.spel_paint_roundtrip_verified,false);
 assert.match(b.verification.warning,/may reject/);
});
test('legacy body profiles and explicit SPEL caveats',()=>{
 const p={...project,body:{height:100,width:100},parts:[],creative:{outfit:'fieldjacket'}};
 assert.deepEqual(makeSpelBridge(p).appearance.regional_shape_percent,{shoulders:100,chest:100,arms:100,waist:100});
 assert.equal(makeSpelBridge(p).appearance.shell_type,null);
 assert.match(makeSpelGuide(p),/Förbered karaktär för Procreate ENDAST om SPEL visar Kompatibel/);
 assert.throws(()=>makeSpelBridge({...project,kind:'object'}),/kräver en karaktär/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three/three.module.js';
import {createPrivateViewAppearance,syncWeaponAppearance} from './view-character-appearance.mjs?v=6.1.2';
import {makeWeapon,animateWeapon,disposeWeaponResources} from './models.mjs?v=6.1.2';
import {WEAPONS} from './config.mjs';
function fixture(){
 const scene=new T.Group(),g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute([0,0,0],3));g.setAttribute('color',new T.Float32BufferAttribute([.22,.13,.08],3));
 g.setAttribute('skinIndex',new T.Uint16BufferAttribute([0,0,0,0],4));g.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0],4));
 const shirt=new T.MeshStandardMaterial({color:0xffffff,roughness:.91});shirt.name='jacket-fabric';
 shirt.map=new T.DataTexture(new Uint8Array([170,30,20,255]),1,1);shirt.map.colorSpace=T.SRGBColorSpace;
 const mesh=new T.SkinnedMesh(g,shirt),bone=new T.Bone();bone.name='lowerarm_l';mesh.bind(new T.Skeleton([bone]));scene.add(mesh);
 for(const [name,color] of [['gloves-leather','#326a49'],['face-skin','#c28860']]){const m=new T.MeshStandardMaterial({color,roughness:.72});m.name=name;scene.add(new T.Mesh(new T.BufferGeometry(),m));}
 return {scene};
}
test('reads linear skin, sRGB shirt and actual hand material without changing source',()=>{
 const asset=fixture(),before=JSON.stringify(asset.scene.toJSON()),p=createPrivateViewAppearance(asset);
 assert.equal(JSON.stringify(asset.scene.toJSON()),before);
 assert(p.glove.color.equals(new T.Color('#326a49')));
 assert(Math.abs(p.skin[0]-.22)<1e-7);assert(Math.abs(p.cloth[0]-new T.Color('#aa1e14').r)<1e-7);
 assert.deepEqual(Array.from(p.sleeve.map.image.data.slice(0,3)),[170,30,20]);
 assert.notDeepEqual(Array.from(p.sleeve.map.image.data.slice(-4,-1)),[170,30,20]);
 let disposed=0;for(const r of [p.glove,p.sleeve,p.sleeve.map,p.sleeve.roughnessMap])r.addEventListener('dispose',()=>disposed++);
 p.dispose();p.dispose();assert.equal(disposed,4);
});
test('rejects missing or unsupported appearance data',()=>{
 assert.throws(()=>createPrivateViewAppearance({scene:new T.Group()}),/matchas/);
 const a=fixture();a.scene.children[0].geometry.deleteAttribute('color');assert.throws(()=>createPrivateViewAppearance(a),/underarmar/);
 const b=fixture();b.scene.children[1].material.map=new T.Texture();assert.throws(()=>createPrivateViewAppearance(b),/Texturmålade/);
});
function transforms(model){const a=[];model.traverse(o=>a.push([o.name,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()]));return a;}
function weaponData(model){const a=[];model.userData.weapon.traverse(o=>{if(o.isMesh)a.push([o.material.uuid,Array.from(o.geometry.attributes.position.array)]);});return a;}
for(const id of Object.keys(WEAPONS).filter(id=>WEAPONS[id].slot!=='armor'))test(`${id}: appearance preserves weapon, finger and reload transforms; cached restore`,()=>{
 const baseline=makeWeapon(id),custom=makeWeapon(id),p=createPrivateViewAppearance(fixture()),weapon=weaponData(custom),original=transforms(custom);
 syncWeaponAppearance(custom,p);const state=custom.userData.characterAppearance;assert(state.targets.length>=4,id);
 for(const t of state.targets){assert.equal(t.mesh.visible,t.visible,'Do not hide wrist connectors');if(t.role==='cuff')for(let i=0;i<t.mesh.geometry.attributes.uv.count;i++)assert.equal(t.mesh.geometry.attributes.uv.getY(i),1);}
 const roles=new Set(state.targets.map(t=>t.role));assert(roles.has('hand'));assert(roles.has('sleeve')||roles.has('kit-sleeve'));
 for(const ammo of [0,3])for(const fraction of [0,.12,.35,.45,.64,.83,.99,1]){
  const duration=WEAPONS[id].reload||1,time=10+fraction*duration;
  const actor={alive:true,weapon:id,moving:2.4,distanceWalked:3,onGround:true,aimAmount:.7,crouching:true,reloadUntil:10+duration,inventory:{primary:{id,ammo},pistol:{id,ammo}},height:1.2};
  const before=JSON.stringify(actor),options={shotAt:time-.03,switchAt:9.9,throwAt:time-.2,swingAt:time-.1,recoil:.02};
  const a=animateWeapon(baseline,actor,time,1/60,options),b=animateWeapon(custom,actor,time,1/60,options);
  assert.deepEqual(transforms(custom),transforms(baseline),`${id} ${ammo} ${fraction}`);assert.deepEqual(a,b);assert.equal(JSON.stringify(actor),before);
 }
 assert.deepEqual(weaponData(custom),weapon);
 const privateUV=state.targets.find(t=>t.role==='kit-sleeve')?.mesh.geometry.attributes.uv;
 syncWeaponAppearance(custom,p);assert.equal(custom.userData.characterAppearance,state);
 syncWeaponAppearance(custom,null);for(const t of state.targets){assert.equal(t.mesh.material,t.material);assert.equal(t.mesh.visible,t.visible);assert.equal(t.mesh.geometry.attributes.uv,t.uv);}
 if(custom.userData.heroKit){
  const actor={alive:true,weapon:id,moving:0,reloadUntil:0};animateWeapon(custom,actor,30,1/60);animateWeapon(baseline,actor,30,1/60);
  for(const side of ['rightArm','leftArm'])assert.deepEqual(Array.from(custom.userData[side].geometry.attributes.position.array),Array.from(baseline.userData[side].geometry.attributes.position.array),'Original sleeve folds restored');
 }
 syncWeaponAppearance(custom,p);if(privateUV)assert.equal(state.targets.find(t=>t.role==='kit-sleeve').mesh.geometry.attributes.uv,privateUV);
 const world=makeWeapon(id,{viewmodel:false}),worldBefore=transforms(world);syncWeaponAppearance(world,p);assert.equal(world.userData.characterAppearance,undefined);assert.deepEqual(transforms(world),worldBefore);
 assert.equal(transforms(custom).length,original.length);p.dispose();
});
test.after(()=>disposeWeaponResources());

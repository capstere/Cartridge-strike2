import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three/three.module.js';
import {makeWeapon,makeActor,animateActor,animateWeapon,syncWeaponFittings,releaseWeaponFittings} from './models.mjs';
import {ATTACHMENTS,CAMOS,weaponFits} from './arsenal.mjs';

const findPaint=m=>{let painted; m.traverse(o=>{if(o.material?.name.startsWith('arsenal-finish-'))painted=o.material;});return painted;};
test('first-person sights, real mechanisms and templates survive custom kit changes',()=>{
  for(const id of ['ar47','cr4','smg','shotgun','p9','p12']) {
    const model=makeWeapon(id),muzzle=model.userData.muzzle.clone(),originalSupport=model.userData.support.clone();
    for(const optic of ['red','holo','acog'].filter(a=>weaponFits(id,a))){
      syncWeaponFittings(model,{id,attachments:['sil',optic],camo:'foret'});
      assert.ok(findPaint(model),id+' receiver has a finish');
      assert.ok(model.userData.muzzle.z<muzzle.z);
      const d=model.userData, [y,z]=d.opticSight;
      const actor={id:'fixture',alive:true,weapon:id,onGround:true,aimAmount:1};
      animateWeapon(model,actor,5,.016,{reducedMotion:true});
      const point=model.localToWorld(new T.Vector3(0,y,z));
      assert.ok(Math.abs(point.x)<1e-5&&Math.abs(point.y)<1e-5,optic+' on '+id+' centres the sight on the reticle');
      const mesh=model.getObjectByName('fitting-'+optic).children[0];
      const restored=[...d.weapon.getObjectByName('receiver').children].find(o=>o.isMesh&&o.material===findPaint(model));
      let disposed=0;mesh.geometry.addEventListener('dispose',()=>disposed++);
      syncWeaponFittings(model,{id,attachments:['sil',optic],camo:'foret'});
      assert.equal(disposed,0);assert.strictEqual(model.getObjectByName('fitting-'+optic).children[0],mesh);
      releaseWeaponFittings(model);assert.equal(disposed,1);
      assert(!d.opticSight&&!findPaint(model)&&!model.getObjectByName('fitting-'+optic));
      assert.deepEqual(d.muzzle.toArray(),muzzle.toArray());assert.deepEqual(d.support.toArray(),originalSupport.toArray());
      assert.ok(restored.material.userData.camoPaint);
    }
  }
});
test('world, workshop and actor fittings isolate finish references, geometry and animated ownership',()=>{
  const base=makeWeapon('ar47',{viewmodel:false}),other=makeWeapon('ar47',{viewmodel:false});
  const spec={id:'ar47',attachments:['short','nostock','holo','xmag'],camo:'desert'};
  const actor=makeActor('analysts','fixture'),p={id:'fixture',team:'analysts',alive:true,weapon:'ar47',inventory:{primary:spec},onGround:true};
  syncWeaponFittings(other,spec);animateActor(actor,p,3,.016);
  assert.equal(findPaint(base),undefined);assert.strictEqual(findPaint(other),findPaint(actor.userData.weaponModel));
  const bounds=m=>new T.Box3().setFromObject(m.userData.weapon);
  assert.ok(bounds(other).max.z<bounds(base).max.z-.12);assert.ok(bounds(other).min.z>bounds(base).min.z+.05);
  assert.ok(other.userData.magazine.getObjectByName('fitting-xmag'));
  let disposed=0;findPaint(other).addEventListener('dispose',()=>disposed++);
  const receiverGeometry=m=>m.userData.weapon.getObjectByName('receiver').children.filter(o=>o.isMesh).map(o=>o.geometry.uuid);
  releaseWeaponFittings(other);assert.equal(disposed,0);
  assert.deepEqual(receiverGeometry(other),receiverGeometry(base));
  animateActor(actor,{...p,inventory:{primary:{id:'ar47'}}},3.1,.016);
  assert.equal(disposed,1);
  assert.equal(findPaint(actor.userData.weaponModel),undefined);
});
test('every eligible external fitting and finish reaches the real model factory',()=>{
  for(const id of ['ar47','cr4','smg','shotgun','sniper','p9','p12','bazooka']) {
    const m=makeWeapon(id,{viewmodel:false});
    for(const camo of Object.keys(CAMOS)){
      syncWeaponFittings(m,{id,camo});
      assert.equal(findPaint(m)?.name,'arsenal-finish-'+camo,id+' / '+camo);
    }
    for(const a of Object.keys(ATTACHMENTS).filter(a=>weaponFits(id,a))){
      syncWeaponFittings(m,{id,attachments:[a]});
      const d=m.userData;
      if(['hp','slug'].includes(a))assert.equal(m.getObjectByName('fitting-'+a),undefined,'internal ammunition');
      else if(a==='short'||a==='nostock')assert.ok(d.arsenalEquipment.attachments.includes(a));
      else assert.ok(m.getObjectByName('fitting-'+a)?.children.length>0,id+' / '+a);
    }
    releaseWeaponFittings(m);
  }
});

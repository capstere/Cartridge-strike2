import test from 'node:test';
import assert from 'node:assert/strict';
import {PROCEDURAL_MAP,upgradeLegacyOrangeChair} from './procedural.mjs';
import {populateDiningChair} from './procedural-mesh.mjs';

test('orange kitchen chair is a four-legged dining chair rather than the office GLB',()=>{
 const chair=PROCEDURAL_MAP.get('studio:orange-kitchen-chair');
 assert.equal(chair.shape,'dining-chair');assert.equal(chair.kind,'chair');
 assert.equal(chair.chairRole,'kitchen');assert.equal(chair.height,.76);
 assert.equal(chair.url,undefined);
});

test('orange chair geometry has upholstered seat and back with four silver legs',()=>{
 const parts=[];
 populateDiningChair({w:.48,d:.48,chairRole:'kitchen'},(...args)=>parts.push(args));
 assert.equal(parts.length,6);
 assert.deepEqual(parts.slice(0,2).map(p=>p[6].color.getHexString()),['df753c','df753c']);
 assert(parts.slice(2).every(p=>p[6].color.getHexString()==='aab6bd'&&p[4]===.45));
 assert.equal(new Set(parts.slice(2).map(p=>`${p[0]},${p[2]}`)).size,4);
});

test('editor 3.4 orange office-chair drafts upgrade without changing intentional office chairs',()=>{
 const old={id:'NY-OBJ-0001',assetId:'kenney:furniture-kit:chairdesk',assetName:'Orange köksstol · silverben',
  chairRole:'kitchen',w:.62,d:.62,height:1.05};
 const office={...old,id:'NY-OBJ-0002',assetName:'Kontorsstol',chairRole:'office'};
 const project={furniture:{added:[old,office],placements:[]},assets:{library:['kenney:furniture-kit:chairdesk']}};
 assert.equal(upgradeLegacyOrangeChair(project),1);
 assert.deepEqual([old.assetId,old.w,old.d,old.height],['studio:orange-kitchen-chair',.48,.48,.76]);
 assert.equal(office.assetId,'kenney:furniture-kit:chairdesk');
 assert(project.assets.library.includes('studio:orange-kitchen-chair'));
 assert.equal(upgradeLegacyOrangeChair(project),0);
});

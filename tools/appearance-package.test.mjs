import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {installedPalettes,validateAppearancePackage} from '../src/fps/appearance-package.mjs';
import {reservedOutfitIds,EARNED_OUTFITS} from '../src/fps/operator-outfits.mjs';
import {importAppearance} from './appearance-import.mjs';

const root=new URL('../',import.meta.url);
const example=JSON.parse(await readFile(new URL('content/examples/appearance/harbor-crew.json',root),'utf8'));

test('palette packages qualify known rig materials without a gameplay or import path',()=>{
  const valid=installedPalettes({version:1,packages:[example]},reservedOutfitIds);
  assert.deepEqual(valid,[{id:'harbor-crew',name:'Harbor Crew',role:'Coastal work uniform',kit:'smg',
    shirt:0x1b8387,vest:0xe0883b,glove:0x34545a,accent:0xf4c777}]);
  for(const change of [{version:0},{id:'../sailor'},{kit:'gilet'},{skin:1},{hp:500},{name:'<i>crew</i>'},
    {palette:{...example.palette,glove:'#fg0200'}},{rights:{...example.rights,license:'unverified'}},
    {rigs:{...example.rigs,female:'elsewhere.glb'}}]){
    assert.throws(()=>validateAppearancePackage({...example,...change}));
  }
  for(const id of reservedOutfitIds)assert.throws(()=>installedPalettes({version:1,packages:[{...example,id}]},reservedOutfitIds));
  assert.throws(()=>installedPalettes({version:1,packages:[example,example]},reservedOutfitIds));
  assert.throws(()=>installedPalettes({version:0,packages:[]},reservedOutfitIds));
});

test('install and retry in a staging copy, preserve stored v1 choices and private challenge rights',async t=>{
  const stage=await mkdtemp(join(tmpdir(),'cs3-palette-test-'));
  t.after(()=>rm(stage,{recursive:true,force:true}));
  const registry=join(stage,'assets/fps/outfit-packs.json');
  await mkdir(join(stage,'assets/fps/models'),{recursive:true});
  await mkdir(join(stage,'src/fps'),{recursive:true});
  for(const name of ['src/fps/operator-outfits.mjs','src/fps/appearance-package.mjs',
    'assets/fps/models/quaternius-operator-male.glb','assets/fps/models/quaternius-operator-female.glb']){
    await copyFile(new URL(name,root),join(stage,name));
  }
  // A previously saved public or earned outfit uses the same stable ID and key.
  const oldRegistry=JSON.stringify({version:1,packages:[]});await writeFile(registry,oldRegistry);
  const file=join(stage,'outfit.json');await writeFile(file,JSON.stringify(example));
  assert.equal((await importAppearance(stage,file)).status,'validated');
  assert.equal(await readFile(registry,'utf8'),oldRegistry);
  const result=await importAppearance(stage,file,true);
  assert.equal(result.status,'installed');
  assert(result.rigs.every(r=>r.clips.length===13&&r.embeddedImages===3&&r.bones===65));
  const installed=await readFile(registry,'utf8');
  assert.equal((await importAppearance(stage,file,true)).status,'already-installed');
  assert.equal(await readFile(registry,'utf8'),installed);
  const registryApi=await import(pathToFileURL(resolve(stage,'src/fps/operator-outfits.mjs')));
  assert.deepEqual(registryApi.OUTFITS.map(o=>o.id),['issued','assault','smg','sniper','shotgun',example.id]);
  assert.deepEqual(registryApi.EARNED_OUTFITS,EARNED_OUTFITS);
  const storage={value:'smg',getItem(){return this.value;},setItem(key,id){this.value=id;assert.equal(key,'cartridge-operator-outfit');}};
  assert.equal(registryApi.readOutfit(storage).id,'smg');
  assert.equal(registryApi.saveOutfit(example.id,storage).id,example.id);
  assert.equal(registryApi.publicOutfitId(example.id),example.id);
  assert.equal(registryApi.publicOutfitId('gilet'),'issued');
  assert.equal(registryApi.publicOutfitId('gilet',['gilet']),'gilet');
  await writeFile(file,JSON.stringify({...example,name:'Replacement'}));
  await assert.rejects(importAppearance(stage,file,true),/already uses/);
  await writeFile(file,JSON.stringify({...example,id:'wrong-rig',rigs:{...example.rigs,male:'0'.repeat(64)}}));
  await assert.rejects(importAppearance(stage,file,true),/rig hash differs/);
  await writeFile(file,JSON.stringify({...example,id:'gilet'}));
  await assert.rejects(importAppearance(stage,file,true),/Reserved/);
  assert.equal(await readFile(registry,'utf8'),installed);

  // Concurrent authors get an explicit retry instead of losing another ID.
  const idA=join(stage,'a.json'),idB=join(stage,'b.json');
  await writeFile(idA,JSON.stringify({...example,id:'coastal-a'}));
  await writeFile(idB,JSON.stringify({...example,id:'coastal-b'}));
  const attempts=await Promise.allSettled([importAppearance(stage,idA,true),importAppearance(stage,idB,true)]);
  for(const attempt of attempts)if(attempt.status==='rejected')assert.equal(attempt.reason.code,'EEXIST');
  await importAppearance(stage,idA,true);await importAppearance(stage,idB,true);
  assert.deepEqual(JSON.parse(await readFile(registry)).packages.map(p=>p.id),['coastal-a','coastal-b','harbor-crew']);
});

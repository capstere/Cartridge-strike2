import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildContentCatalog,validateContentPackage} from './content/catalog.mjs';
import {MAP_CONTRACTS} from '../shared/multiplayer/map-build.mjs';
import {weaponDefinition} from '../src/fps/arsenal.mjs';
import {BONUSES} from '../src/fps/bonuses.mjs';
import {NETWORK_MAPS} from '../shared/multiplayer/maps.mjs';

const root=new URL('../',import.meta.url), catalog=await buildContentCatalog();
const entry=(kind,id)=>catalog.entries.find(e=>e.kind===kind&&e.id===id);
const pkg=(...entries)=>({format:'cartridge-strike-content',version:1,id:'sample',entries});
const validate=(...entries)=>validateContentPackage(pkg(...entries),catalog);
const examples=['character','attachment','map','bonus','mode'];

test('public adapters resolve every content kind and ship only digest-checked assets',async()=>{
 assert.deepEqual([...new Set(catalog.entries.map(e=>e.kind))].sort(),
  ['attachment','audio','bonus','bot','character','map','mode','outfit','progression','rig','theme','weapon']);
 const assets=new Map(catalog.assets.map(f=>[f.path,f]));
 for(const {owner,license,source,assets:files} of catalog.entries){
  assert(owner&&license&&source);for(const f of files)assert(assets.has(f),f);
 }
 for(const {path,bytes,sha256} of assets.values()){
  assert(!path.includes('frontline/')&&!path.startsWith('docs/')&&!path.endsWith('.zip'));
  const body=await readFile(new URL(path,root));assert.equal(body.length,bytes,path);
  assert.equal(createHash('sha256').update(body).digest('hex'),sha256,path);
 }
 const source=entry('rig','quaternius-operator-female').details;
 assert(source.jointCounts[0]>40);assert.match(source.signature,/^[0-9a-f]{64}$/);
 assert(source.clips.includes(source.semantics.rush));
 assert.equal(entry('weapon','ar47').details.stats.damage,weaponDefinition('ar47').damage);
 assert(entry('attachment','red').details.weapons.includes('ar47'));
 assert.equal(entry('bonus','uav').details.durationTicks,BONUSES[0].durationTicks);
 assert.equal(entry('progression','nPompe').details.outfit,'nomad');
 const waves=entry('audio','meltem-a_waves');assert(waves.details.attribution.every(c=>c.creator&&c.license&&c.url));
 assert(entry('theme','tactical-industrial').details.tokens['--cs-mono']);
 for(const map of NETWORK_MAPS)assert.deepEqual(entry('map',map.id).details.online,map.modes);
});

test('all five package examples resolve from disk and preserve private progression ownership',async()=>{
 for(const name of examples){
  const descriptor=JSON.parse(await readFile(new URL('docs/cartridge-strike-3/content/catalog-examples/'+name+'.json',root)));
  const receipt=validateContentPackage(descriptor,catalog);
  assert.equal(receipt.catalogDigest,catalog.digest);
  assert.equal(receipt.resolved.length,descriptor.entries.length);
 }
 const result=validate({kind:'progression',id:'nPompe',outfit:'nomad'});
 assert(!Object.hasOwn(result,'unlocks'));
 assert.deepEqual(entry('outfit','nomad').details.requiresAll.toSorted(),['nBrut','nFfa','nPompe']);
});

test('unsupported IDs, file paths, schema, empty/duplicate entries and stale pins fail closed',()=>{
 for(const change of [{version:2},{format:'something-else'},{id:'../new'},{entries:[]},{entries:Array(65).fill({kind:'mode',id:'ffa'})}]){
  assert.throws(()=>validateContentPackage({...pkg({kind:'bonus',id:'rage'}),...change},catalog));
 }
 for(const row of [{kind:'bonus',id:'none'},{kind:'__proto__',id:'example'},{kind:['bonus'],id:'uav'},{kind:'rig',id:'file:///tmp/private.glb'},
  {kind:'character',id:'quaternius-operator-male',url:'assets/private.glb'},{kind:'weapon',id:'ar47',damage:999},
  {kind:'bonus',id:'uav',digest:'0'.repeat(64)}])assert.throws(()=>validate(row));
 const ref={kind:'bonus',id:'uav',digest:entry('bonus','uav').digest};
 assert.equal(validate(ref).resolved[0].digest,ref.digest);assert.throws(()=>validate(ref,ref),/Duplicate/);
});

test('map capabilities, equipment slots, public rigs and reward ownership are cross-checked',()=>{
 for(const invalid of [
  {kind:'map',id:'compact-arena',surface:'online',mode:'classic'},
  {kind:'mode',id:'dom',surface:'solo',map:'compact-arena'}, {kind:'map',id:'meltem',mode:'dom'},
  {kind:'mode',id:'dom',surface:'room',map:'meltem'},
  {kind:'attachment',id:'choke',weapon:'ar47'}, {kind:'weapon',id:'ar47',attachments:['red','holo']},
  {kind:'weapon',id:'ar47',attachments:['red','red']},{kind:'weapon',id:'ar47',attachments:['red','sil','vgrip','laser','xmag']},
  {kind:'character',id:'quaternius-operator-male',rig:'quaternius-operator-female'},
  {kind:'character',id:'business-hostage',outfit:'assault'}, {kind:'outfit',id:'assault',rig:'business-hostage'},
  {kind:'progression',id:'nPompe',outfit:'gilet'},
 ])assert.throws(()=>validate(invalid),JSON.stringify(invalid));
});

test('catalog compatibility follows map and asset fingerprints without self-hashing the network build',async()=>{
 const independent=Object.fromEntries(Object.entries(MAP_CONTRACTS).map(([id,c])=>[id,{...c,buildHash:'unrelated'}]));
 assert.equal((await buildContentCatalog({mapContracts:independent})).digest,catalog.digest);
 independent.meltem.collisionHash='1'.repeat(64);
 assert.notEqual((await buildContentCatalog({mapContracts:independent})).digest,catalog.digest);
 independent.meltem.mapHash='2'.repeat(64);
 await assert.rejects(()=>buildContentCatalog({mapContracts:independent}),/Map bytes disagree/);
});

test('package digests distinguish selected modes and equipment while retaining their reviewed definitions',()=>{
 const map={kind:'map',id:'meltem',surface:'online',mode:'ffa'};
 const ffa=validate(map),dom=validate({...map,mode:'dom'});
 assert.notEqual(ffa.packageDigest,dom.packageDigest);
 assert.deepEqual(ffa.resolved[0].selection,{mode:'ffa',surface:'online'});
 assert.deepEqual(dom.resolved[0].references,[{kind:'mode',id:'dom',digest:entry('mode','dom').digest}]);
 const rifle={kind:'weapon',id:'ar47',attachments:['sil','red']};
 assert.notEqual(validate(rifle).packageDigest,validate({...rifle,attachments:['red']}).packageDigest);
 assert.equal(validate(rifle,map).packageDigest,validate({...map,digest:entry('map','meltem').digest},{...rifle,attachments:['red','sil']}).packageDigest);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {coastalMaps} from './coastal-ambience.mjs';
import {coastalClipPath} from './coastal-recordings.mjs';
import {emitTephraLightning,tephraRecordings} from './tephra-ambience.mjs';

const root=new URL('../../',import.meta.url),read=file=>readFileSync(new URL(file,root));

test('all ten volcanic recordings preserve donor bytes, timing and seven original licenses',()=>{
  const inventory=JSON.parse(read('docs/cartridge-strike-3/maps/audio/tephra/takes.json'));
  const source=JSON.parse(read('frontline/source/assets/sfx/credits.json'));
  assert.equal(Object.keys(inventory.sources).length,7);
  assert.deepEqual(tephraRecordings,JSON.parse(read('frontline/source/assets/sfx/amb_tephra/meta.json')).s);
  assert.deepEqual(inventory.takes.map(r=>r.take).sort(),Object.keys(tephraRecordings).sort());
  for(const r of inventory.takes){
    const bytes=read(r.file);assert.deepEqual(bytes,read(r.donor));assert.equal(r.file,coastalClipPath('tephra',r.take));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);assert.equal(bytes.length,r.bytes);
    const donor=source.sons.filter(s=>s.pack==='amb_tephra'&&s.id===r.take);
    assert.deepEqual(r.sources.map(s=>[s.source,s.originalFile]),donor.map(s=>[s.source,s.fichier]));
    for(const s of r.sources){assert.equal(inventory.sources[s.source].license,'CC0 1.0');assert.equal(inventory.sources[s.source].creator,source.sources[s.source].auteur);}
  }
});

test('indoor volcanic bed, four active sulfur vents, silencers and turbines follow the source',()=>{
  const {tephra}=coastalMaps;
  assert.equal(tephra.water,undefined);assert.equal(tephra.bedGain,.5);
  assert.deepEqual(tephra.loops.filter(l=>l.bank==='a_bubble').map(l=>l.position),[[-18.2,.3,4.9],[-11,.3,-5],[-24.6,.3,-5.6],[-8.8,.3,6.2]]);
  assert.deepEqual(tephra.loops.filter(l=>l.bank==='a_steam').map(l=>l.position),[[-23.6,5.2,30],[-23.6,5.2,-30]]);
  assert.deepEqual(tephra.loops.at(-1).position,[23,2.5,0]);assert.deepEqual(tephra.spots.map(s=>s.every),[[18,40],[9,22]]);
  assert.deepEqual(tephra.spots[0].at(),[-290,150,0]);
});

test('only the current world receives single-bolt thunder and delayed calls remain bounded',()=>{
  const {tephra}=coastalMaps,world={},other={},calls=[];
  const ambience={voices:new Set(),loops:new Map(),spotVoices:0,play:(...args)=>calls.push(args)};
  const old=tephra.listen(world,{...ambience,play:()=>assert.fail('stale listener')});
  const stop=tephra.listen(world,ambience);old();
  for(const delay of [NaN,-1,1.49,4.01])emitTephraLightning(world,delay);
  emitTephraLightning(other,2);assert.equal(calls.length,0);
  emitTephraLightning(world,1.5);emitTephraLightning(world,4);assert.deepEqual(calls.map(a=>a.at(-1)),[1.5,4]);
  assert.deepEqual(calls[0][1],[-290,320,0]);assert.equal(calls[0][0].air,90);
  for(let i=0;i<4;i++)ambience.voices.add(i);emitTephraLightning(world,2.5);assert.equal(calls.length,2);
  stop();ambience.voices.clear();emitTephraLightning(world,2);assert.equal(calls.length,2);
});

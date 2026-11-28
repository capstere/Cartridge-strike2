// Offline execution of the pinned Riposte ground mask factories (MIT).
// Stop at the exact DataTexture construction; no donor renderer is loaded.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {readSource,declaration} from './atlas-painters.mjs';

const [id,path]=process.argv.slice(2);
const file={embruns:'02u-embruns.js',tephra:'02yh-tephra.js'}[id];
assert(file&&path,'Expected a reference map ID and an output prefix.');
const core='01-core.js', text=readSource(file);
const names=(f,kind,keys)=>keys.map(key=>declaration(f,kind,key));
const source=[...names(core,'const',['clamp','smoothstep']),...names(core,'function',['hyp','mulberry32','makeNoise'])];
const splat=text.match(/\bsplat: (\{[^}]+\})/);
assert(splat,'Missing original ground bounds.');
source.push('const SPLAT = '+splat[1]+';',declaration(file,'const','GROUND_'+id.toUpperCase()));
if(id==='tephra'){
  source.push(text.match(/const TPH = \{[^]*?\n\};/)[0],declaration(file,'const','TP_V'),
    ...names(file,'function',['tpN','tpVolcH','tpGroundH','tpMoss']),
    text.match(/TPH\.noise = makeNoise\(\d+\);/)[0]);
}
const factory=declaration(file,'function',id+'Ground');
const split='  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat)';
assert.equal(factory.split(split).length,2);
source.push(factory.split(split)[0]+'  return {out,W,H};\n}',
  'return {...'+id+'Ground(),bounds:SPLAT,layers:GROUND_'+id.toUpperCase()+'};');
const {out,W,H,bounds,layers}=Function(source.join('\n'))();
assert.equal(out.length,W*H*4);
writeFileSync(path+'.rgba',out);
writeFileSync(path+'.json',JSON.stringify({width:W,height:H,bounds,layers}));

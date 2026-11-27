import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {shotSound, shotTakes, decoderLead} from './shot-audio.mjs';
import {shotTiming} from './shot-timing.mjs';

const listener={x:0,y:1.6,z:0};
const bank=(weapon,x,y=1.6,actorId='remote')=>shotSound({weapon,actorId,x,y,z:0},listener,'me');

test('each local weapon uses its own POV immediately and far observers use the matching family',()=>{
  for(const [weapon,near,far] of [
    ['cr4','rifle','rifle'],['ar47','ak','rifle'],['p9','glock','pistol'],['p12','pistol','pistol'],
    ['shotgun','shotgun','shotgun'],['smg','smg','smg'],['sniper','sniper','sniper'],
  ]) {
    assert.deepEqual(bank(weapon,60,1.6,'me'),{bank:'g_'+near+'_pov',gain:.55,delay:0});
    assert.equal(bank(weapon,39.99).bank,'g_'+near+'_near');
    assert.equal(bank(weapon,40).bank,'g_far_'+far);
  }
  assert.equal(bank('p9',0,41.6).bank,'g_far_pistol');
  assert.ok(Math.abs(bank('p9',34.3).delay-.1)<1e-12);
  assert.equal(bank('p9',300).delay,.5);
  assert.equal(bank('bazooka',0),null);
});

test('encoder delay compensation respects both the decoded length and the original peak',()=>{
  for(const rate of [32000,44100,48000])for(const pad of [0,576,1105]){
    const scale=rate/48000,n=16000,pk=121;
    const values=new Float32Array(Math.round((n+pad)*scale));
    values[Math.round((pk+pad)*scale)]=1;
    const result=decoderLead({sampleRate:rate,length:values.length,getChannelData:()=>values},[n,pk]);
    assert.ok(Math.abs(result-pad/48000)<1/rate);
    // If the decoder already trimmed the clip, a later musical transient is not encoder priming.
    assert.equal(decoderLead({sampleRate:rate,length:Math.round(n*scale),getChannelData:()=>values},[n,pk]),0);
  }
});

test('all shipped takes are byte-identical to the cataloged donor recordings',()=>{
  const root=new URL('../../',import.meta.url);
  const {files}=JSON.parse(readFileSync(new URL('docs/cartridge-strike-3/evidence/audio/donor-takes.json',root)));
  const {s}=JSON.parse(readFileSync(new URL('frontline/source/assets/sfx/armes/meta.json',root)));
  assert.equal(files.length,38);
  assert.deepEqual(Object.keys(shotTiming).sort(),[...shotTakes].sort());
  for(const [i,take] of shotTakes.entries()){
    const f=files[i], source=readFileSync(new URL(f.source,root)),shipped=readFileSync(new URL(f.file,root));
    assert.equal(f.credit,'ffsl_tirs');assert(f.file.endsWith('riposte-'+take+'.mp3'));
    assert.deepEqual(shipped,source);assert.deepEqual(shotTiming[take],s[take]);
    assert.equal(createHash('sha256').update(shipped).digest('hex'),f.sha256);
  }
});

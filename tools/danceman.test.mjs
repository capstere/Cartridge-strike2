import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {Game} from '../src/fps/game.mjs';
import {createWorld} from '../src/fps/world.mjs';
import {POSES,LENGTH} from '../src/fps/zombie-poses.mjs';
import {tickDance,tickZombies} from '../src/fps/zombies.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const world=createWorld({levelProject:JSON.parse(read('levels/floor5-prepared.json'))});
const glb=read('assets/fps/Danceman/Danceman.glb');
const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)));
test('the four dances and death use the full original sampler durations',()=>{
  assert.equal(gltf.animations.length,16);
  for(const name of Object.values(POSES.danceman)){
    const clip=gltf.animations.find(a=>a.name===name);
    assert.ok(clip,name);
    const duration=Math.max(...clip.samplers.map(s=>gltf.accessors[s.input].max[0]));
    assert.ok(Math.abs(duration-LENGTH[name])<.00001,name);
  }
});
test('a stationary neutral dances in the clear alcove and stays dead throughout Endless',()=>{
  const game=new Game(world,{seed:42,config:{mode:'endless'}}).start();
  const z=game.state.zombies.find(z=>z.model==='danceman');
  const position=[z.x,z.y,z.z];
  assert.equal(world.roomAt(z.x,z.z).id,'C08');assert.ok(world.canOccupy(z.x,z.z,.90,1.8));
  assert.ok(world.doors.doors.every(d=>Math.hypot(d.x-z.x,d.z-z.z)>2.4));assert.equal(z.y,0);
  const sequence=[];
  for(let i=0;i<12;i++){
    sequence.push(z.clip);game.state.time=z.until;tickDance(game);
    assert.notEqual(z.clip,sequence.at(-1));
  }
  for(let i=0;i<12;i+=4)assert.equal(new Set(sequence.slice(i,i+4)).size,4);
  assert.deepEqual([z.x,z.y,z.z],position);
  const p=game.player,baseline=JSON.stringify([p.money,p.kills,game.state.score,game.bomb,game.hostages]);
  game.damage(z,110,p,'p9');assert.equal(z.clip,'Dead');
  game.state.time+=150;tickDance(game);tickZombies(game,1/60);
  assert.equal(z.alive,false);assert.equal(game.state.zombies.at(-1),z);
  assert.equal(JSON.stringify([p.money,p.kills,game.state.score,game.bomb,game.hostages]),baseline);
  game.start();assert.ok(game.state.zombies.at(-1).alive);
});

test('start event waits for playable presentation, deduplicates and honors mute',async()=>{
  const {FloorAudio}=await import('../src/fps/floor-audio.mjs');
  const floor=new FloorAudio(),played=[],buffer={duration:1.96};
  floor.buffers.set('prepare-to-fight',buffer);
  const game={phase:'active',player:{},state:{round:1,paused:false,zombies:[]}};
  const audio={game,volume:.5,context:{state:'running',createBufferSource:()=>({connect(){}})},
    channel:()=>({gain:{}}),track:source=>played.push(source.buffer)};
  const start=[{type:'start'}];
  floor.update(audio,start,false);assert.equal(played.length,0);
  floor.update(audio,[]);floor.update(audio,start);
  floor.reset();floor.update(audio,start);assert.deepEqual(played,[buffer]);
  game.state.round++;audio.volume=0;floor.update(audio,start);audio.volume=.5;
  floor.update(audio,[]);assert.equal(played.length,1);
  game.state.round++;floor.update(audio,start);assert.equal(played.length,2);
});

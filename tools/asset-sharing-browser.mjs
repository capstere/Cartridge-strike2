import assert from 'node:assert/strict';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({channel:'chromium'});
try{
 const p=await b.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});await p.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/fps/?test&seed=42');await p.waitForFunction(()=>window.__fps,null,{timeout:180000});await p.locator('#start').click();await p.waitForFunction(()=>__fps.game.player&&document.querySelector('#cs-loading').hidden);
 const result=await p.evaluate(async()=>{
  __fps.stopFrameLoop();const {AnimationClip,AnimationMixer}=await import('../vendor/three/three.module.js'),{cloneSkinned}=await import('../src/fps/skinned-clone.mjs');let tracks=0,poses=0;
  const states=[...__fps.renderer.actors.values()].map(m=>m.userData.avatar).filter(s=>s&&!s.isHostage);
  const originals=new Map();
  for(const s of states)for(const [name,source]of s.clips){
   const lower=s.base.get(name).getClip(),upper=s.upper.get(name).getClip();
   for(const track of [...lower.tracks,...upper.tracks]){if(!source.tracks.includes(track))throw Error('Copied track');tracks++;}
   const key=s.gender+':'+name,prior=originals.get(key);if(prior&&prior!==lower)throw Error('Duplicate split');originals.set(key,lower);
  }
  for(const s of states.filter((s,i,a)=>a.findIndex(x=>x.gender===s.gender)===i)){
  const root=cloneSkinned(s.root),other=cloneSkinned(s.root),old=new AnimationMixer(root),next=new AnimationMixer(other);
  s.mixer.stopAllAction();
  // Independent upstream-style track copies produce exactly the same bone poses.
  for(const [name,action]of [...s.base,...s.upper]){const c=action.getClip(),reference=new AnimationClip(c.name,c.duration,c.tracks.map(t=>t.clone()));const a=old.clipAction(reference),d=next.clipAction(c);a.play();d.play();
   for(const t of [0,.17,.51,c.duration]){old.setTime(t);next.setTime(t);const left=[],right=[];root.traverse(o=>{if(o.isBone)left.push(...o.position,...o.quaternion,...o.scale)});other.traverse(o=>{if(o.isBone)right.push(...o.position,...o.quaternion,...o.scale)});if(left.some((v,i)=>v!==right[i]))throw Error('Pose changed '+name);poses++;}a.stop();d.stop();
  }
  }
  const f=__fps;await f.audio.dispose();f.renderer.zombieVisuals.dispose();
  if(f.audio.context.state!=='closed'||f.audio.active.size||f.renderer.zombieVisuals.sources.size||f.renderer.zombieVisuals.instances.size)throw Error('Teardown retained owned resources');
  return {disposed:true,operators:states.length,tracks,poses,distinctActions:states[0].base.get('Idle_Loop')!==states[1].base.get('Idle_Loop')};
 });assert(result.tracks>0&&result.poses>0&&result.distinctActions);console.log(JSON.stringify(result));
}finally{await b.close();}

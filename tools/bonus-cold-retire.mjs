// The authoritative seat projection supplies the class replacement during live play.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function recordWarmOwner(){
  const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1'),draw=Renderer.prototype.render;
  Renderer.prototype.render=function(...args){window.observedColdRenderer=this;return draw.apply(this,args);};
}
export async function retireRemoteOutfit(touch,host,room,seat,output){
  const result=await touch.evaluate(async({id,outfit})=>{
    const {uniformSwatch}=await import('/src/fps/operator-equipment.mjs');
    const {OUTFITS}=await import('/src/fps/operator-outfits.mjs');
    const {WebGLRenderer}=await import('/vendor/three/three.module.js');
    const tile=uniformSwatch(OUTFITS.find(o=>o.id===outfit)),owner=window.observedColdRenderer;
    const rig=owner.actors.get(id)?.userData.avatar;
    const material=[...rig.materials.values()].find(m=>m.name==='jacket-fabric'),applied=material.map;
    const listeners=t=>t._listeners?.dispose?.length??0;
    const separate=new WebGLRenderer();separate.setSize(8,8,false);separate.initTexture(tile);
    const gl=separate.getContext(),texture=separate.properties.get(tile).__webglTexture;
    const evidence=()=>({sourceShared:applied.source===tile.source,sameHandle:applied===tile,
      patternListeners:listeners(tile),apparelListeners:listeners(applied),separateAlive:gl.isTexture(texture),
      activeOutfit:owner.actors.get(id)?.userData.avatar?.outfitId,disposed:!!owner.presentationDisposed,
      knownPrograms:(owner.operatorProgramMaterials||[]).map(m=>owner.renderer.properties.get(m).currentProgram?.id)});
    window.retireProof={evidence,finish(){const value=evidence();separate.forceContextLoss();separate.dispose();return value;}};
    return {outfit:rig.outfitId,before:evidence()};
  },{id:seat.actor.id,outfit:seat.outfitId});
  seat.outfitId='issued';room.project();
  await touch.waitForFunction(()=>retireProof.evidence().activeOutfit==='issued');
  result.afterReplacement=await touch.evaluate(()=>retireProof.evidence());
  room.match.finish('score','analysts');
  await host.locator('#room-rematch').click();await host.locator('#room-map').selectOption('meltem');
  await touch.waitForFunction(()=>retireProof.evidence().disposed);
  result.afterMapExit=await touch.evaluate(()=>retireProof.finish());
  await writeFile(join(output,'cold-retire.json'),JSON.stringify(result,null,2)+'\n');
  assert(result.before.sourceShared&&!result.before.sameHandle);
  assert(result.before.separateAlive&&result.before.apparelListeners>=1);
  assert.equal(result.afterReplacement.apparelListeners,0);
  assert.deepEqual(result.before.knownPrograms,result.afterReplacement.knownPrograms);
  assert(result.before.knownPrograms.length>0);
  assert.equal(result.afterMapExit.patternListeners,1);
  assert(result.afterMapExit.separateAlive&&result.afterMapExit.disposed);
}

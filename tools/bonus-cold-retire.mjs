// An authoritative seat projection supplies the class replacement during live play.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function recordWarmOwner(){
  const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1'),draw=Renderer.prototype.render;
  Renderer.prototype.render=function(...args){window.observedColdRenderer=this;return draw.apply(this,args);};
}
async function observe({id,outfit,firstPerson}){
  const {uniformSwatch}=await import('/src/fps/operator-equipment.mjs');
  const {OUTFITS}=await import('/src/fps/operator-outfits.mjs');
  const {WebGLRenderer}=await import('/vendor/three/three.module.js');
  const tile=uniformSwatch(OUTFITS.find(o=>o.id===outfit)),owner=window.observedColdRenderer;
  const actorOutfit=()=>owner.actors.get(id)?.userData.avatar?.outfitId;
  const currentProfile=()=>owner.weaponModel?.userData.characterAppearance?.profile;
  const material=firstPerson?currentProfile().sleeve:
    [...owner.actors.get(id).userData.avatar.materials.values()].find(m=>m.name==='jacket-fabric');
  const profile=firstPerson?currentProfile():null,applied=material.map;
  const listeners=t=>t._listeners?.dispose?.length??0;
  const independent=new WebGLRenderer();independent.setSize(8,8,false);independent.initTexture(tile);
  const gl=independent.getContext(),texture=independent.properties.get(tile).__webglTexture;
  const evidence=()=>({sourceShared:applied.source===tile.source,sameHandle:applied===tile,
    patternListeners:listeners(tile),apparelListeners:listeners(applied),separateAlive:gl.isTexture(texture),
    activeOutfit:firstPerson?window.streakSession.view.player?.outfitId??null:actorOutfit(),
    profileReplaced:firstPerson?currentProfile()!==profile:null,profileOwners:owner.operatorViewProfiles?.size,
    disposed:!!owner.presentationDisposed,
    knownPrograms:(owner.operatorProgramMaterials||[]).map(m=>owner.renderer.properties.get(m).currentProgram?.id)});
  window.retireProof={evidence,finish(){const value=evidence();independent.forceContextLoss();independent.dispose();return value;}};
  return {firstPerson,outfit,before:evidence()};
}
export async function retireRemoteOutfit(desktop,touch,host,room,seat,output){
  const pages=[desktop,touch],results=await Promise.all(pages.map((page,i)=>page.evaluate(observe,
    {id:seat.actor.id,outfit:seat.outfitId,firstPerson:i===0})));
  seat.outfitId='issued';room.project();
  await Promise.all(pages.map((page,i)=>page.waitForFunction(firstPerson=>{
    const state=retireProof.evidence();return state.activeOutfit==='issued'&&(!firstPerson||state.profileReplaced);
  },i===0)));
  for(const [i,page] of pages.entries())results[i].afterReplacement=await page.evaluate(()=>retireProof.evidence());
  room.match.finish('score','analysts');
  await host.locator('#room-rematch').click();await host.locator('#room-map').selectOption('meltem');
  for(const [i,page] of pages.entries()){
    await page.waitForFunction(()=>retireProof.evidence().disposed);
    results[i].afterMapExit=await page.evaluate(()=>retireProof.finish());
  }
  await writeFile(join(output,'cold-retire.json'),JSON.stringify(results,null,2)+'\n');
  for(const row of results){
    assert(row.before.sourceShared&&!row.before.sameHandle);
    assert(row.before.separateAlive&&row.before.apparelListeners>=1);
    if(row.firstPerson)assert(row.afterReplacement.profileReplaced);
    else assert.equal(row.afterReplacement.apparelListeners,0);
    assert.deepEqual(row.before.knownPrograms,row.afterReplacement.knownPrograms);
    assert(row.before.knownPrograms.length>0);
    assert.equal(row.afterMapExit.patternListeners,1);assert.equal(row.afterMapExit.apparelListeners,0);
    assert.equal(row.afterMapExit.profileOwners,0);assert.equal(row.afterMapExit.knownPrograms.length,0);
    assert(row.afterMapExit.separateAlive&&row.afterMapExit.disposed);
  }
}

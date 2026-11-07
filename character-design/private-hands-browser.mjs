/** Exercises the real renderer's cached view weapons and spectator palette. */
import assert from 'node:assert/strict';
export async function verifyPrivateHands(page){
 const report=await page.evaluate(async()=>{
  const {privateCharacterAppearance}=await import('../src/fps/character-library.mjs?v=6.1.2');
  const {WEAPONS}=await import('../src/fps/config.mjs');
  const profile=privateCharacterAppearance('analysts-0'),r=__fps.renderer;let g=__fps.game;
  const hand=[];r.actors.get('analysts-0').userData.avatar.root.traverse(o=>{if(o.material?.name==='gloves-leather')hand.push(o.material.color.toArray());});
  if(!hand.length||hand.some(c=>JSON.stringify(c)!==JSON.stringify(profile.glove.color.toArray())))throw Error('First-person hand color differs from exported character');
  const size=r.renderer.getSize(new (await import('../vendor/three/three.module.js')).Vector2());
  // Small viewport for palette assertions; restore full size for visual captures.
  r.renderer.setSize(320,225,false);
  const weaponResults=[];
  for(const id of Object.keys(WEAPONS).filter(id=>WEAPONS[id].slot!=='armor')){
   // Render fixtures use the normal renderer, without changing the game inventory.
   const actor={...g.player,weapon:id,reloadUntil:0};r.render(g,actor,1/60);const model=r.weaponModel,state=model.userData.characterAppearance;
   if(!state?.targets.length||state.profile!==profile)throw Error('Appearance missing for '+id);
   const meshCount=[];model.traverse(o=>{if(o.isMesh)meshCount.push(o);});
   r.render(g,{...actor,id:'analysts-2'},1/60);
   if(state.targets.some(t=>t.mesh.material!==t.material||t.mesh.visible!==t.visible))throw Error('Spectator restore failed '+id);
   r.render(g,actor,1/60);if(state.targets.some(t=>t.mesh.material!==(t.role==='hand'?profile.glove:profile.sleeve)))throw Error('Cached restore failed '+id);
   weaponResults.push({id,targets:state.targets.length,meshes:meshCount.length});
  }
  __fps.start('analysts');g=__fps.game;g.state.phase='active';g.player.nextShot=0;const item=g.item(),before=item.ammo;
  __fps.step({fire:true},1/60);if(item.ammo!==before-1)throw Error('Firing did not consume one round');
  if(!g.reload())throw Error('Reload did not start');const end=g.player.reloadUntil;
  // Advance the actual game in small steps through the reload, with bots disabled
  // only in this deterministic fixture (not in the playable match).
  for(const a of g.actors)if(a!==g.player)a.bot=null;
  const steps=Math.ceil((end-g.state.time)*60)+4;for(let i=0;i<steps;i++)g.update(1/60,{});
  if(g.item().ammo!==WEAPONS[g.player.weapon].magazine)throw Error('Reload did not refill magazine');
  r.renderer.setSize(size.x,size.y,false);__fps.start('analysts');__fps.step({},.016);
  return {handColor:profile.glove.color.toArray(),skin:profile.skin,shirt:profile.cloth,weapons:weaponResults,fired:true,reloaded:true};
 });
 assert(report.weapons.length>=12);assert(report.fired&&report.reloaded);
 for(const [id,phase] of [['p9','idle'],['cr4','reload'],['smg','idle'],['knife','idle']]){
  await page.evaluate(({id,phase})=>{const g=__fps.game,r=__fps.renderer;g.state.time=20;const actor={...g.player,weapon:id,reloadUntil:phase==='reload'?21:0,inventory:{...g.player.inventory,primary:{id,ammo:0}},aimAmount:0};r.render(g,actor,1/60);r.switchAt=0;r.render(g,actor,1/60);},{id,phase});
  await page.screenshot({path:`test-results/private-character/hands-${id}-${phase}.png`});
 }
 // Wider view of the same first-person meshes exposes the short sleeve boundary.
 await page.evaluate(()=>{const r=__fps.renderer,g=__fps.game;const actor={...g.player,weapon:'p9',reloadUntil:0};r.render(g,actor,1/60);r.switchAt=0;r.render(g,actor,1/60);r.viewCamera.position.z=.65;r.viewCamera.updateMatrixWorld();r.renderer.autoClear=true;r.renderer.render(r.viewScene,r.viewCamera);r.renderer.getContext().finish();});
 await page.screenshot({path:'test-results/private-character/hands-sleeve-inspection.png'});
 await page.evaluate(()=>{__fps.renderer.viewCamera.position.z=0;__fps.renderer.viewCamera.updateMatrixWorld();});
 console.log('PRIVATE_HANDS_OK',JSON.stringify(report));return report;
}

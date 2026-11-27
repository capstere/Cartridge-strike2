import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {WEAPONS} from '../src/fps/config.mjs';

// Inventory and lane are fixtures. The ordinary mouse and keyboard start each
// shot, selection, cancellation and reload. The fixed-step game sets all times.
export async function captureHandlingFamilies(page,out){
  const report=[];
  await page.waitForFunction(()=>['bolt-1','pump-1','charge_rifle-1','charge_rifle-2'].every(id=>__fps.audio.reloadFoley.buffers.has(id)));
  await page.evaluate(()=>{
    const f=__fps,system=f.audio,track=system.track.bind(system);
    window.familyVoices=[];
    const mechanical=new Map([...system.reloadFoley.buffers].map(([name,buffer])=>[buffer,name]));
    system.track=(source,channel,duration,offset)=>{
      const result=track(source,channel,duration,offset);
      const take=mechanical.get(source.buffer);
      if(take)familyVoices.push({take,time:f.game.state.time,weapon:f.game.player.weapon,
        contextTime:system.context.currentTime,scheduled:channel.when,duration});
      return result;
    };
  });
  const picture=label=>page.screenshot({path:join(out,'family-'+label+'.png'),timeout:15000});
  const sample=seconds=>page.evaluate(seconds=>{
    const f=__fps;
    for(let tick=0;tick<Math.round(seconds*60);tick+=2){
      const ticks=Math.min(2,Math.round(seconds*60)-tick);
      f.step(null,ticks/60);
    }
    const a=f.game.player,d=f.renderer.weaponModel.userData,item=f.game.item();
    return {time:f.game.state.time,casings:f.renderer.combatEffects.stats.casings,weapon:a.weapon,ammo:item?.ammo,reserve:item?.reserve,reloadUntil:a.reloadUntil,
      slideZ:d.slide?.position.z,slideTurn:d.slide?.rotation.z,pumpZ:d.pump?.position.z,
      magazine:d.magazine?.position.toArray(),left:d.leftHand.position.toArray(),right:d.rightHand.position.toArray(),
      shots:[...rushEvidence.shots],audio:[...rushEvidence.audio]};
  },seconds);
  for(const id of ['p9','p12','cr4','ar47','smg','shotgun','sniper','bazooka']){
    const spec=WEAPONS[id],slot=spec.slot==='primary'?'1':'2';
    await page.keyboard.press('3');
    await page.evaluate(({id,slot})=>{
      const f=__fps,g=f.game,a=g.player,item=g.weaponItem(id);
      item.ammo=Math.min(2,item.ammo);a.inventory[slot]=item;
      Object.assign(a,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0});
      f.step({yaw:Math.PI,pitch:id==='bazooka'?.72:0},1/60);
      rushEvidence.shots.length=rushEvidence.audio.length=familyVoices.length=0;
    },{id,slot:spec.slot});
    await page.keyboard.press(slot);const ready=await sample(1.3);
    assert.equal(ready.weapon,id);
    await page.mouse.down();await page.mouse.up();
    const early=await sample(.067);
    // At the 30 Hz sampling rate the released edge first renders one frame
    // after input. Cross the modeled .44/.30 marker before counting its case.
    const motion=await sample(id==='sniper'?.433:id==='shotgun'?.30:0);
    assert.equal(early.ammo,ready.ammo-1);
    const lateEject=id==='sniper'||id==='shotgun',noCasing=id==='bazooka';
    assert.equal(early.casings-ready.casings,lateEject||noCasing?0:1);
    assert.equal(motion.casings-ready.casings,noCasing?0:1);
    assert.equal(motion.shots.length,1);assert.deepEqual(motion.shots,motion.audio);
    await picture(id+'-shot');
    if(id==='sniper')assert(motion.slideTurn>1 && motion.slideZ>.08);
    if(id==='shotgun')assert(motion.pumpZ>.06);
    // The launcher has a one-round magazine and no tactical reload variant.
    let interrupted=null;
    if(spec.magazine>1){
      await page.keyboard.press('r');interrupted=await sample(.38*spec.reload);
      assert(interrupted.reloadUntil>interrupted.time && interrupted.ammo===1);
      await picture(id+'-tactical');
      await page.keyboard.press('3');await sample(.05);
      await page.keyboard.press(slot);const cancelled=await sample(.7*spec.reload);
      assert.equal(cancelled.ammo,1);assert.equal(cancelled.reserve,interrupted.reserve);assert.equal(cancelled.reloadUntil,0);
      await page.mouse.down();await page.mouse.up();const empty=await sample(.13);
      assert.equal(empty.ammo,0);assert.equal(empty.shots.length,2);assert.deepEqual(empty.shots,empty.audio);
    }
    await page.keyboard.press('r');
    const fraction=id==='shotgun'?.955:id==='sniper'?2.48/3.4:id==='bazooka'?.39:.83;
    const action=await sample(fraction*spec.reload);assert(action.reloadUntil>action.time);assert.equal(action.ammo,0);
    await picture(id+'-empty');
    const finished=await sample((1-fraction)*spec.reload+.15);
    assert.equal(finished.reloadUntil,0);assert.equal(finished.ammo,spec.magazine);
    assert.equal(finished.ammo+finished.reserve,action.reserve);
    const voices=await page.evaluate(()=>structuredClone(familyVoices));
    const cycle={cr4:['charge_rifle-2',1],ar47:['charge_rifle-1',1],smg:['charge_rifle-1',1],
      sniper:['bolt-1',2],shotgun:['pump-1',2]}[id];
    if(cycle)assert.equal(voices.filter(v=>v.take===cycle[0]).length,cycle[1],id+' actual mechanical sources');
    report.push({id,ready,early,motion,interrupted,action,finished,voices});
    writeFileSync(join(out,'families.json'),JSON.stringify(report,null,2));
    console.log(id,'normal keyboard/mouse handling passed');
  }
  await page.keyboard.press('3');const beforeMelee=await sample(1.3);
  await page.mouse.down();await page.mouse.up();const swing=await sample(.15);
  assert.equal(swing.weapon,'knife');assert.equal(swing.shots.length,beforeMelee.shots.length+1);
  assert.deepEqual(swing.shots,swing.audio);await picture('knife-swing');
  const recovered=await sample(.5);assert.deepEqual(recovered.shots,swing.shots);report.push({id:'knife',swing,recovered});
  writeFileSync(join(out,'families.json'),JSON.stringify(report,null,2));
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {ReloadFoley,PRIMARY_RELOADS,SHOT_CYCLES} from './reload-foley.mjs';
import {WEAPONS} from './config.mjs';

test('primary reload markers follow the active reload across mute, pause and frame gaps',()=>{
  const foley=new ReloadFoley(), actor={weapon:'shotgun',alive:true,reloadUntil:2.6};
  const audio={volume:1,context:{state:'running'},game:{actors:[actor],state:{paused:false}}};
  const heard=[];
  foley.play=(audio,actor,cue)=>heard.push(cue.take);
  foley.update(audio,0,.65);
  foley.update(audio,.65,.65);
  audio.volume=0;foley.update(audio,.65,1.30);
  audio.volume=1;foley.update(audio,1.30,1.4);
  foley.update(audio,1.4,2.18); // missed a shell during a long frame
  audio.game.state.paused=true;foley.update(audio,2.18,2.36);
  audio.game.state.paused=false;foley.update(audio,2.36,2.6);
  assert.deepEqual(heard,['shell-1']);
  assert.deepEqual(Object.keys(PRIMARY_RELOADS).sort(),Object.keys(WEAPONS).filter(id=>WEAPONS[id].slot==='primary').sort());
});

test('switch, death, completion and replacement stop only that actor’s active Foley',()=>{
  for(const change of [a=>a.weapon='p9',a=>a.alive=false,a=>a.reloadUntil=0,a=>a.reloadUntil=5]){
    const foley=new ReloadFoley(), actors=[1,2].map(id=>({id,alive:true,weapon:'ar47',reloadUntil:3}));
    const stopped=[];
    for(const a of actors)foley.voices.set(a.id+'/magazine',{id:a.id,weapon:'ar47',until:3,reloadUntil:3,source:{stop:()=>stopped.push(a.id)}});
    change(actors[0]);
    foley.update({volume:1,context:{state:'running'},game:{actors,state:{}}},1,1);
    assert.deepEqual(stopped,[1]);assert.equal(foley.voices.size,1);
  }
});

test('recorded contact peaks coincide with the moving parts on the actual viewmodels',async()=>{
  const {makeWeapon,animateWeapon}=await import('./models.mjs');
  // Seconds from MP3 start to peak measured in the supplied recordings.
  const peak={ 'magout_rifle-1':.170,'magout_rifle-2':.003,'magin_rifle-1':.026,'magin_rifle-2':.004,
    'charge_rifle-2':.349,'charge_rifle-1':.224,'bolt-1':.483,'pump-1':.134,magout_smg:.002,magin_smg:.006,'shell-1':.006,'shell-2':.010,
    'shell-3':.241,'pickup-2':.244,'stow-2':.062 };
  for(const [id,cues] of Object.entries(PRIMARY_RELOADS)){
    const model=makeWeapon(id),d=model.userData,duration=WEAPONS[id].reload;
    const actor={alive:true,weapon:id,onGround:true,reloadUntil:10+duration,inventory:{primary:{id,ammo:0}}};
    for(const cue of cues){
      actor.inventory.primary.ammo=cue.loadedOnly?1:0;
      // Distinct reload beginnings select the same variant as real gameplay.
      actor.reloadUntil+=10;
      const start=actor.reloadUntil-duration;
      const time=start+duration*cue.at+peak[cue.take];
      const pose=animateWeapon(model,actor,time,1/60);
      assert.ok(pose.reloading && (cue.mechanism || d.magazine.visible),id+' '+cue.take);
      const offset=d.magazine.position.distanceTo(d.magazineHome);
      if(cue.take.startsWith('magout') || cue.take==='pickup-2')assert.ok(offset>.025,id+' withdrawal');
      else if(cue.take==='bolt-1'){
        // First substantial decoded contact at +107 ms catches the lifted
        // handle; the +483 ms peak occurs as the Scout locks it back down.
        const locked=d.slide.rotation.z;
        animateWeapon(model,actor,start+duration*cue.at+.107,1/60);
        assert(d.slide.rotation.z>.85 && locked<.25);
      }else if(cue.take==='pump-1')assert(d.pump.position.z>.065);
      else if(cue.take.startsWith('charge_'))assert.ok(d.slide.position.distanceTo(d.slideHome)>.02,id+' moving handle');
      else assert.ok(offset<(id==='shotgun'?.03:.02),id+' seating');
    }
  }
});

test('shot foley crosses each donor marker once with a rotating Scout bolt or moving pump',async()=>{
  const {makeWeapon,animateWeapon}=await import('./models.mjs');
  for(const [weapon,cue] of Object.entries(SHOT_CYCLES)){
    const foley=new ReloadFoley(),actor={id:'peer',weapon,alive:true,lifeId:1,controlEpoch:2,reloadUntil:0};
    const game={actors:[actor],phase:'active',state:{round:1}},audio={volume:1,context:{state:'running'},game},heard=[];
    foley.play=(a,p,marker)=>heard.push(marker.take);
    const model=makeWeapon(weapon),d=model.userData,event={type:'shot',actorId:'peer',time:10,weapon,actionId:'peer:1:2:17'};
    foley.update(audio,9.98,10,[event]);
    foley.update(audio,10,10+cue.at-.001,[{...event,serial:12}]);assert.deepEqual(heard,[]);
    foley.update(audio,10+cue.at-.001,10+cue.at);assert.deepEqual(heard,[cue.take]);
    const phase=cue.at+(weapon==='sniper'?.107:.134);
    animateWeapon(model,actor,10+phase,1/60,{shotAt:10});
    if(weapon==='sniper')assert(d.slide.rotation.z>1);
    else assert(d.pump.position.z>.025);
    foley.update(audio,10+cue.at,10.94,[event]);assert.deepEqual(heard,[cue.take]);
  }
});

test('shot foley discards stale markers across interruption, actor replacement and muted gaps',()=>{
  for(const alter of [
    (a,actor)=>{actor.weapon='p9';},(a,actor)=>{actor.alive=false;},(a,actor)=>{actor.reloadUntil=20;},
    (a,actor)=>{a.game.actors=[{...actor,controlEpoch:3}];},(a,actor)=>{a.game.actors=[{...actor,lifeId:9}];},
    a=>{a.game.state.round++;},a=>{a.game.state.paused=true;},a=>{a.volume=0;},
    (a,actor,f)=>{f.reset();},a=>{a.context.state='suspended';}
  ]){
    const f=new ReloadFoley(),actor={id:'p',weapon:'sniper',alive:true,lifeId:1,controlEpoch:2,reloadUntil:0};
    const audio={volume:1,context:{state:'running'},game:{actors:[actor],phase:'active',state:{round:1}}};
    const heard=[];f.play=(a,p,marker)=>heard.push(marker.take);
    const shot={type:'shot',actorId:'p',time:1,weapon:'sniper',actionId:'p:1:2:9'};
    f.update(audio,.98,1,[shot]);alter(audio,actor,f);f.update(audio,1,1.16);
    audio.volume=1;audio.context.state='running';audio.game.state.paused=false;
    f.update(audio,1.16,2.3);assert.deepEqual(heard,[]);assert.equal(f.pending.size,0);
  }
});

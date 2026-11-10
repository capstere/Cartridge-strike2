import assert from 'node:assert/strict';
import test from 'node:test';
import {ReloadFoley,PRIMARY_RELOADS} from './reload-foley.mjs';
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
    for(const a of actors)foley.voices.set(a,{weapon:'ar47',until:3,source:{stop:()=>stopped.push(a.id)}});
    change(actors[0]);
    foley.update({volume:1,context:{state:'running'},game:{actors,state:{}}},1,1);
    assert.deepEqual(stopped,[1]);assert.equal(foley.voices.size,1);
  }
});

test('recorded contact peaks coincide with the moving parts on the actual viewmodels',async()=>{
  const {makeWeapon,animateWeapon}=await import('./models.mjs');
  // Seconds from MP3 start to peak measured in the supplied recordings.
  const peak={ 'magout_rifle-1':.170,'magout_rifle-2':.003,'magin_rifle-1':.026,'magin_rifle-2':.004,
    'charge_rifle-2':.349,magout_smg:.002,magin_smg:.006,'shell-1':.006,'shell-2':.010,
    'shell-3':.241,'pickup-2':.244,'stow-2':.062 };
  for(const [id,cues] of Object.entries(PRIMARY_RELOADS)){
    const model=makeWeapon(id),d=model.userData,duration=WEAPONS[id].reload;
    const actor={alive:true,weapon:id,onGround:true,reloadUntil:10+duration,inventory:{primary:{id,ammo:0}}};
    for(const cue of cues){
      const time=10+duration*cue.at+peak[cue.take];
      const pose=animateWeapon(model,actor,time,1/60);
      assert.ok(pose.reloading && d.magazine.visible,id+' '+cue.take);
      const offset=d.magazine.position.distanceTo(d.magazineHome);
      if(cue.take.startsWith('magout') || cue.take==='pickup-2')assert.ok(offset>.025,id+' withdrawal');
      else if(cue.emptyOnly)assert.ok(d.slide.position.distanceTo(d.slideHome)>.02,'CR4 charging handle');
      else assert.ok(offset<(id==='shotgun'?.03:.02),id+' seating');
    }
  }
});

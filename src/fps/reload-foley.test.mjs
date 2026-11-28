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

test('a spectator ear or life change stops spatially placed mechanisms from the former viewpoint',()=>{
  for(const change of [{id:'b'},{lifeId:8},{controlEpoch:4},{alive:false}]){
    const actor={id:'scout',weapon:'sniper',alive:true,lifeId:1,controlEpoch:1,reloadUntil:0};
    const ear={id:'a',alive:true,lifeId:7,controlEpoch:3},f=new ReloadFoley(),heard=[];
    const audio={volume:1,context:{state:'running'},game:{actors:[actor],phase:'active',state:{round:1}}};
    f.play=(a,p,cue)=>heard.push(cue.take);
    f.update(audio,.99,1,[{type:'shot',actorId:'scout',weapon:'sniper',time:1,actionId:'shot1'}],ear);
    let stopped=0;
    f.voices.set('scout/action',{id:actor.id,source:{stop:()=>stopped++},weapon:'sniper',life:1,epoch:1,reloadUntil:0,round:1,until:1.9});
    f.update(audio,1,1.04,[],{...ear});
    assert.equal(stopped,0);assert.equal(f.pending.size,1);
    f.update(audio,1.04,1.16,[],{...ear,...change});
    assert.equal(stopped,1);assert.equal(f.pending.size,0);assert.deepEqual(heard,[]);
  }
});

test('Rage and ordinary reloads start at zero, animate the same poses at matching phases and release at the accepted deadline',async()=>{
  const {makeWeapon,animateWeapon}=await import('./models.mjs');
  const {animateAuthored}=await import('./character-library.mjs');
  const T=await import('../../vendor/three/three.module.js');
  const {reloadPhase}=await import('./strike-kit-timing.mjs');
  for(const id of ['smg','p9','cr4']){
    const duration=WEAPONS[id].reload,start=10;
    const actors=[1,.75].map(scale=>({id:'player',x:0,z:0,height:1.7,alive:true,onGround:true,moving:0,weapon:id,
      inventory:{item:{id,ammo:2}},reloadStartedAt:start,reloadDuration:duration*scale,reloadUntil:start+duration*scale}));
    const models=actors.map(()=>makeWeapon(id));
    const third=actors.map(()=>{
      const root=new T.Group(),mixer=new T.AnimationMixer(root);
      const action=name=>mixer.clipAction(new T.AnimationClip(name,2,[]));
      return {root,holder:root,mixer,scale:1,groundOffset:0,groundInverse:new T.Matrix4(),bones:new Map(),
        shoes:[],footSamples:[],time:null,x:null,z:null,base:new Map([['Idle_Loop',action('Idle_Loop')]]),
        upper:new Map(['Pistol_Reload','Pistol_Idle_Loop'].map(n=>[n,action(n)]))};
    });
    for(const fraction of [0,.13,.33,.55,.77,.99,1]){
      const offsets=[];
      for(const [i,a] of actors.entries()){
        const time=start+fraction*a.reloadDuration;
        const pose=animateWeapon(models[i],a,time,1/60);
        assert.equal(pose.reloading,fraction<1);
        const d=models[i].userData;
        offsets.push(d.magazine.position.distanceTo(d.magazineHome));
        assert(Math.abs(reloadPhase(a,id,time,duration)-(fraction<1?fraction:0))<1e-7);
        animateAuthored(third[i],a,time);
        if(fraction<1)assert(Math.abs(third[i].upper.get('Pistol_Reload').time-fraction*1.999)<1e-6);
        else assert.equal(third[i].activeUpper,'Pistol_Idle_Loop');
      }
      assert(Math.abs(offsets[0]-offsets[1])<1e-7,id+' '+fraction);
      if(fraction===.33)assert(offsets[0]>.02);
      if(fraction===0 || fraction===1)assert(offsets[0]<1e-7);
    }
  }
});

test('shortened SMG foley follows the original accepted interval across snapshot replacements and Rage expiry',()=>{
  const foley=new ReloadFoley(),start=12,duration=1.35;
  const actor={id:'remote',weapon:'smg',alive:true,reloadStartedAt:start,reloadUntil:start+duration,reloadDuration:duration,
    inventory:{primary:{id:'smg',ammo:0}}};
  const audio={volume:1,context:{state:'running'},game:{actors:[actor],state:{round:1}}};
  const heard=[];
  foley.play=(a,p,cue,remaining,rate)=>{assert(Math.abs(rate-4/3)<1e-7);heard.push(cue.take);};
  foley.update(audio,start-.01,start);assert.deepEqual(heard,[]);
  foley.update(audio,start,start+.22*duration-.001);assert.deepEqual(heard,[]);
  foley.update(audio,start+.22*duration-.001,start+.22*duration+.001);assert.deepEqual(heard,['magout_smg']);
  audio.game.actors=[{...actor,controlEpoch:2,bonus:{active:null}}];
  foley.update(audio,start+.7*duration,start+.77*duration+.001);
  assert.deepEqual(heard,['magout_smg','magin_smg','charge_rifle-1']);
  foley.update(audio,start+.78*duration,start+duration);
  assert.equal(heard.length,3);
});

test('pistol foley can join an in-progress fast reload, deduplicates a late event, and uses current observer scope',async()=>{
  const {AudioSystem}=await import('./strike-kit-audio.mjs');
  const audio=new AudioSystem({},{volume:1});
  const start=10,duration=WEAPONS.p9.reload*.75;
  const actor={id:'peer',alive:true,weapon:'p9',lifeId:2,controlEpoch:4,reloadStartedAt:start,reloadDuration:duration,reloadUntil:start+duration,inventory:{pistol:{id:'p9',ammo:2}}};
  audio.game={actors:[actor],state:{round:1,paused:false}};audio.context={state:'running'};
  audio.kitReady=true;audio.volume=1;audio.updateListener=()=>{};audio.updateAmbient=()=>{};
  audio.floorAudio.update=()=>{};audio.reloadFoley.update=()=>{};
  const heard=[];audio.kitSample=(id,e,gain,variant,rate)=>{assert(Math.abs(rate-4/3)<1e-7);heard.push(id);};
  const frame=p=>audio.handle([],actor,start+p*duration);
  frame(.60);assert.deepEqual(heard,[]);
  frame(.65);assert.deepEqual(heard,['in']);
  audio.play({type:'reload',actorId:actor.id,weapon:actor.weapon,time:start,duration});
  frame(.66);assert.deepEqual(heard,['in']);
  frame(1);assert.deepEqual(heard,['in']);
});

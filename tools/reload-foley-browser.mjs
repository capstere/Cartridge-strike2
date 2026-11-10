// Start Floor 5 through the lobby, then use the existing test clock and real
// game controls. Observe decoded buffers submitted to the Web Audio graph.
import assert from 'node:assert/strict';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({channel:'chromium'});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/fps/?test&seed=42',{waitUntil:'domcontentloaded'});
  await page.locator('#lb-mode-seg [data-value=endless]').click();
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.__fps?.game.player && document.querySelector('#cs-loading').hidden,null,{timeout:120000});
  if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
  await page.evaluate(async()=>{
    const f=__fps,a=f.audio;f.stopFrameLoop();await a.unlock();
    if(a.errors.length)throw Error(a.errors.join('\n'));
    const labels=new Map();
    for(const [k,v] of a.kitBuffers)labels.set(v,k);
    for(const [k,v] of a.recordedFoley)labels.set(v,k);
    for(const [k,v] of a.reloadFoley.buffers)labels.set(v,k);
    if(a.reloadFoley.buffers.size!==12)throw Error('Incomplete recordings');
    const log=window.reloadLog=[];
    const channel=a.channel.bind(a),track=a.track.bind(a);
    a.channel=(event,...args)=>Object.assign(channel(event,...args),{event});
    a.track=(source,ch,...args)=>{
      if(ch.event.type==='reload')log.push({take:labels.get(source.buffer)||'unexpected',actor:ch.event.actorId,
        time:f.game.state.time,rate:source.playbackRate?.value,panned:ch.nodes.some(n=>n instanceof PannerNode)});
      return track(source,ch,...args);
    };
  });
  await page.exposeFunction('resumeReloadMatch',()=>page.locator('#resume').click());
  const cases={
    ar47:['magout_rifle-2','magin_rifle-2'],cr4:['magout_rifle-2','magin_rifle-1'],
    smg:['magout_smg','magin_smg'],shotgun:['shell-1','shell-2','shell-1','shell-3'],
    sniper:['magout_rifle-1','magin_rifle-1'],bazooka:['pickup-2','stow-2'],
    p9:['p9:release:0','p9:out:0','p9:in:0'],p12:['p9:release:0','p9:out:0','p9:in:0']
  };
  for(const [weapon,sequence] of Object.entries(cases)){
    const pistol=weapon==='p9'||weapon==='p12';
    for(const role of ['player','empty',...(pistol?[]:['bot','repeat','switch','death','pause','restart'])]){
      if(weapon==='bazooka' && role==='player')continue; // single-shot magazine
      const report=await page.evaluate(async({weapon,role})=>{
        const f=__fps,team=['cr4','p12'].includes(weapon)?'counterAnalysts':'analysts';
        f.start(team,{mode:'endless',botFire:false,loadout:weapon});
        const g=f.game,p=g.player,a=f.audio;
        const advance=()=>f.step({},1/30);
        const audioFrame=()=>new Promise(resolve=>setTimeout(resolve,1000/30));
        advance();
        const actor=role==='bot'?g.actors.find(o=>o.team===team && !o.isPlayer):p;
        if(actor.weapon!==weapon && !g.select(weapon,actor)){
          if(!g.buy(weapon,actor).ok || !g.select(weapon,actor))throw Error('Equip '+weapon);
        }
        const item=g.item(actor),full=item.ammo;
        item.ammo=role==='empty'||role==='repeat'||role==='bot'||weapon==='bazooka'?0:full-1;
        window.reloadLog.length=0;
        if(role==='bot')advance(); // BotController requests its own reload
        else window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR'}));
        if(!actor.reloadUntil)throw Error('Reload did not start for '+weapon+' '+role);
        const until=actor.reloadUntil;
        let interrupted=false,cut=0;
        while(g.state.time<until+.08){
          if(g.state.paused)throw Error('Unexpected pause during '+role);
          advance();
          const rows=reloadLog.filter(e=>e.actor===actor.id);
          if(!interrupted && rows.length){
            cut=rows.length;interrupted=true;
            if(role==='switch')g.select('knife',actor);
            if(role==='death'){
              actor.spawnProtectedUntil=0;
              if(!g.damage(actor,1000,null) || actor.alive)throw Error('Death fixture');
            }
            if(role==='pause'){
              window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));
              if(!g.state.paused || a.reloadFoley.voices.size)throw Error('Pause retained audio');
              const frozen=g.state.time;advance();
              if(g.state.time!==frozen)throw Error('Pause advanced game');
              await window.resumeReloadMatch();
            }
            if(role==='restart'){
              f.start(team,{mode:'endless',botFire:false});
              for(let i=0;i<90;i++)advance();
              break;
            }
          }
          await audioFrame();
        }
        if(role==='repeat'){
          if(item.ammo!==full)throw Error('First refill failed');
          item.ammo=0;
          if(!g.reload(actor))throw Error('Second reload failed');
          const end=actor.reloadUntil;
          while(g.state.time<end+.08){advance();await audioFrame();}
        }
        return {rows:reloadLog.filter(e=>e.actor===actor.id),full,ammo:item.ammo,cut,
          playing:a.reloadFoley.voices.has(actor)};
      },{weapon,role});
      let want=[...sequence];
      if(['empty','bot','repeat'].includes(role)){
        if(weapon==='cr4')want.push('charge_rifle-2');
        if(pistol)want.push('p9:action:0');
      }
      if(role==='repeat')want=want.concat(want);
      if(['switch','death','restart'].includes(role))want=want.slice(0,1);
      assert.deepEqual(report.rows.map(x=>x.take),want,weapon+' '+role);
      assert.ok(report.rows.every(x=>x.rate===1 && x.panned===(role==='bot')),weapon+' channel');
      assert.equal(report.playing,false);
      if(!['switch','death','restart'].includes(role))assert.equal(report.ammo,report.full);
      console.log(weapon,role,'PASS');
    }
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}

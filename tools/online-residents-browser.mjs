import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
import {POSES} from '../src/fps/zombie-poses.mjs';
import {resumeDesktop} from './network-browser-resume.mjs';

const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],bad=[],pages=[];
async function launch(mobile){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  browsers.push(browser);
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:820,height:480},deviceScaleFactor:.5,isMobile:mobile,hasTouch:mobile});
  pages.push(page);
  page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
  page.setDefaultTimeout(85000);
  page.on('pageerror',e=>bad.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.05,autoReload:false}));
    performance.setResourceTimingBufferSize(2048);
    const live=new Set(),audit=window.residentMusic={live,peak:0,starts:0};
    const {start,stop}=AudioBufferSourceNode.prototype;
    AudioBufferSourceNode.prototype.start=function(...args){
      start.apply(this,args);
      if(this.loop&&this.buffer===window.__fps?.audio.floorAudio.buffers.get('danceman')){
        live.add(this);audit.starts++;audit.peak=Math.max(audit.peak,live.size);
        this.addEventListener('ended',()=>live.delete(this),{once:true});
      }
    };
    AudioBufferSourceNode.prototype.stop=function(...args){stop.apply(this,args);live.delete(this);};
  });
  await page.goto(local.url+'/fps/?network=local&test&realtime',{waitUntil:'domcontentloaded'});
  await page.locator('#network-code').fill('residents-five');
  assert(await page.locator('#fatal').isHidden());
  return page;
}
async function until(check,label){
  const deadline=performance.now()+25000;
  while(!await check()){assert(performance.now()<deadline,label);await delay(50);}
}
const presented=page=>page.evaluate(()=>{
  const {game,network,renderer}=__fps,r=renderer.zombieVisuals,auth=network.room.state;
  const v=r?.instances.get('danceman');
  return {lives:[...auth.residents.values()].map(({id,lifeId,alive})=>({id,lifeId,alive})),
    presented:[...game.state.zombies].map(({id,lifeId,alive})=>({id,lifeId,alive})),
    actors:auth.actors.size,assets:r?.sources.size,roots:r?.instances.size,
    sceneRoots:renderer.scene.children.filter(o=>['Danceman','The Hollow Walker','Tattered Wanderer'].includes(o.name)).length,
    dance:v?.current?.getClip().name,clip:auth.residents.get('danceman')?.clip,visible:v?.root.visible,uuid:v?.root.uuid,
    loopLife:__fps.audio.floorAudio.music?.lifeId,playing:residentMusic.live.size,peak:residentMusic.peak,starts:residentMusic.starts};
});
async function checkBoth(peers,{dead=false}={}){
  const ready=state=>state.lives.length===6&&state.actors===10&&state.assets===3&&state.visible&&
    state.roots===6&&state.sceneRoots===6&&state.peak===1&&state.playing===(dead?0:1)&&
    state.lives.find(o=>o.id==='danceman').alive!==dead&&state.dance===state.clip&&
    (dead?state.dance==='Dead':state.loopLife===state.lives.find(o=>o.id==='danceman').lifeId&&/All_Night_Dance|Jazz_Hands|Flirty_Strut_inplace|Groovy_Walk/.test(state.dance));
  for(const page of peers)await until(async()=>ready(await presented(page)),dead?'both render Dead and stop the loop':'both render the new dance and play one loop');
  const states=await Promise.all(peers.map(presented));
  for(const state of states)assert.deepEqual(state.lives,state.presented);
  assert.deepEqual(states[0].lives,states[1].lives);
  return states;
}
function checkNewLife(before,after){
  for(const [i,state] of after.entries()){
    assert.equal(state.uuid,before[i].uuid,'the same scene instance is reused');
    assert(state.starts>before[i].starts,'music starts for the new life');
    assert(state.lives.every(z=>z.alive&&z.lifeId>before[i].lives.find(old=>old.id===z.id).lifeId));
  }
}
async function openRoom(desktop,mobile,mode){
  for(const [page,team] of [[desktop,'analysts'],[mobile,'counterAnalysts']]){
    await page.locator('#network-code').fill('residents-five');
    await page.locator('#network-team').selectOption(team);
  }
  await desktop.locator('#network-mode').selectOption(mode);
  await desktop.locator('[data-create=true]').click();
  await desktop.locator('#room-start').waitFor();
  const room=[...local.rooms].find(r=>r.state.mode===mode);
  room.sim.game.config.botFire=false;
  await desktop.locator('#room-zombies').selectOption('on');
  // Each lobby action submits both values. Wait until the first setting was
  // adopted before changing the second, as the room UI renders server state.
  await desktop.waitForFunction(()=>__fps.network.room.state.zombiesEnabled);
  await desktop.locator('#room-danceman').selectOption('on');
  await desktop.waitForFunction(()=>__fps.network.room.state.zombiesEnabled&&__fps.network.room.state.dancemanEnabled);
  await mobile.locator('#network-room').fill(room.roomId);
  await mobile.locator('[data-create=false]').tap();
  await mobile.locator('#room-ready').waitFor();
  return room;
}
async function start(desktop,mobile,room){
  await mobile.locator('#room-ready').tap();
  await desktop.locator('#room-ready').click();
  await desktop.locator('#room-start').click();
  await until(()=>room.state.phase==='active'&&room.state.residents.size===6,'started with six residents');
}
async function approachFixture(desktop,mobile,room){
  const game=room.sim.game,dancer=game.state.zombies.find(z=>z.id==='danceman');
  for(const [page,team,dz,yaw] of [[desktop,'analysts',2.2,0],[mobile,'counterAnalysts',-1,Math.PI]]){
    await page.waitForFunction(()=>__fps.network.room.state.phase==='active'&&__fps.modal!== 'online');
    if(await page.locator('#pause').isHidden())await page.keyboard.press('Escape');
    await page.locator('#resume').waitFor();
    const spot={x:dancer.x,z:dancer.z+dz,y:0,yaw,pitch:-.22};
    assert(game.world.canOccupy(spot.x,spot.z,.22,1.7));
    const actor=[...room.seats.values()].find(s=>s.actor.team===team).actor;
    Object.assign(actor,spot,{spawnProtectedUntil:0});
    await until(()=>page.evaluate(z=>Math.abs(__fps.game.player.z-z)<.05,spot.z),'confirmed C08 position');
  }
  await mobile.locator('#resume').tap();
  await resumeDesktop(desktop);
  // Resume can retain the Classic spawn heading across a reconcile. Use
  // the normal keyboard look control to face C08 after the new life.
  const heading=()=>desktop.evaluate(()=>{
    const yaw=__fps.game.player.yaw;
    return Math.atan2(Math.sin(yaw),Math.cos(yaw));
  });
  const angle=await heading();
  if(Math.abs(angle)>.12){
    const key=angle>0?'ArrowRight':'ArrowLeft';
    await desktop.keyboard.down(key);
    try{await until(async()=>Math.abs(await heading())<.16,'player turns to face C08');}
    finally{await desktop.keyboard.up(key);}
  }
  return dancer;
}
try{
  const desktop=await launch(false),mobile=await launch(true),peers=[desktop,mobile];
  console.log('Two lobby renderers ready');
  const room=await openRoom(desktop,mobile,'tdm'),game=room.sim.game;
  await start(desktop,mobile,room);
  const dancer=await approachFixture(desktop,mobile,room);
  await checkBoth(peers);
  const frameCosts=await desktop.evaluate(()=>{
    const {game,renderer}=__fps, residents=game.state.zombies,time=game.state.time;
    const gl=renderer.renderer.getContext(),visible=game.player;
    function sample(population){
      game.state.zombies=population;
      const times=[];
      for(let i=0;i<12;i++){
        game.state.time=time+i/60;
        const start=performance.now();
        renderer.render(game,visible,1/60);
        gl.finish();
        if(i>=3)times.push(performance.now()-start);
      }
      return times.sort((a,b)=>a-b);
    }
    try{
      const on=sample(residents),off=sample([]);
      return {on,off,assets:performance.getEntriesByType('resource').filter(r=>/\/(zombies|Danceman)\/.*\.glb\.gz$/.test(r.name))
        .map(r=>({asset:r.name.split('/').at(-1),bytes:r.encodedBodySize,ms:Math.round(r.duration)}))};
    }finally{game.state.zombies=residents;game.state.time=time;}
  });
  console.log('Resident client benchmark',JSON.stringify(frameCosts));
  const phase=await desktop.evaluate(()=>__fps.renderer.zombieVisuals.instances.get('danceman').current.time);
  await until(()=>desktop.evaluate(t=>Math.abs(__fps.renderer.zombieVisuals.instances.get('danceman').current.time-t)>.05,phase),'dance mixer advances');
  await desktop.mouse.down({button:'left'});
  try{await until(()=>!dancer.alive,'real mouse fire killed resident');}finally{await desktop.mouse.up({button:'left'});}
  const dead=await checkBoth(peers,{dead:true});
  const observer=[...room.seats.values()].find(s=>s.actor.team==='counterAnalysts');
  const beforeReconnect=observer.epoch;
  observer.client.ref.terminate();
  await until(()=>mobile.evaluate(epoch=>__fps.network?.connectionState==='connected'&&__fps.network.controlEpoch>epoch,beforeReconnect),'observer reconnects under the same seat');
  await mobile.locator('#resume').tap();
  const reconnected=await checkBoth(peers,{dead:true});
  assert.deepEqual(reconnected.map(s=>[s.lives,s.uuid,s.starts]),dead.map(s=>[s.lives,s.uuid,s.starts]));
  const walker=game.state.zombies.find(z=>z.model==='hollow'&&z.alive);
  assert(walker,'living Hollow Walker');
  Object.assign(walker,{x:dancer.x,y:0,z:dancer.z,goal:null,path:[],nextSense:game.state.time+.7});
  for(const p of [desktop,mobile])await p.waitForFunction(({id,clips})=>{
    const v=__fps.renderer.zombieVisuals.instances.get(id);
    return v?.root.visible&&clips.includes(v.current?.getClip().name);
  },{id:walker.id,clips:Object.values(POSES.hollow)});
  assert.equal(game.state.score.analysts+game.state.score.counterAnalysts,0);
  const firstMatch=room.state.matchId;
  room.match.deadline=room.clock.elapsedTime;
  await desktop.locator('#room-rematch').click();
  await until(()=>room.state.phase==='waiting'&&room.state.matchId>firstMatch,'same-room rematch');
  await start(desktop,mobile,room);
  await approachFixture(desktop,mobile,room);
  checkNewLife(dead,await checkBoth(peers));
  console.log('PASS TDM death, reconnect and same-room rematch recreate life and reuse the scene roots');
  for(const page of peers){
    await page.keyboard.press('Escape');
    await page.locator('#restart').click();
    await page.locator('#network-code').waitFor();
  }

  const classic=await openRoom(desktop,mobile,'classic'),classicGame=classic.sim.game;
  Object.assign(classicGame.config,{buyTime:.5,resultTime:.65});
  await start(desktop,mobile,classic);
  await approachFixture(desktop,mobile,classic);
  const round1=await checkBoth(peers);
  const round=classic.state.round;
  classicGame.config.buyTime=2;
  classicGame.state.deadline=classicGame.state.time;
  await until(()=>classic.state.round>round,'Classic progresses to the next round');
  await approachFixture(desktop,mobile,classic);
  await until(()=>classic.state.roundPhase==='active','next Classic round plays');
  checkNewLife(round1,await checkBoth(peers));
  console.log('PASS Classic round change recreates six residents, restores the original dance and one loop per client');
  assert.deepEqual(bad,[]);
}catch(error){
  for(const p of pages)console.error(await p.evaluate(()=>{
    const f=window.__fps,n=f?.network,z=f?.game?.state.zombies.find(z=>z.id==='danceman');
    return {fatal:document.querySelector('#fatal pre')?.textContent,modal:f?.modal,phase:f?.game.phase,
      controls:n?.enabled,player:f?.game.player&&[f.game.player.x,f.game.player.z,f.game.player.yaw,f.game.player.pitch],
      resident:z&&[z.x,z.z,z.clip],visible:f?.renderer.zombieVisuals?.instances.get('danceman')?.root.visible,
      models:[...f?.renderer.zombieVisuals?.sources.keys()||[]],sound:!!f?.audio.floorAudio.music,audio:f?.audio.context?.state,
      volume:f?.audio.volume,buffers:[...f?.audio.floorAudio.buffers.keys()||[]],errors:f?.audio.errors};
  }).catch(()=>null));
  throw error;
}finally{for(const b of browsers)await b.close();await local.close();}

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
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.05,autoReload:false})));
  await page.goto(local.url+'/fps/?network=local&test&realtime',{waitUntil:'domcontentloaded'});
  await page.locator('#network-code').fill('residents-five');
  assert(await page.locator('#fatal').isHidden());
  return page;
}
async function until(check,label){
  const deadline=performance.now()+25000;
  while(!await check()){assert(performance.now()<deadline,label);await delay(50);}
}
try{
  const desktop=await launch(false),mobile=await launch(true);
  console.log('Two lobby renderers ready');
  await desktop.locator('[data-create=true]').click();
  await desktop.locator('#room-start').waitFor();
  const room=[...local.rooms][0],game=room.sim.game;
  game.config.botFire=false;
  await desktop.locator('#room-zombies').selectOption('on');
  await desktop.locator('#room-danceman').selectOption('on');
  await mobile.locator('#network-room').fill(room.roomId);await mobile.locator('[data-create=false]').tap();
  await mobile.locator('#room-ready').tap();await desktop.locator('#room-ready').click();
  const spawn=game.state.actors.filter(a=>a.controllerType==='human');
  await desktop.locator('#room-start').click();
  await until(()=>room.state.phase==='active'&&game.state.zombies.length===6,'started with six residents');
  for(const p of [desktop,mobile]){
    await p.waitForFunction(()=>__fps.network.room.state.phase==='active'&&__fps.modal===null);
    await p.keyboard.press('Escape');
    await p.locator('#resume').waitFor();
  }
  const dancer=game.state.zombies.find(z=>z.id==='danceman');
  const spot={x:dancer.x,z:dancer.z+2.2,y:0,yaw:0,pitch:-.22};
  assert(game.world.canOccupy(spot.x,spot.z,.22,1.7));
  Object.assign(spawn[0],spot,{spawnProtectedUntil:0});
  // Place the touch player on the opposite side so its existing spawn yaw
  // already faces the model, including the first input sent after Resume.
  const mobileSpot={x:dancer.x,z:dancer.z-1,y:0,yaw:Math.PI,pitch:-.24};
  assert(game.world.canOccupy(mobileSpot.x,mobileSpot.z,.22,1.7));
  Object.assign(spawn[1],mobileSpot,{spawnProtectedUntil:0});
  for(const [page,at] of [[desktop,spot],[mobile,mobileSpot]])await until(()=>page.evaluate(z=>
    Math.abs(__fps.game.player.z-z)<.05,at.z),'placed inside C08 before taking controls');
  await mobile.locator('#resume').tap();await resumeDesktop(desktop);
  const presented=p=>p.evaluate(()=>{
    const g=__fps.game,r=__fps.renderer.zombieVisuals;
    return {lives:g.state.zombies.map(z=>[z.id,z.lifeId]),all:__fps.network.room.state.actors.size,
      assets:r?.sources.size,dance:r?.instances.get('danceman')?.current?.getClip().name,
      visible:r?.instances.get('danceman')?.root.visible,music:!!__fps.audio.floorAudio.music};
  });
  for(const p of [desktop,mobile])await until(async()=>{
    const state=await presented(p);return state.all===10&&state.assets===3&&state.visible&&state.dance&&state.music;
  },'both clients display the original dancer and hear one positional loop');
  const first=await presented(desktop),other=await presented(mobile);
  assert.deepEqual(first.lives,other.lives);
  assert.match(first.dance,/All_Night_Dance|Jazz_Hands|Flirty_Strut_inplace|Groovy_Walk/);
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
  for(const p of [desktop,mobile])await until(()=>p.evaluate(()=>!__fps.network.room.state.residents.get('danceman').alive&&
    __fps.renderer.zombieVisuals.instances.get('danceman')?.current?.getClip().name==='Dead'&&!__fps.audio.floorAudio.music),'both display death and stop the loop');
  const walker=game.state.zombies.find(z=>z.model==='hollow'&&z.alive);
  assert(walker,'living Hollow Walker');
  Object.assign(walker,{x:dancer.x,y:0,z:dancer.z,goal:null,path:[],nextSense:game.state.time+.7});
  for(const p of [desktop,mobile])await p.waitForFunction(({id,clips})=>{
    const v=__fps.renderer.zombieVisuals.instances.get(id);
    return v?.root.visible&&clips.includes(v.current?.getClip().name);
  },{id:walker.id,clips:Object.values(POSES.hollow)});
  assert.equal(game.state.score.analysts+game.state.score.counterAnalysts,0);
  console.log('PASS full population, ten team slots, shared original models, dance mixer, one spatial loop and replicated mouse-driven death');
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

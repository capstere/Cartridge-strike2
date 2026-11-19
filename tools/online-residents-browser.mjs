import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
import {resumeDesktop} from './network-browser-resume.mjs';

const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],bad=[];
async function launch(mobile){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  browsers.push(browser);
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:820,height:480},deviceScaleFactor:.5,isMobile:mobile,hasTouch:mobile});
  page.setDefaultTimeout(45000);
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
  Object.assign(spawn[1],spot,{x:spot.x+.65,spawnProtectedUntil:0});
  await delay(180);
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
  const phase=await desktop.evaluate(()=>__fps.renderer.zombieVisuals.instances.get('danceman').current.time);
  await until(()=>desktop.evaluate(t=>Math.abs(__fps.renderer.zombieVisuals.instances.get('danceman').current.time-t)>.05,phase),'dance mixer advances');
  await desktop.mouse.down({button:'left'});
  try{await until(()=>!dancer.alive,'real mouse fire killed resident');}finally{await desktop.mouse.up({button:'left'});}
  for(const p of [desktop,mobile])await until(()=>p.evaluate(()=>!__fps.network.room.state.residents.get('danceman').alive&&
    __fps.renderer.zombieVisuals.instances.get('danceman')?.current?.getClip().name==='Dead'&&!__fps.audio.floorAudio.music),'both display death and stop the loop');
  assert.equal(game.state.score.analysts+game.state.score.counterAnalysts,0);
  console.log('PASS full population, ten team slots, shared original models, dance mixer, one spatial loop and replicated mouse-driven death');
  assert.deepEqual(bad,[]);
}finally{for(const b of browsers)await b.close();await local.close();}

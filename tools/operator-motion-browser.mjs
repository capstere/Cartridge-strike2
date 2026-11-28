// Native visual fixture: play the real Solo simulation through its movement
// controller and capture the operator using the existing world/spectator renderer.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const output=process.env.CS3_WARDROBE_EVIDENCE;
const origin=process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const native=process.env.CHROMIUM_PATH;
const browser=await chromium.launch({
  headless:process.env.FPS_NETWORK_HEADED!=='1',executablePath:native,
  channel:native?undefined:'chromium',
  args:native?['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']:['--enable-unsafe-swiftshader']
});
try {
  const page=await browser.newPage({viewport:{width:900,height:600},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(90000);
  await page.addInitScript(()=>{
    localStorage.setItem('cartridge-operator-outfit','shotgun');
    localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'low',volume:0,
      wanderers:false,firefight:false,mobileAutoFire:false,loadout:'cr4'}));
  });
  await page.goto(origin+'/fps/?test=1',{waitUntil:'domcontentloaded'});
  await page.locator('[data-go=play]:visible').click();
  await page.locator('[data-go=solo]:visible').click();
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.__fps?.game?.player && window.__fps.renderer.weaponModel);
  const result=await page.evaluate(()=>{
    const fps=window.__fps,{game,renderer,world}=fps,actor=game.player;
    fps.stopFrameLoop();
    game.pause(false);
    game.warmupRemaining=0;
    game.state.phase='active';
    for(const other of game.actors) if (other!==actor) other.bot=null;
    game.state.zombies=[];game.state.wanderers=[];
    const model=renderer.actorModel(actor),avatar=model.userData.avatar;
    const near=avatar.root.getObjectByName('operator-kit-shotgun-near');
    let draws=0;
    const original=near.onBeforeRender;
    near.onBeforeRender=function(...args){draws++;return original.apply(this,args);};
    const observer=game.actors.find(a=>a!==actor);
    const candidates=[{x:36.9236,z:14.27635},actor];
    for (const room of [...(world.data.rooms||[]),...(world.data.corridors||[])]) {
      if(!room.polygon?.length) continue;
      const mid=room.polygon.reduce((p,v)=>({x:p.x+v[0],z:p.z+v[1]}),{x:0,z:0});
      candidates.push({x:mid.x/room.polygon.length,z:mid.z/room.polygon.length});
    }
    const walkable=(x,z)=>world.canOccupy(x,z,actor.radius,actor.height,0);
    const spot=candidates.find(p=>[0,.7,1.4,2.1].every(r=>[[r,0],[-r,0],[0,r],[0,-r]].every(([x,z])=>walkable(p.x+x,p.z+z))));
    if (!spot) throw Error('No four-way walkable animation lane');
    const origin={x:spot.x,z:spot.z}, frames=[],tile=250;
    const sheet=document.createElement('canvas');
    sheet.width=4*tile;sheet.height=4*(tile+23);
    const ctx=sheet.getContext('2d');
    ctx.fillStyle='#12191f';ctx.fillRect(0,0,sheet.width,sheet.height);
    const camera={...observer,alive:false,y:0,height:1.55};
    const shots=[[1,0,'Forward'],[0,1,'Right'],[-1,0,'Backward'],[0,-1,'Left']];
    try {
      for(const [row,[forward,strafe,label]] of shots.entries()) {
        Object.assign(actor,{...origin,y:0,vy:0,onGround:true,yaw:0});
        // Each direction uses the same map coordinates. Force presentation to
        // observe this fixture teleport before sampling the next gait.
        avatar.time=-1;
        const visibleFrom=angle=>[0,.8,1.6].every(travel=>{
          const x=origin.x+strafe*travel,z=origin.z-forward*travel;
          const cx=x+2.1*Math.sin(angle),cz=z+2.1*Math.cos(angle);
          return walkable(cx,cz)&&world.segmentClear({x:cx,y:1.43,z:cz},{x,y:1,z},{vision:false});
        });
        const angle=Array.from({length:24},(_,i)=>Math.PI*.79+i*Math.PI/12).find(visibleFrom);
        if(angle===undefined) throw Error('No clear observer sightline for '+label);
        for(let i=0;i<24;i++) {
          game.update(1/30,{forward,strafe,sneak:true,yaw:0,pitch:0});
          camera.x=actor.x+2.1*Math.sin(angle);camera.z=actor.z+2.1*Math.cos(angle);
          camera.yaw=angle;camera.pitch=-.24;
          const before=draws;
          renderer.render(game,camera,1/30);
          if(![5,11,17,23].includes(i)) continue;
          if(draws===before) throw Error('Equipped operator was absent from '+label+' frame '+i);
          const canvas=renderer.renderer.domElement,size=Math.min(canvas.height,canvas.width);
          const col=Math.floor(i/6),x=col*tile,y=row*(tile+23);
          ctx.drawImage(canvas,(canvas.width-size)/2,(canvas.height-size)/2,size,size,x,y,tile,tile);
          ctx.fillStyle='white';ctx.font='15px sans-serif';
          ctx.fillText(label+' · '+((i+1)/30).toFixed(2)+' s',x+7,y+17+tile);
          frames.push({direction:label,step:i+1,time:game.state.time,actor:[actor.x,actor.z],
            clip:avatar.activeBase,forward:avatar.directional.forward,right:avatar.directional.right});
        }
        if(Math.hypot(actor.x-origin.x,actor.z-origin.z)<.45) throw Error(label+' movement blocked');
      }
      const gl=renderer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
      return {gpu:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),draws,frames,sheet:sheet.toDataURL('image/png')};
    } finally {near.onBeforeRender=original;}
  });
  assert.equal(result.frames.length,16);
  const ends=result.frames.filter(f=>f.step===24);
  assert(ends[0].forward>.9 && ends[1].right>.9 && ends[2].forward<-.9 && ends[3].right<-.9);
  assert.deepEqual(errors,[]);
  const {sheet,...evidence}=result;
  if(output) {
    await mkdir(output,{recursive:true});
    await writeFile(join(output,'operator-directions.png'),Buffer.from(sheet.split(',')[1],'base64'));
    await writeFile(join(output,'operator-directions.json'),JSON.stringify(evidence,null,2)+'\n');
  }
  console.log(JSON.stringify({gpu:evidence.gpu,draws:evidence.draws,finalPoses:ends}));
} finally {await browser.close();}

// Exercise the normal Floor 5 lobby and match. The existing inspection hook lets
// the test place an observer and shorten the buy timer for reproducible encounters.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const captures=process.env.FPS_CAPTURE_DIR;
if(captures)await mkdir(captures,{recursive:true});
const browser=await chromium.launch({channel:'chromium',args:['--use-angle=metal']});
try{
 for(const mobile of [false,true]){
  const mode=mobile?'endless':'classic',page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error' && !/net::|favicon|status of 404/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(mobile=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:mobile?'low':'standard'})),mobile);
  await page.goto(origin+'/fps/?test&seed=42',{waitUntil:'domcontentloaded'});
  await page.locator('#lb-mode-seg [data-value='+mode+']').click();await page.locator('#start').click();
  await page.waitForFunction(()=>window.__fps?.game.player && !document.querySelector('#hud').hidden && document.querySelector('#cs-loading').hidden,null,{timeout:120000});
  const start=await page.evaluate(()=>{
   const f=__fps,g=f.game;f.stopFrameLoop();g.state.buyDeadline=g.state.time;g.step(1/60);
   return {mode:g.state.mode,teams:g.actors.map(a=>a.team),zombies:g.state.zombies.map(z=>[z.model,z.behavior]),counts:[...f.renderer.zombieVisuals.sources.values()].map(s=>s.clips.size)};
  });
  assert.equal(start.mode,mode);assert.equal(start.teams.filter(t=>t==='analysts').length,5);assert.equal(start.teams.filter(t=>t==='counterAnalysts').length,5);
  assert.deepEqual(start.counts,[16,16]);assert.equal(start.zombies.length,mobile?3:5);
  for(const [i,name] of [[0,'lounge'],[1,'office']]){
   const view=await page.evaluate(i=>{
    const f=__fps,g=f.game,z=g.state.zombies[i],p=g.player,h=i?1.02:.3,center=z.seat||z;
    // Prefer the front of the chair and a three-quarter view of the floor pose.
    let best=null;
    for(const radius of [2.0,2.5,1.7,3.2,1.4]){
     for(const offset of [.55,-.55,0,1.1,-1.1,1.6,-1.6,2.3,-2.3,3.14]){
      const a=z.yaw+offset,x=center.x-Math.sin(a)*radius,zz=center.z-Math.cos(a)*radius;
      if(!g.world.canOccupy(x,zz,p.radius,1.7)||!g.world.segmentClear({x,y:1.56,z:zz},{x:center.x,y:h,z:center.z},{vision:false}))continue;
      best={x,z:zz};break;
     }if(best)break;
    }
    if(!best)throw Error('No unobstructed camera position for '+z.name);
    Object.assign(p,best,{y:0,yaw:Math.atan2(best.x-center.x,best.z-center.z),pitch:Math.atan2(h-1.58,Math.hypot(best.x-center.x,best.z-center.z))});
    f.render();const v=f.renderer.zombieVisuals.instances.get(z.id),mesh=v.root.getObjectByProperty('isSkinnedMesh',true);
    return {clip:v.current?.getClip().name,bones:mesh.skeleton.bones.length,drawn:mesh.skeleton.boneTexture!=null,visible:v.root.visible,distance:Math.hypot(p.x-center.x,p.z-center.z)};
   },i);
   assert.equal(view.clip,i?'Chair_Sit_Idle_M':'Toss_and_Turn');assert.ok(view.drawn&&view.visible,JSON.stringify(view));
   if(captures)await page.screenshot({path:captures+'/'+mode+'-'+name+'.png'});
  }
  const actions=await page.evaluate(()=>{
   const f=__fps,g=f.game,walk=g.state.zombies[0],seat=g.state.zombies[1],p=g.player;
   const step=n=>{for(let i=0;i<n;i++)g.step(1/60);f.render();};const away=z=>{const c=z.seat||z; p.yaw=Math.atan2(c.x-p.x,c.z-p.z);p.pitch=.65;p.nextShot=0;g.fire(p);};
   const tracks=[];away(seat);step(25);tracks.push(seat.clip);step(150);
   const at={x:walk.x,y:0,z:walk.z-.95};Object.assign(p,at);away(walk);step(24);tracks.push(walk.clip);step(115);
   // Shoot the standing Hollow Walker with the match pistol along the normal ray.
   const aim=(z,y)=>{p.yaw=Math.atan2(p.x-z.x,p.z-z.z);p.pitch=Math.atan2(y-(p.y+p.height-.12),Math.hypot(z.x-p.x,z.z-p.z));};
   g.select('pistol',p);aim(walk,1.03);p.nextShot=0;const hp=walk.hp,shot=g.fire(p);for(const hit of g.pendingDamage.splice(0))g.damage(hit.target,hit.amount,hit.source,hit.kind,hit);
   const damaged=walk.hp<hp;step(38);g.damage(walk,38,p,'shotgun');tracks.push(walk.clip);step(240);tracks.push(walk.clip);step(135);
   const score=JSON.stringify(g.state.score),kills=p.kills;g.damage(walk,1000,p,'p9');const end={alive:walk.alive,clip:walk.clip,scoreSame:score===JSON.stringify(g.state.score),killsSame:kills===p.kills};
   const pos=[walk.x,walk.z];step(110);end.still=pos[0]===walk.x&&pos[1]===walk.z;
   return {tracks,shot,damaged,end,bots:g.actors.filter(a=>a.bot).length};
  });
  assert.deepEqual(actions.tracks.slice(0,2),['Sit_to_standTransition_Female_2','Stand_Up4']);assert.deepEqual(actions.tracks.slice(2),['Knock_Down_1','Stand_Up4']);assert.ok(actions.shot&&actions.damaged,JSON.stringify(actions));assert.equal(actions.bots,9);assert.ok(!actions.end.alive&&actions.end.scoreSame&&actions.end.killsSame&&actions.end.still);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mode,start,actions}));await page.close();
 }
}finally{await browser.close();}

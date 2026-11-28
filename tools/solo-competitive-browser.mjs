import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const out=new URL('../test-results/solo-competitive/',import.meta.url),file=n=>new URL(n,out),path=n=>file(n).pathname;
await mkdir(out,{recursive:true});
const report={runtime:execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../',import.meta.url),encoding:'utf8'}).trim(),driverHash:createHash('sha256').update(await readFile(import.meta.filename)).digest('hex'),build:CONTRACT.buildHash,scenarios:[],errors:[],fixture:'Unmodified game. Standard root, real desktop clicks, held keys, ordinary 5 second deployment. Read-only observation of Game.start/update and WebGL draws. Fresh guest profile, low graphics, volume zero.'};
const server=await createLocalServer({port:0});const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:false,args:['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:1060,height:650},deviceScaleFactor:1,locale:'sv-SE'}),p=await ctx.newPage();
p.on('pageerror',e=>report.errors.push(String(e)));p.setDefaultTimeout(80000);
const shot=n=>p.screenshot({path:path(n+'.jpg'),type:'jpeg',quality:81,timeout:30000});
try{
 await ctx.addInitScript(()=>{if(!localStorage.getItem('cartridge-settings'))localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0}));});
 await p.goto(server.url+'/');await p.locator('#home-title').waitFor();
 await p.locator('[data-go=play]:visible').first().click();await p.locator('[data-go=solo]:visible').first().click();
 await p.locator('#setup-title').waitFor();
 assert.equal(await p.locator('html').getAttribute('lang'),'en');assert.equal(await p.evaluate(()=>typeof window.__fps),'undefined');
 report.map=await p.locator('.map-tile [data-map-name]').textContent();report.browser=browser.version();
 await p.evaluate(async()=>{
  const {Game}=await import('/src/fps/game.mjs'),{Mesh,Matrix4}=await import('/vendor/three/three.module.js');
  const records=window.soloTrials=[],objects=new WeakSet(),start=Game.prototype.start,update=Game.prototype.update;
  let current;
  const actor=a=>({x:a.x,y:a.y,z:a.z,alive:a.alive,life:a.lifeId,health:a.hp,k:a.kills,d:a.deaths});
  Game.prototype.start=function(...args){
   const result=start.apply(this,args),a=this.player,id=records.length+1;
   current={id,mode:this.state.mode,phase:this.state.phase,initial:actor(a),newGame:!objects.has(this),newActor:!objects.has(a),
    scores:{...this.state.score},actorCount:this.actors.length,actorsAlive:this.actors.filter(a=>a.alive).length,
    zones:this.state.zones.map(z=>({...z})),batches:{},draws:0,inputs:[]};
   objects.add(this);objects.add(a);records.push(current);return result;
  };
  Game.prototype.update=function(dt,controls){
   const r=update.call(this,dt,controls);
   if(current&&this.player){
    current.at=this.state.time;current.warmup=this.warmupRemaining;current.actor=actor(this.player);
    current.legal=this.world.canOccupy(this.player.x,this.player.z,this.player.radius,this.player.height,this.player.y);
    if((controls?.forward||controls?.strafe)&&current.inputs.length<100){current.inputs.push({at:this.state.time,x:this.player.x,z:this.player.z,forward:controls.forward,strafe:controls.strafe,life:this.player.lifeId});}
   }
   return r;
  };
  const draw=Mesh.prototype.onAfterRender;
  Mesh.prototype.onAfterRender=function(renderer,scene,camera,geometry,...rest){
   if(current){current.draws++;
    if(this.isInstancedMesh&&this.parent?.name==='domination-flags'&&!current.batches[geometry.type]){
     const pts=[],m=new Matrix4();for(let i=0;i<this.count;i++){this.getMatrixAt(i,m);pts.push([m.elements[12],m.elements[14],Math.hypot(...m.elements.slice(0,3))]);}
     current.batches[geometry.type]=pts;
    }
   }
   return draw.call(this,renderer,scene,camera,geometry,...rest);
  };
 });
 for(const [i,mode] of ['ffa','dom','ffa'].entries()){
  console.log('Selecting',mode,i);let seg=p.locator('#lb-mode-seg [data-value='+mode+']');
  await seg.click();await p.waitForFunction(m=>document.querySelector('#game-mode').value===m,mode);
  await p.locator('#start').click();await p.locator('#cs-loading').waitFor({state:'hidden'});await p.locator('#hud').waitFor();
  if(await p.locator('#pause').isVisible())await p.locator('#resume').click();
  await p.waitForFunction(m=>window.soloTrials.at(-1)?.mode===m&&window.soloTrials.at(-1)?.warmup===0&&window.soloTrials.at(-1).at>.12,mode);
  const last=()=>p.evaluate(()=>window.soloTrials.at(-1)),s=await last();assert(s.newGame&&s.newActor&&s.initial.alive);assert.equal(s.initial.k+s.initial.d,0);
  assert.deepEqual(s.scores,{analysts:0,counterAnalysts:0});assert.equal(s.actorsAlive,s.actorCount);assert.equal(s.actorCount,mode==='ffa'?8:10);
  const label=await p.locator('#round-label').textContent();assert.match(label,mode==='ffa'?/free-for-all/i:/domination/i);
  const before=s.actor;let moved=0;
  for(const key of ['KeyW','KeyD','KeyS','KeyA']){
   await p.keyboard.down(key);await p.waitForTimeout(750);await p.keyboard.up(key);
   const now=(await last()).actor;
   moved=Math.hypot(now.x-before.x,now.z-before.z);if(moved>.09&&now.life===before.life)break;
  }
  const current=await last();assert(current.inputs.length&&moved>.09&&current.legal,'continuous controls move a legal player');assert.equal(current.actor.life,before.life);
  const hud={label,score:await p.locator('#score-a').textContent(),other:await p.locator('#score-ca').textContent(),timer:await p.locator('#timer').textContent()};
  if(mode==='ffa'){
   assert.equal(current.zones.length,0);assert.deepEqual(current.batches,{});assert(await p.locator('#zone-control').isHidden());
   await p.keyboard.down('Tab');await p.locator('#scoreboard:visible').waitFor();const standing=await p.locator('#score-tables').innerText();
   assert.match(standing,/individual standings/i);assert.match(standing,/POINTS/);
   assert.equal(await p.locator('#score-tables .me td').first().textContent(),'You');
   hud.help=await p.locator('#board-help').textContent();
   assert.match(hud.help,/Ranked by eliminations, fewest deaths, then points/);
   await shot(i===0?'ffa-standing':'ffa-redeploy');await p.keyboard.up('Tab');hud.standings=standing;
  }else{
   await p.waitForFunction(()=>Object.keys(window.soloTrials.at(-1).batches).length===3);
   const t=await last();assert.equal(t.zones.length,3);
   for(const [kind,pts] of Object.entries(t.batches)){assert.equal(pts.length,3);pts.forEach(([x,z,r],j)=>{const zone=t.zones[j];assert(Math.hypot(x-zone.x,z-zone.z)<.01);if(kind==='RingGeometry')assert(Math.abs(r-zone.radius)<.01);});}
   hud.presentation=await p.evaluate(()=>{
    const ids=['zone-control','bomb-status','weapon-slots','bonus-controls'];
    return Object.fromEntries(ids.map(id=>{
     const el=document.getElementById(id),r=el.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
     return [id,{rect:[r.left,r.top,r.right,r.bottom],visible:!!el.getClientRects().length&&!el.hidden&&getComputedStyle(el).visibility==='visible',text:el.innerText,paint:document.elementsFromPoint(x,y).slice(0,7).map(e=>e.id||e.className)}];
    }));
   });
   assert(hud.presentation['zone-control'].visible&&!hud.presentation['bomb-status'].visible,'badges are visible without a competing objective strip');
   const slots=hud.presentation['weapon-slots'],bonus=hud.presentation['bonus-controls'];
   assert(slots.visible&&bonus.visible,'both equipment and bonus controls are visible during spawn peek');
   const [a,b]=[slots.rect,bonus.rect];
   assert(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],'equipment strip and bonuses occupy separate rectangles');
   hud.zones=await p.locator('#zone-control').innerText();await shot('domination');
  }
  report.scenarios.push({...await last(),moved,hud});
  await p.keyboard.press('Escape');await p.locator('#restart').click();await p.locator('#setup-title').waitFor();
  assert(await p.locator('#hud').isHidden());assert(await p.locator('#scoreboard').isHidden());assert(await p.locator('#replay-view').isHidden());
 }
 const gl=await p.evaluate(()=>{const c=document.querySelector('#game'),gl=c.getContext('webgl2'),dbg=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);});report.renderer=gl;
 assert.deepEqual(report.errors,[]);report.passed=true;console.log('Passed Solo FFA → Domination → FFA');
}catch(e){report.failure=e.stack;report.page=p.url();report.partial=await p.evaluate(()=>window.soloTrials??[]).catch(()=>[]);await shot('interrupted').catch(()=>{});throw e;}
finally{await writeFile(file('report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await server.close();}

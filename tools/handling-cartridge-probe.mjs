// Ordinary Solo touch controls exercise the three cartridges the mode supplies.
// This runs after the V6 sequence on the same rendering context and firing lane.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';

export async function captureCartridges(page,out){
  const cdp=await page.context().newCDPSession(page);
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const step=ticks=>page.evaluate(ticks=>{
    const f=__fps,g=f.game,p=g.player,a=f.grenadeAssist;
    for(let i=0;i<ticks;i+=2)f.step(null,Math.min(2,ticks-i)/60);
    const item=g.state.grenades.find(q=>q.ownerId===p.id);
    const point=v=>v?{x:v.x,y:v.y,z:v.z}:null;
    return {time:g.state.time,weapon:p.weapon,stock:[p.inventory.smoke,p.inventory.flash,p.inventory.he],
      cartridge:p.cartridge&&{...p.cartridge},path:a.group.visible,endpoint:point(a.preview?.endpoint),
      note:a.note.hidden?'':a.noteTitle.textContent,guide:a.noteDetail.textContent,hp:p.hp,alive:p.alive,
      hand:{x:p.x,y:p.y+p.height*.55,z:p.z},projectile:item&&{type:item.type,deadline:item.deadline},
      events:[...window.handlingCartridges.events],audio:[...window.handlingCartridges.audio]};
  },ticks);
  const picture=label=>page.screenshot({path:join(out,'cartridge-'+label+'.png')});
  try{
    await page.evaluate(()=>{
      const f=__fps,g=f.game,p=g.player,events=[],audio=[],emit=g.emit,play=f.audio.play;
      window.handlingCartridges={events,audio,restore(){g.emit=emit;f.audio.play=play;}};
      const types=new Set(['cartridge-latch','throw','he','smoke','flash']);
      g.emit=function(type,actor,data){
        const e=emit.call(this,type,actor,data);
        if(types.has(type))events.push({type,time:e.time,owner:e.ownerId??actor?.id,grenade:e.grenade,x:e.x,y:e.y,z:e.z});
        return e;
      };
      f.audio.play=function(e){
        if(types.has(e.type))audio.push({type:e.type,time:e.time,grenade:e.grenade});
        return play.call(this,e);
      };
      Object.assign(p,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0});
      f.step({yaw:Math.PI,pitch:.15},1/60);
    });
    const fire=await page.locator('[data-mobile-action=fire]').boundingBox();assert(fire);
    const finger={x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:2},rows=[];
    for(const type of ['smoke','flash','he']){
      await page.evaluate(type=>{
        const p=__fps.game.player,stock=p.inventory;
        stock.smoke=stock.flash=stock.he=0;stock[type]=1;
        handlingCartridges.events.length=handlingCartridges.audio.length=0;
      },type);
      await page.locator('#mobile-more').tap();
      await page.locator('[data-mobile-action=grenade]').tap();
      const ready=await step(23);
      assert.equal(ready.weapon,type);assert(ready.path && ready.endpoint);
      await send('touchStart',[finger]);
      const held=await step(40);
      assert.equal(held.cartridge.type,type);assert.equal(held.projectile,undefined);
      assert.equal(held.events.filter(e=>e.type==='cartridge-latch').length,1);
      assert.equal(held.audio.filter(e=>e.type==='cartridge-latch').length,1);
      if(type==='he'){
        const late=await step(Math.round((held.cartridge.deadline-held.time-.08)*60));
        assert(late.cartridge.deadline>late.time && late.cartridge.deadline-late.time<.12);
        assert.equal(late.path,false);assert.match(late.note,/DETONATION IN HAND/);
        await picture('he-cooked');
        const expired=await step(12);
        await send('touchEnd',[]);
        const blast=expired.events.find(e=>e.type==='he');
        assert(blast && Math.hypot(blast.x-late.hand.x,blast.y-late.hand.y,blast.z-late.hand.z)<.001);
        assert.equal(expired.events.filter(e=>e.type==='throw').length,1);
        assert.equal(expired.audio.filter(e=>e.type==='he').length,1);
        assert.equal(expired.stock[2],0);
        rows.push({type,ready,held,late,expired});
      }else{
        assert.equal(held.cartridge.deadline,0);
        await picture(type+'-held');
        await send('touchEnd',[]);
        const released=await step(10);
        assert.equal(released.projectile?.type,type);assert.equal(released.weapon,'cr4');
        const cast=released.events.find(e=>e.type==='throw');
        assert(cast && Math.abs(released.projectile.deadline-cast.time-1.8)<1e-6);
        assert.equal(released.events.filter(e=>e.type==='throw').length,1);
        const end=await step(Math.ceil((released.projectile.deadline-released.time)*60)+2);
        const event=end.events.find(e=>e.type===type);
        assert(event && Math.hypot(event.x-held.endpoint.x,event.y-held.endpoint.y,event.z-held.endpoint.z)<.03);
        assert.equal(end.audio.filter(e=>e.type===type).length,1);
        await picture(type+'-return');
        rows.push({type,ready,held,released,end});
        if(type==='flash')await step(180);
      }
      writeFileSync(join(out,'cartridges.json'),JSON.stringify(rows,null,2));
    }
    console.log('Solo touch held and returned smoke/flash and located the final HE warning at its actual blast');
  }finally{
    await page.evaluate(()=>window.handlingCartridges?.restore());
    await cdp.detach();
  }
}

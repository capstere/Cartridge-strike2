import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';

// V6: keep the six-round count and controls readable through a nearby flash.
// Only equipment, the clear initial lane and the other actor's aim are fixtures.
export async function captureFlashOverlap(page,out){
  const cdp=await page.context().newCDPSession(page);
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const center=async selector=>{
    const box=await page.locator(selector).boundingBox();assert(box,selector+' reachable');
    return {x:box.x+box.width/2,y:box.y+box.height/2};
  };
  const advance=n=>page.evaluate(n=>{
    for(let i=0;i<n;i++)__fps.step(null,1/60);
    const f=__fps,game=f.game,p=game.player,flash=document.getElementById('flash-overlay');
    const rect=selector=>{
      const {left,right,top,bottom}=document.querySelector(selector).getBoundingClientRect();
      return {left,right,top,bottom};
    };
    const map=rect('#hud .map-panel'),score=rect('#hud .top-hud'),hint=rect('#reload-text');
    return {time:game.state.time,hp:p.hp,alive:p.alive,rounds:game.item()?.ammo,rush:p.rushWeight,
      speed:p.moving,ground:p.onGround,stick:f.mobile?.state,position:[p.x,p.z],yaw:p.yaw,
      hintRect:hint,hintOnscreen:hint.top>=0 && hint.bottom<innerHeight && hint.left>=0 && hint.right<=innerWidth,
      scoreClearOfMap:score.bottom<=map.top || score.right<=map.left || score.left>=map.right,
      flash:p.flash,opacity:Number(flash.style.opacity),hudZ:Number(getComputedStyle(document.getElementById('hud')).zIndex),
      flashZ:Number(getComputedStyle(flash).zIndex),hint:document.getElementById('reload-text').textContent,
      low:document.documentElement.classList.contains('hud-low-ammo'),danger:!document.getElementById('grenade-danger').hidden,
      magazine:document.getElementById('ammo').textContent,fireVisible:document.querySelector('[data-mobile-action=fire]').checkVisibility(),
      mapVisible:document.querySelector('#hud .map-panel').checkVisibility(),
      score:document.getElementById('score-a').textContent};
  },n);
  try{
    await page.evaluate(()=>{
      const f=__fps,g=f.game,a=g.player;
      a.inventory.primary=g.weaponItem('cr4');a.inventory.primary.ammo=7;g.select('cr4');
      Object.assign(a,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0});
      f.step({yaw:Math.PI,pitch:0},1/60);
    });
    await advance(23);
    const fire={...await center('[data-mobile-action=fire]'),id:2};
    await send('touchStart',[fire]);await send('touchEnd',[]);
    const before=await advance(5);
    assert.equal(before.rounds,6);assert.equal(before.hint,'RELOAD');assert(before.low);
    await page.locator('#mobile-more').tap();
    await page.getByRole('button',{name:'Toggle tactical map'}).tap();
    const records=[];
    for(const reduced of [false,true]){
      await page.locator('[data-mobile-action=pause]').tap();
      const setting=page.locator('#pause').getByRole('checkbox',{name:'Reduced flash and ringing'});
      await setting.scrollIntoViewIfNeeded();
      const fits=await setting.evaluate(input=>{
        const row=input.closest('label').getBoundingClientRect(),check=input.getBoundingClientRect();
        return row.left>=0 && row.right<=innerWidth && check.left>=row.left && check.right<=row.right;
      });
      assert(fits,'the touch setting label and checkbox fit the screen');
      await setting.setChecked(reduced);
      await page.locator('#resume').tap();
      assert.equal(await page.evaluate(()=>__fps.settings.reducedFlash),reduced);
      const cast=await page.evaluate(()=>{
        const f=__fps,g=f.game,p=g.player,other=g.actors.find(a=>a!==p && a.alive);
        Object.assign(p,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0});
        f.step({yaw:Math.PI,pitch:0},1/60);
        Object.assign(other,{x:p.x+1.0,z:p.z+1.3,y:0,yaw:Math.PI,pitch:-1.45,nextShot:0,weapon:'flash',lastWeapon:'knife'});
        other.inventory.flash=1;
        if(!g.fire(other,true))throw Error('reference actor could not throw its flash');
        const grenade=g.state.grenades.at(-1);
        return {time:g.state.time,deadline:grenade.deadline,id:grenade.id,owner:grenade.ownerId};
      });
      const pre=await advance(13);assert(pre.danger && pre.low && pre.rounds===6);
      if(!reduced)await page.screenshot({path:join(out,'v6-warning.png')});
      const n=Math.ceil((cast.deadline-pre.time)*60-1e-5)+1;
      const peak=await advance(n);assert(peak.flash>.4 && peak.flashZ<peak.hudZ);
      assert(peak.mapVisible && peak.fireVisible && peak.hint==='RELOAD' && peak.magazine.startsWith('6 /') && peak.low);
      assert(peak.hintOnscreen && peak.scoreClearOfMap,JSON.stringify(peak));
      assert(Math.abs(peak.opacity/peak.flash-(reduced?.45:.94))<1e-5);
      if(!reduced)await page.screenshot({path:join(out,'v6-flash.png')});
      const b=await page.locator('[data-mobile-stick-zone]').boundingBox();
      const stick={x:b.x+b.width*.43,y:b.y+b.height*.65,id:1};
      await send('touchStart',[stick]);await send('touchMove',[{...stick,y:stick.y-75}]);
      const stride=[];
      for(let i=0;i<18;i++){
        stride.push(await advance(1));
        if(stride.at(-1).rush>.70)break;
      }
      const moving=stride.at(-1);
      assert(moving.rush>.60 && moving.flash>0 && moving.rounds===6,JSON.stringify(stride));
      if(!reduced)await page.screenshot({path:join(out,'v6-rush.png')});
      await send('touchEnd',[]);
      const end=await advance(168);assert(end.flash===0 && end.opacity===0 && end.hint==='RELOAD');
      records.push({reduced,cast,pre,peak,stride,moving,end});
    }
    await page.locator('[data-mobile-action=reload]').tap();const reload=await advance(3);
    assert.match(reload.hint,/Reloading/);const full=await advance(180);
    assert.equal(full.rounds,30);assert(!full.low);assert.equal(full.hint,'');
    writeFileSync(join(out,'v6.json'),JSON.stringify({before,records,reload,full},null,2));
    console.log('English touch overlap passed for normal and reduced flash');
  }finally{await cdp.detach();}
}

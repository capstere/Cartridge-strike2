// Ordinary menu, authenticated account, thumbnail rendering and live Solo loadout.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {verifyArsenalModels} from './arsenal-model-browser.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';

const fixture=await startPilotFixture({familyRoom:true});
const dir=process.env.FPS_ARSENAL_EVIDENCE||join(tmpdir(),'cs3-arsenal-browser');
const native=process.env.CHROMIUM_PATH;
const errors=[],observations={};
let browser,page;
async function openClasses(){
  await page.goto(fixture.origin+'/fps/?screen=classes&test=1&realtime=1',{waitUntil:'domcontentloaded'});
  await page.locator('[data-class-equip]:enabled').waitFor();
}
const control=id=>page.locator('[data-class-field="'+id+'"]');
const slot=id=>page.locator('[data-class-id="'+id+'"]');
const equip=()=>page.locator('[data-class-equip]').click();
async function footprint(part){
  return page.locator('[data-inspect-slot="'+part+'"] canvas').evaluate(canvas=>{
    const {width,height}=canvas;
    const data=canvas.getContext('2d').getImageData(0,0,width,height).data;
    let pixels=0,hash=2166136261;
    for(let i=0;i<data.length;i+=4){
      if(Math.abs(data[i]-data[0])+Math.abs(data[i+1]-data[1])+Math.abs(data[i+2]-data[2])>12)pixels++;
      hash=Math.imul(hash^data[i],16777619);hash=Math.imul(hash^data[i+1],16777619);hash=Math.imul(hash^data[i+2],16777619);
    }
    return {pixels,hash:hash>>>0};
  });
}
async function waitImage(part,previous){
  const deadline=Date.now()+90000;
  do {
    const result=await footprint(part);
    if(result.pixels>100&&result.hash!==previous)return result;
    await page.waitForTimeout(100);
  }while(Date.now()<deadline);
  throw Error('No distinct rendered '+part+' image after selection');
}
try{
  await mkdir(dir,{recursive:true});
  browser=await chromium.launch({channel:native?undefined:'chromium',headless:process.env.FPS_NETWORK_HEADED!=='1',executablePath:native||undefined,args:[...fixture.args,
    ...(native?['--ozone-platform=wayland','--disable-dev-shm-usage']:[]),
    '--use-gl=angle','--use-angle='+(process.env.FPS_NETWORK_ANGLE||(native?'gl-egl':process.platform==='darwin'?'metal':'swiftshader'))]});
  const context=await browser.newContext({viewport:{width:1080,height:680},deviceScaleFactor:1});
  page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(fixture.origin);await page.locator('input[name=invite]').fill(fixture.invite);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(url=>url.searchParams.get('network')==='internet');
  await openClasses();
  await page.locator('[data-class-progress]').filter({hasText:'Next slot at level 3'}).waitFor();
  assert.equal(await page.locator('[data-class-id]').count(),9);
  assert.doesNotMatch(await slot('assault').innerText(),/Equipped/);
  for(const [i,level] of [3,6,10,15,20].entries()){
    await slot('custom-'+(i+1)).click();
    assert.match(await page.locator('[data-class-note]').innerText(),new RegExp('level '+level+'\\.'));
    assert(await page.locator('[data-class-equip]').isHidden());
  }
  await slot('scout').click();
  const primary=await waitImage('primary'),sidearm=await waitImage('secondary');
  assert.notEqual(primary.hash,sidearm.hash);
  await page.locator('[data-class-turn="1"]').click();
  const rotated=await waitImage('primary',primary.hash);
  observations.guest={primary,sidearm,rotated};
  await equip();await page.locator('[data-class-status]').filter({hasText:'Class equipped'}).waitFor();
  await openClasses();await slot('scout').filter({hasText:'Equipped preset'}).waitFor();
  await page.screenshot({path:join(dir,'guest-workshop.png')});
  await page.locator('[data-panel=classes] [data-go=solo]').click();
  await page.locator('#lb-mode-seg [data-value=endless]').click();
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.__fps?.game.player?.inventory.primary?.id==='sniper'&&!document.getElementById('hud').hidden);
  const user='workshop_'+randomBytes(4).toString('hex');
  await page.goto(fixture.origin+'/profile');await page.locator('[data-action=register]').click();
  await page.locator('[name=username]').fill(user);await page.locator('[name=displayName]').fill('Workshop Pilot');
  await page.locator('[name=password]').fill(randomBytes(20).toString('hex'));await page.locator('form button[type=submit]').click();
  await page.getByRole('button',{name:'I saved my code'}).click();
  // Seed only the new private account in this fixture's disposable database.
  const db=new DatabaseSync(fixture.authority.config.accountDb);
  try{
    const {id}=db.prepare('SELECT id FROM users WHERE username=?').get(user);
    db.prepare('INSERT INTO rewards VALUES(?,?,?,?,?)').run('workshop-fixture','completed-match',id,'match',100000);
    const advance=db.prepare('INSERT INTO weapon_progress VALUES(?,?,?)');
    for(const weapon of ['ar47','cr4','p9','p12'])advance.run(id,weapon,100000);
  }finally{db.close();}
  await openClasses();await page.locator('[data-class-progress]').filter({hasText:'5/5 custom slots'}).waitFor();
  assert.doesNotMatch(await slot('scout').innerText(),/Equipped/);
  await slot('custom-1').click();await control('name').fill('Coast Patrol');
  await control('equipment').selectOption('smoke');
  const bare=await waitImage('primary');
  await control('optic').selectOption('red');await control('barrel').selectOption('sil');
  await control('camo').selectOption('desert');
  const fitted=await waitImage('primary',bare.hash);
  await equip();await page.locator('[data-class-status]').filter({hasText:'Class equipped'}).waitFor();
  await openClasses();await slot('custom-1').filter({hasText:'Coast Patrol'}).waitFor();
  assert.equal(await control('optic').inputValue(),'red');assert.equal(await control('barrel').inputValue(),'sil');
  assert.equal(await control('camo').inputValue(),'desert');
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:join(dir,'custom-portrait.png')});
  observations.account={bare,fitted};
  await page.locator('[data-panel=classes] [data-go=solo]').click();await page.locator('#lb-mode-seg [data-value=endless]').click();
  await page.locator('#start').click();
  await page.waitForFunction(()=>window.__fps?.game.player?.inventory.primary?.camo==='desert'&&!document.getElementById('hud').hidden);
  const actual=await page.evaluate(()=>{const p=__fps.game.player;return {id:p.inventory.primary.id,camo:p.inventory.primary.camo,
    attachments:p.inventory.primary.attachments,smoke:p.inventory.smoke,renderer:__fps.renderer.renderer?.getContext()?.getParameter(7937)};});
  assert.deepEqual(actual.attachments,['red','sil']);assert(actual.smoke>0);
  observations.deployed=actual;await verifyArsenalModels(page,dir);assert.deepEqual(errors,[]);
  await writeFile(join(dir,'workshop.json'),JSON.stringify(observations,null,2)+'\n');console.log('PASS class workshop',JSON.stringify(observations));
}catch(error){
  if(page){await page.screenshot({path:join(dir,'failure.png')}).catch(()=>{});
    console.error('Workshop state',await page.evaluate(()=>({route:document.querySelector('#menu')?.dataset.screen,
      title:document.querySelector('[data-class-title]')?.textContent,status:document.querySelector('[data-class-status]')?.textContent,
      progress:document.querySelector('[data-class-progress]')?.textContent,phase:window.__fps?.game?.phase})).catch(()=>null),errors);}
  throw error;
}finally{await browser?.close();await fixture.close();}

// A cold public account and a disposable pilot exercise the normal wardrobe.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';
import {challenges} from '../server/progression.mjs';
import {EARNED_OUTFITS} from '../src/fps/operator-outfits.mjs';

const fixture=await startPilotFixture({familyRoom:true});
const output=process.env.FPS_WARDROBE_EVIDENCE||'test-results/earned-wardrobe';
const user='earned_'+randomBytes(4).toString('hex');
let browser;
try{
  await mkdir(output,{recursive:true});
  const path=process.env.CHROMIUM_PATH;
  browser=await chromium.launch({channel:path?undefined:'chromium',executablePath:path||undefined,headless:process.env.FPS_NETWORK_HEADED!=='1',
    args:[...fixture.args,...(path?['--ozone-platform=wayland','--disable-dev-shm-usage']:[]),'--use-gl=angle','--use-angle='+(process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader'))]});
  const context=await browser.newContext({viewport:{width:1000,height:720}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
  await page.goto(fixture.origin+'/profile');await page.locator('[data-action=register]').click();
  await page.locator('[name=username]').fill(user);await page.locator('[name=displayName]').fill('Wardrobe Pilot');
  await page.locator('[name=password]').fill(randomBytes(20).toString('hex'));await page.locator('form button[type=submit]').click();
  await page.getByRole('button',{name:'I saved my code'}).click();
  await page.goto(fixture.origin);await page.locator('[name=invite]').fill(fixture.invite);
  await page.locator('button[type=submit]').click();await page.waitForURL(url=>url.searchParams.get('network')==='internet');
  const open=async()=>{
    await page.goto(fixture.origin+'/fps/?screen=outfits&test=1&realtime=1',{waitUntil:'domcontentloaded'});
    await page.locator('#lobby-stage.is-ready').waitFor();
  };
  await open();assert.equal(await page.locator('[data-outfit]').count(),5);
  await page.locator('[data-outfit-challenges] summary').first().click();
  await page.getByText('100 shotgun eliminations · 0 / 100',{exact:true}).waitFor();
  // The SDK progression suite earns credit by playing. This short fixture puts
  // a private test account exactly at every threshold to inspect all six models.
  const db=new DatabaseSync(fixture.authority.config.accountDb);
  try{
    const {id}=db.prepare('SELECT id FROM users WHERE username=?').get(user);
    const insert=db.prepare('INSERT INTO challenge_progress(user_id,challenge,count) VALUES(?,?,?)');
    for(const c of challenges)insert.run(id,c.id,c.goal);
  }finally{db.close();}
  await open();
  const ids=EARNED_OUTFITS.map(o=>o.id);
  await page.locator('[data-outfit=gilet]').waitFor();
  await page.waitForFunction(ids=>ids.every(id=>{
    const tile=document.querySelector('[data-outfit="'+id+'"] canvas');
    if(!tile)return false;
    const rgba=tile.getContext('2d').getImageData(0,0,tile.width,tile.height).data;
    let visible=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>64)visible++;
    return visible>120;
  }),ids,{timeout:90000});
  const portraits=await page.locator('[data-outfit] canvas').evaluateAll(tiles=>tiles.map(c=>c.toDataURL()));
  assert.equal(new Set(portraits).size,11);
  for(const id of ids){
    const tile=page.locator('[data-outfit="'+id+'"]');
    await tile.click();assert.equal(await tile.getAttribute('aria-pressed'),'true');
  }
  await page.screenshot({path:join(output,'earned-choices.png')});
  await open();await page.locator('[data-outfit=gilet][aria-pressed=true]').waitFor();
  await page.locator('#route-back').click();await page.locator('[data-go=play]:visible').first().click();await page.locator('[data-go=solo]:visible').first().click();await page.locator('#start').click();
  await page.waitForFunction(()=>window.__fps?.game?.player&&!document.getElementById('hud').hidden&&__fps.renderer?.weaponModel?.userData.characterAppearance);
  const worn=await page.evaluate(async()=>{
    const {renderer,game}=__fps,avatar=renderer.actorModel(game.player).userData.avatar;
    const sleeve=renderer.weaponModel.userData.characterAppearance.profile.sleeve;
    const jacket=avatar.meshes.find(m=>m.material?.name==='jacket-fabric').material;
    const {uniformSwatch}=await import('/src/fps/operator-equipment.mjs');
    const {outfitDefinition}=await import('/src/fps/operator-outfits.mjs');
    const swatch=id=>uniformSwatch(outfitDefinition(id))?.image;
    function digest(canvas){
      const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
      return (hash>>>0).toString(16).padStart(8,'0');
    }
    return {outfit:avatar.outfitId,kit:!!avatar.root.getObjectByName('operator-kit-gilet-near'),
      first:digest(sleeve.map.image),third:digest(jacket.map.image),expected:digest(swatch('gilet')),
      baseKit:digest(swatch('assault')),issuedSwatch:!!swatch('issued'),separateTextureHandles:sleeve.map!==jacket.map};
  });
  assert.equal(worn.outfit,'gilet');assert.equal(worn.kit,true);assert.equal(worn.first,worn.third);assert.equal(worn.first,worn.expected);assert.notEqual(worn.first,worn.baseKit);assert.equal(worn.issuedSwatch,false);assert.equal(worn.separateTextureHandles,true);
  await page.goto(fixture.origin+'/profile');await page.getByRole('button',{name:'Sign out'}).click();
  await page.getByRole('heading',{name:'Local guest'}).waitFor();
  await open();await page.locator('[data-outfit=issued][aria-pressed=true]').waitFor();
  assert.equal(await page.locator('[data-outfit]').count(),5);assert.deepEqual(errors,[]);
  const result={publicRegistration:true,distinctPortraits:11,earned:ids,worn,logoutFallback:'issued',physicalDevice:false,browser:browser.version()};
  await writeFile(join(output,'wardrobe.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();await fixture.close();}

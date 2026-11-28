// Exercise the actual wardrobe, its thumbnail renderer and a deployed Solo operator.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const output = process.env.CS3_WARDROBE_EVIDENCE;
if (output) await mkdir(output,{recursive:true});
const native = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  headless:process.env.FPS_NETWORK_HEADED !== '1',executablePath:native,
  channel:native ? undefined : 'chromium',
  args:native ? ['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage'] : ['--enable-unsafe-swiftshader']
});
const results = [];
try {
  for (const touch of [false,true]) {
    const label = touch ? 'touch' : 'desktop';
    const viewport = touch ? {width:844,height:390} : {width:1280,height:720};
    const context = await browser.newContext({viewport,hasTouch:touch,isMobile:touch,deviceScaleFactor:1,reducedMotion:'reduce'});
    try {
      await context.addInitScript(() => {
        localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,reducedMotion:true}));
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror',err=>errors.push(err.message));
      page.setDefaultTimeout(90000);
      const press = locator => touch ? locator.tap() : locator.click();
      const route = name => press(page.locator('[data-go="'+name+'"]:visible').first());
      const snap = async name => {if (output) await page.screenshot({path:join(output,label+'-'+name+'.jpg'),quality:82,type:'jpeg'});};
      await page.goto(origin+'/fps/?test=1',{waitUntil:'domcontentloaded'});
      await route('outfits');
      await page.locator('#lobby-stage.is-ready').waitFor();
      await page.waitForFunction(() => {
        const tiles = [...document.querySelectorAll('[data-outfit] canvas')];
        return tiles.length === 5 && tiles.every(c => {
          const bytes = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          let covered = 0;
          for (let i=3;i<bytes.length;i+=4) if(bytes[i]>64) covered++;
          return covered > 200;
        });
      });
      const pictures = await page.locator('[data-outfit] canvas').evaluateAll(items => items.map(c=>c.toDataURL()));
      assert.equal(new Set(pictures).size,5,'all five cards show different real operators');
      const chosen = page.locator('[data-outfit=shotgun]');
      await press(chosen);
      assert.equal(await chosen.getAttribute('aria-pressed'),'true');
      await press(page.locator('[data-rotate="1"]'));
      if (!touch) {
        const area = await page.locator('.wardrobe-stage').boundingBox();
        await page.mouse.move(area.x+area.width*.4,area.y+area.height*.55);
        await page.mouse.down();
        await page.mouse.move(area.x+area.width*.65,area.y+area.height*.55,{steps:7});
        await page.mouse.up();
      }
      await snap('wardrobe');
      await page.reload({waitUntil:'domcontentloaded'});
      await route('outfits');
      assert.equal(await chosen.getAttribute('aria-pressed'),'true','equipped choice survived reload');
      await press(page.locator('#route-back'));
      await route('play');
      await route('solo');
      await press(page.locator('#start'));
      await page.waitForFunction(()=>window.__fps?.renderer.weaponModel && window.__fps?.game.player?.alive);
      const observed = await page.evaluate(() => {
        const {game,renderer} = window.__fps;
        const avatar = renderer.actorModel(game.player).userData.avatar;
        const ally = game.actors.find(a=>a!==game.player && a.team===game.player.team);
        const view = renderer.weaponModel.userData.characterAppearance;
        const fabric=avatar.meshes.find(m=>m.material?.name==='jacket-fabric')?.material;
        const sleeve=view?.profile.sleeve;
        return {fabricMatches:!!fabric?.map && fabric.map===sleeve?.map,
          swatch:[fabric?.map?.image?.width,fabric?.map?.image?.height],glove:view?.profile.glove.color.getHex(),
          hasKit:!!avatar.root.getObjectByName('operator-kit-shotgun-near'),outfit:avatar.outfitId,ally:renderer.actorModel(ally).userData.avatar.outfitId,
          shirt:avatar.meshes.find(m=>m.material?.name==='jacket-fabric')?.material.color.getHex(),
          sleeve:view?.profile.sleeve.color.getHex(),
          handTargets:view?.targets.filter(t=>t.role==='hand').length,locale:document.documentElement.lang};
      });
      assert.equal(observed.outfit,'shotgun');
      assert.equal(observed.ally,'issued');
      assert.equal(observed.shirt,observed.sleeve);
      assert.equal(observed.fabricMatches,true);
      assert.deepEqual(observed.swatch,[64,64]);
      assert.equal(observed.glove,0x4a463e);
      assert.equal(observed.hasKit,true);
      assert.ok(observed.handTargets>0);
      assert.equal(observed.locale,'en');
      assert.deepEqual(errors,[]);
      await snap('deployed');
      results.push({input:label,viewport,...observed,distinctPortraits:5});
      console.log(label,JSON.stringify(observed));
    } finally {await context.close();}
  }
} finally {await browser.close();}
if (output) await writeFile(join(output,'wardrobe.json'),JSON.stringify(results,null,2)+'\n');

// Run against an isolated build in which the example is actually installed.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {exportPrivateFixtureBytes} from './appearance-export-fixture.mjs';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin=process.env.FPS_TEST_ORIGIN;
if(!origin)throw Error('Set FPS_TEST_ORIGIN to the isolated build with Harbor Crew installed.');
const output=process.env.FPS_APPEARANCE_EVIDENCE||'test-results/appearance';
await mkdir(output,{recursive:true});
const binary=process.env.CHROMIUM_PATH,headed=process.env.FPS_NETWORK_HEADED==='1';
const browser=await chromium.launch({channel:binary?undefined:'chromium',executablePath:binary,headless:!headed,
  args:[...(binary&&headed&&process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[]),'--disable-dev-shm-usage',
    '--use-angle='+(process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'gl-egl'))]});
const report={browser:browser.version(),input:'Chromium emulated touch',physicalPhone:false,errors:[]};
try{
  const options={viewport:{width:932,height:430},deviceScaleFactor:1,hasTouch:true,isMobile:true};
  const page=await browser.newPage(options);
  page.setDefaultTimeout(90000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,reducedMotion:true})));
  const url=origin+'/fps/?screen=outfits&test=1&realtime=1';
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#lobby-stage.is-ready').waitFor();
  const choice=page.getByRole('button',{name:/Harbor Crew/});
  await choice.tap();
  await page.waitForFunction(()=>{
    const canvases=[...document.querySelectorAll('[data-outfit] canvas')];
    if(canvases.length!==6)return false;
    return canvases.every(c=>{
      const rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let filled=0;for(let i=3;i<rgba.length;i+=4)if(rgba[i]>64)filled++;
      return filled>200;
    });
  });
  const portraits=await page.locator('[data-outfit] canvas').evaluateAll(items=>items.map(c=>c.toDataURL()));
  assert.equal(new Set(portraits).size,6);
  const portrait=await choice.locator('canvas').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);
  await writeFile(join(output,'harbor-crew.png'),Buffer.from(portrait,'base64'));
  await page.screenshot({path:join(output,'wardrobe.jpg'),type:'jpeg',quality:83});
  report.portraits=portraits.length;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-outfit=harbor-crew][aria-pressed=true]').waitFor();
  await page.locator('#route-back').tap();await page.locator('[data-go=play]:visible').first().tap();
  await page.locator('[data-go=solo]:visible').first().tap();await page.locator('#start').tap();
  await page.locator('#csl-deploy').tap();
  await page.waitForFunction(()=>window.__fps?.game?.player&&!document.querySelector('#hud').hidden&&__fps.renderer?.weaponModel?.userData.characterAppearance);
  report.deployment=await page.evaluate(async()=>{
    const {renderer,game}=__fps,actor=renderer.actorModel(game.player).userData.avatar;
    const sleeve=renderer.weaponModel.userData.characterAppearance.profile.sleeve;
    const jacket=actor.meshes.find(m=>m.material?.name==='jacket-fabric').material;
    const {uniformSwatch}=await import('/src/fps/operator-equipment.mjs');
    const {outfitDefinition}=await import('/src/fps/operator-outfits.mjs');
    const {createAuthoredAvatar,disposeAvatar}=await import('/src/fps/character-library.mjs?v=6.1.2');
    const palette=outfitDefinition('harbor-crew');
    function digest(canvas){
      const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);
      return (hash>>>0).toString(16).padStart(8,'0');
    }
    const preview=createAuthoredAvatar('analysts','harbor-preview',false,{gender:'female',ignoreOverrides:true,previewOutfit:palette});
    const owners=[preview.uniformTexture,...preview.skeletons,...new Set(preview.materials.values()),...preview.ownedGeometry].filter(Boolean);
    // Skeleton releases its bone texture directly and has no dispose event.
    // Observe the preview owners' real disposal calls, including that path.
    const released=new Map();
    for(const resource of new Set(owners)){
      const original=resource.dispose;
      resource.dispose=function(...args){released.set(resource,(released.get(resource)||0)+1);return original.apply(this,args);};
    }
    const female=preview.outfitId;disposeAvatar(preview);disposeAvatar(preview);
    const gl=renderer.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return {gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),outfit:actor.outfitId,kit:!!actor.root.getObjectByName('operator-kit-harbor-crew-near'),
      rendered:renderer.renderer.info.render.calls,first:digest(sleeve.map.image),third:digest(jacket.map.image),
      expected:digest(uniformSwatch(palette).image),original:digest(uniformSwatch(outfitDefinition('smg')).image),
      independent:sleeve.map!==jacket.map,preview:{female,owners:new Set(owners).size,disposed:released.size,exactlyOnce:[...released.values()].every(count=>count===1)}};
  });
  const d=report.deployment;
  assert.equal(d.outfit,'harbor-crew');assert(d.kit&&d.independent&&d.rendered>0);
  assert.equal(d.first,d.expected);assert.equal(d.third,d.expected);assert.notEqual(d.expected,d.original);
  assert.equal(d.preview.female,'harbor-crew');assert(d.preview.owners>0);assert.equal(d.preview.disposed,d.preview.owners);assert(d.preview.exactlyOnce);

  // Insert a real legacy v1 IndexedDB row in a fresh origin before the game's
  // first library open. The ordinary menu must migrate and load its model.
  // The authoring exporter is intentionally absent from the packaged pilot.
  // Supply that one local module only while constructing the synthetic design.
  const exporterPath='/vendor/three/addons/exporters/GLTFExporter.js';
  const fixtureUrl=new URL(exporterPath,origin).href;
  const exporter=await readFile(new URL('..'+exporterPath,import.meta.url));
  let exported;
  await page.route(fixtureUrl,route=>route.fulfill({contentType:'text/javascript',body:exporter}));
  try{exported=Buffer.from(await page.evaluate(exportPrivateFixtureBytes)).toString('base64');}
  finally{await page.unroute(fixtureUrl);await page.close();}
  const privateContext=await browser.newContext(options);
  const saved=await privateContext.newPage();saved.setDefaultTimeout(90000);
  saved.on('pageerror',e=>report.errors.push(e.message));
  await saved.goto(origin+'/robots.txt');
  const legacy=await saved.evaluate(async encoded=>{
    const source=await (await fetch('/assets/fps/models/quaternius-operator-male.glb')).arrayBuffer();
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)).buffer;
    const digest=async buffer=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const sha256=await digest(bytes),sourceHash=await digest(source);
    const id=crypto.randomUUID(),unsupported=crypto.randomUUID(),created=Date.now()-60000;
    await new Promise((ok,fail)=>{
      const r=indexedDB.open('cartridge-private-characters',1);
      r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'id'});
      r.onerror=()=>fail(r.error);
      r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite');
        const drafts=t.objectStore('drafts');
        drafts.put({id,schema:1,name:'Legacy crew member',bytes,sha256,sourceHash,created,updated:created,projectId:null});
        drafts.put({id:unsupported,schema:1,name:'Unfitted source rig',bytes:source,sha256:sourceHash,sourceHash,created,updated:created,projectId:null});
        t.oncomplete=()=>{db.close();ok();};t.onerror=()=>fail(t.error);
      };
    });
    localStorage.setItem('cartridge-operator-outfit','harbor-crew');return {id,sha256,created,unsupported,sourceHash};
  },exported);
  assert.notEqual(legacy.sha256,legacy.sourceHash);
  // The original naked rig lacks the fitted shoes and shirt vertex colors.
  // Keep the legitimate error and original local bytes when it is selected.
  await saved.goto(url+'&avatar='+legacy.unsupported,{waitUntil:'domcontentloaded'});
  await saved.locator('#lobby-stage.is-ready').waitFor();
  const reason=await saved.locator('#character-status').textContent();
  assert.match(reason,/could not be loaded|incompatible|unsupported/i);
  assert(await saved.locator('#start').isDisabled());report.unsupported={startDisabled:true,reason};
  await saved.goto(url+'&avatar='+legacy.id,{waitUntil:'domcontentloaded'});
  await saved.locator('#lobby-stage.is-ready').waitFor();
  report.legacyMenu=await saved.evaluate(()=>({screen:document.querySelector('#menu').dataset.screen,
    selection:document.querySelector('#player-character').selectedOptions[0]?.textContent,
    status:document.querySelector('#character-status').textContent,wardrobe:document.querySelector('[data-panel=outfits] [role=status]').textContent}));
  assert.match(report.legacyMenu.status,/Legacy crew member.*Saved locally/);
  await saved.locator('[data-panel=outfits] [role=status]').filter({hasText:'Your saved character supplies its own outfit and sleeves.'}).waitFor();
  assert(await saved.locator('[data-outfit=harbor-crew]').isDisabled());
  report.saved=await saved.evaluate(async expected=>{
    const {loadPrivateCharacter}=await import('/src/fps/private-character-store.mjs');
    const row=await loadPrivateCharacter(expected.id);
    return {name:row.name,unchanged:row.created===expected.created&&row.sha256===expected.sha256,bytes:row.bytes.byteLength,
      selected:localStorage.getItem('cartridge-operator-outfit'),schema:row.schema};
  },legacy);
  assert(report.saved.unchanged);assert.equal(report.saved.selected,'harbor-crew');assert.equal(report.saved.schema,1);
  await saved.locator('#route-back').tap();await saved.locator('[data-go=play]:visible').first().tap();
  await saved.locator('[data-go=solo]:visible').first().tap();await saved.locator('#start').tap();
  await saved.locator('#csl-deploy').tap();
  await saved.waitForFunction(()=>window.__fps?.game?.player&&!document.querySelector('#hud').hidden);
  report.saved.deployed=await saved.evaluate(async()=>{
    const {renderer,game}=__fps;
    const {privateCharacterApplies}=await import('/src/fps/character-library.mjs?v=6.1.2');
    return {private:privateCharacterApplies(game.player.id),signature:renderer.actorModel(game.player).userData.avatar.visualSignature};
  });
  assert(report.saved.deployed.private);assert.equal(report.saved.deployed.signature,'private');
  await privateContext.close();
  assert.deepEqual(report.errors,[]);report.status='PASS';
}finally{
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
console.log(JSON.stringify(report));

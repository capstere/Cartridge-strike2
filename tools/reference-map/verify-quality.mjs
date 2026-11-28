// Observe the normal graphics option, live architecture and retained GPU resources
// during a real Kervénec Solo game. The test entry only exposes renderer evidence.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const output=process.argv[2],origin=process.env.FPS_TEST_ORIGIN;
assert(origin&&output,'Supply the normal test origin and an evidence directory.');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:process.env.FPS_NETWORK_HEADED!=='1',executablePath:process.env.CHROMIUM_PATH,
  args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[])]});
try{
  const page=await browser.newPage({viewport:{width:960,height:540},locale:'en-US'});
  page.setDefaultTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',reducedMotion:true,volume:0})));
  await page.goto(origin+'/fps/?test=1&realtime=1&level=embruns&mode=endless',{waitUntil:'domcontentloaded'});
  await page.locator('#start').click();
  await page.locator('#csl-deploy').click();await page.locator('#hud').waitFor();
  await page.locator('#cs-loading').waitFor({state:'hidden'});
  if(await page.locator('#pause').isVisible())await page.locator('#resume').click();
  const results=[];
  for(const [index,quality] of ['low','standard','low'].entries()){
    if(index){
      if(await page.locator('#pause').isHidden())await page.keyboard.press('Escape');
      await page.locator('#pause-settings').getByRole('combobox',{name:'Graphics'}).selectOption(quality);
      await page.locator('#resume').click();
    }
    await page.waitForFunction(quality=>{
      const r=globalThis.__fps?.renderer,root=r?.referenceScene?.root;
      if(!root)return false;
      const architecture=root.getObjectByName('Indexed architecture'),fine=root.getObjectByName('Kervénec Harbor fine detail');
      return r.settings.graphics===quality&&architecture?.children.length===(quality==='low'?149:305)
        &&fine?.children.length===(quality==='low'?0:21);
    },quality);
    const state=await page.evaluate(()=>{
      const r=__fps.renderer,root=r.referenceScene.root;
      const read=group=>({groups:group.children.length,triangles:group.children.reduce((sum,m)=>sum+m.geometry.index.count/3,0)});
      const architecture=root.getObjectByName('Indexed architecture'),fine=root.getObjectByName('Kervénec Harbor fine detail');
      return {quality:r.settings.graphics,geometry:read(architecture),fine:read(fine),textures:r.renderer.info.memory.textures,
        activeArchitectures:root.children.filter(c=>c.name==='Indexed architecture').length};
    });
    assert.equal(state.activeArchitectures,1);
    assert.equal(state.geometry.triangles,quality==='low'?238376:502749);
    assert.equal(state.fine.triangles,quality==='low'?0:30804);
    results.push(state);
    if(index===1)await page.screenshot({path:join(output,'standard.jpg'),quality:83});
  }
  assert.deepEqual(errors,[]);
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const dirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());
  await writeFile(join(output,'quality.json'),JSON.stringify({revision,dirty,browser:browser.version(),results},null,2)+'\n');
}finally{await browser.close();}

// Reproduce the comparison from the ordinary Solo match at a fixed waterfront viewpoint.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin=process.env.FPS_TEST_ORIGIN;
const output=process.argv[2];
const base=process.argv[3];
assert(origin && output,'Supply FPS_TEST_ORIGIN and an evidence output directory.');
assert(!base || /^[0-9a-f]{40}$/.test(base),'Baseline must be an exact commit.');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({
  headless:process.env.FPS_NETWORK_HEADED!=='1',executablePath:process.env.CHROMIUM_PATH,
  args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),
    ...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[])]
});
try{
  for(const baseline of base?[true,false]:[false]){
    const label=baseline?'before':'after';
    const page=await browser.newPage({viewport:{width:960,height:540},locale:'en-US'});
    const errors=[];
    try{
      page.setDefaultTimeout(120000);
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{
        localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',reducedMotion:true,volume:0}));
        localStorage.setItem('cs-lobby-music','off');
      });
      if(baseline){
        for(const path of ['src/fps/reference-scene.mjs','assets/fps/maps/meltem/base.bin.gz','assets/fps/maps/meltem/detail.bin.gz']){
          const body=execFileSync('git',['show',base+':'+path],{maxBuffer:32*1024*1024});
          await page.route('**/'+path,route=>route.fulfill({body,contentType:path.endsWith('mjs')?'text/javascript':'application/octet-stream'}));
        }
      }
      await page.goto(origin+'/fps/?test=1&level=meltem&mode=endless',{waitUntil:'domcontentloaded'});
      await page.locator('#start').click();
      await page.locator('#hud').waitFor();
      await page.locator('#cs-loading').waitFor({state:'hidden'});
      await page.waitForFunction(()=>window.__fps?.world?.project?.referenceMap?.sourceId==='meltem' && __fps.game.player?.alive);
      const metrics=await page.evaluate(async()=>{
        const {game,renderer}=__fps;
        __fps.stopFrameLoop();
        if(renderer.quality!=='low' || game.state.mode!=='endless')throw Error('Expected a low-quality Endless match');
        const player=game.player;
        // Stand on the quay, four metres in front of its actual seafood tavern sign.
        if(!renderer.world.canOccupy(-26.27,18.6,player.radius,player.height,0))throw Error('The quay viewpoint is obstructed');
        Object.assign(player,{x:-26.27,y:0,z:18.6,yaw:-Math.PI/2,pitch:.18});
        renderer.render(game,player,1/60);
        const durations=[];
        let last;
        for(let i=0;i<95;i++){
          const now=await new Promise(requestAnimationFrame);
          if(i>=5)durations.push(now-last);
          last=now;
          renderer.render(game,player,1/60);
        }
        const signage=[];
        renderer.scene.getObjectByName('Meltem').traverse(mesh=>{
          const mat=mesh.material, map=mat?.map;
          if(!map?.image?.src?.endsWith('/signs.webp'))return;
          const uv=mesh.geometry.getAttribute('uv');
          let min=1,max=0;
          for(let i=0;i<uv.count;i++){min=Math.min(min,uv.getX(i));max=Math.max(max,uv.getX(i));}
          signage.push({triangles:mesh.geometry.index.count/3,uvRange:[min,max],transparent:mat.transparent,flipY:map.flipY,
            width:map.image.width,height:map.image.height,texture:map.uuid});
        });
        durations.sort((a,b)=>a-b);
        const at=f=>durations[Math.ceil(durations.length*f)-1];
        const gl=renderer.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
        return {map:renderer.world.project.referenceMap.sourceId,quality:renderer.quality,position:[player.x,player.y,player.z],
          yaw:player.yaw,pitch:player.pitch,
          frameIntervals:{n:durations.length,p50:at(.5),p95:at(.95),p99:at(.99)},
          renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
          buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],
          drawCalls:renderer.stats.drawCalls,triangles:renderer.stats.triangles,
          textures:renderer.renderer.info.memory.textures,signage};
      });
      assert.deepEqual(errors,[]);
      if(baseline)assert.equal(metrics.signage.length,0);
      else{
        const groups=metrics.signage.sort((a,b)=>a.triangles-b.triangles);
        assert.equal(groups.length,2);
        assert.deepEqual(groups.map(g=>g.triangles),[88,186]);
        assert.deepEqual(groups.map(g=>g.transparent),[false,true]);
        assert(groups.every(g=>!g.flipY && g.width===1024 && g.height===512));
        assert.equal(groups[0].texture,groups[1].texture);
        assert(groups[0].uvRange[1]<=.5 && groups[1].uvRange[0]>=.5);
      }
      await page.screenshot({path:join(output,label+'.jpg'),type:'jpeg',quality:90});
      metrics.browser=browser.version();metrics.baseline=baseline?base:null;
      metrics.revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
      metrics.dirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());
      await writeFile(join(output,label+'.json'),JSON.stringify(metrics,null,2)+'\n');
      console.log(label,metrics.frameIntervals,metrics.drawCalls,metrics.signage.length);
    }finally{await page.close();}
  }
}finally{await browser.close();}

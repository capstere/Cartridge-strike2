// Reproduce the comparison from the ordinary Solo match at a fixed waterfront viewpoint.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {waterfrontFaces} from './waterfront-faces.mjs';
import {chromium} from '../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin=process.env.FPS_TEST_ORIGIN;
const output=process.argv[2];
const base=process.argv[3];
const viewpoint=process.env.FPS_SIGN_VIEW||'tavern';
assert(['tavern','kiosk'].includes(viewpoint),'Unknown waterfront viewpoint.');
assert(origin && output,'Supply FPS_TEST_ORIGIN and an evidence output directory.');
assert(!base || /^[0-9a-f]{40}$/.test(base),'Baseline must be an exact commit.');
// Derive each moving hull's source UV cells before the runtime's atlas remap.
const environment=JSON.parse(gunzipSync(await readFile(new URL('../../assets/fps/maps/meltem/environment.json.gz',import.meta.url))));
const hulls=environment.floats.flatMap(v=>v.parts.filter(p=>p.material==='decals').map(part=>{
  const indices=Buffer.from(part.index,'base64'),uv=Buffer.from(part.uv,'base64'),cells={};
  for(let i=0;i<indices.length;i+=6){
    const offsets=[0,2,4].map(k=>indices.readUInt16LE(i+k)*8);
    const u=offsets.reduce((sum,k)=>sum+uv.readFloatLE(k),0)/3;
    const v=offsets.reduce((sum,k)=>sum+uv.readFloatLE(k+4),0)/3;
    const cell=Math.min(3,Math.floor(v*4))*4+Math.min(3,Math.floor(u*4));
    cells[cell]=(cells[cell]||0)+1;
  }
  return {x:v.x,z:v.z,triangles:indices.length/6,cells};
}));
assert.equal(environment.floats.length,22);
assert.equal(hulls.length,17);
assert(hulls.every(b=>b.triangles===24));
const atlasDigest=createHash('sha256').update(await readFile(new URL('../../assets/fps/maps/meltem/signs.webp',import.meta.url))).digest('hex');
assert.equal(atlasDigest,'79ee402e3c9735f698db635da120089cad53b55f45fbde4094842bb6f81470dd');
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
      const realtime=viewpoint==='kiosk'?'&realtime=1':'';
      await page.goto(origin+'/fps/?test=1&level=meltem&mode=endless'+realtime,{waitUntil:'domcontentloaded'});
      await page.locator('#start').click();
      await page.locator('#hud').waitFor();
      await page.locator('#cs-loading').waitFor({state:'hidden'});
      await page.waitForFunction(()=>window.__fps?.world?.project?.referenceMap?.sourceId==='meltem' && __fps.game.player?.alive);
      if(viewpoint==='kiosk')await page.waitForFunction(()=>__fps.game.player.alive && __fps.game.player.spawnProtectedUntil<=__fps.game.state.time);
      const metrics=await page.evaluate(async viewpoint=>{
        const {game,renderer}=__fps;
        __fps.stopFrameLoop();
        if(renderer.quality!=='low' || game.state.mode!=='endless')throw Error('Expected a low-quality Endless match');
        const player=game.player;
        const [x,z,pitch]=viewpoint==='kiosk'?[-27.17,9,.36]:[-26.27,18.6,.18];
        if(!renderer.world.canOccupy(x,z,player.radius,player.height,0))throw Error('The quay viewpoint is obstructed');
        Object.assign(player,{x,y:0,z,yaw:-Math.PI/2,pitch});
        if(viewpoint==='kiosk')__fps.render();
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
          signage.push({owner:mesh.parent.name,triangles:mesh.geometry.index.count/3,uvRange:[min,max],transparent:mat.transparent,flipY:map.flipY,
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
      },viewpoint);
      assert.deepEqual(errors,[]);
      if(baseline)assert.equal(metrics.signage.length,0);
      else{
        const coverage=await page.evaluate(waterfrontFaces,{viewpoint,hulls});
        assert.deepEqual(coverage.staticMeshes.sort((a,b)=>a.triangles-b.triangles),[{kind:'boards',triangles:88},{kind:'decals',triangles:186}]);
        assert.deepEqual(coverage.materialCells,{boards:{0:4,2:4,4:4,5:62,6:2,7:12},decals:{0:48,1:48,3:48,4:6,5:4,10:12,12:4,13:16}});
        metrics.coverage=coverage;
        metrics.atlasSha256=atlasDigest;
        metrics.contract=await page.evaluate(async()=>{const {CONTRACT}=await import('/shared/multiplayer/build.mjs');return {protocol:CONTRACT.protocolVersion,build:CONTRACT.buildHash};});
        const groups=metrics.signage.filter(g=>g.owner==='Indexed architecture').sort((a,b)=>a.triangles-b.triangles);
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

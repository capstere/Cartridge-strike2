// Exercise the exact rack model/paint/lighting pipeline on an already running
// native renderer. Normal class selection and its account lifecycle run separately.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function verifyArsenalModels(page,output){
  const errors=[];
  const listen=message=>{if(message.type()==='error'&&/WebGLProgram|shader error|INVALID_OPERATION/i.test(message.text()))errors.push(message.text());};
  page.on('console',listen);
  try{
    const result=await page.evaluate(async()=>{
      const {arsenalPreview}=await import('../src/fps/arsenal-preview.mjs');
      const {CAMOS}=await import('../src/fps/arsenal.mjs');
      const renderer=window.__fps.renderer.renderer;
      const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
      const cells=[['Original',{}],
        ...Object.values(CAMOS).map(c=>[c.name,{camo:c.id}]),
        ['Red dot',{attachments:['red']}],['Holographic sight',{attachments:['holo']}],
        ['Combat optic',{attachments:['acog']}],['Suppressor / grip',{attachments:['sil','vgrip']}],
        ['Short / stock removal',{attachments:['short','nostock']}],['Extended magazine',{attachments:['xmag']}]];
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=124;
      const sheet=document.createElement('canvas');sheet.width=960;sheet.height=Math.ceil(cells.length/3)*152;
      const context=sheet.getContext('2d');context.fillStyle='#15212b';context.fillRect(0,0,sheet.width,sheet.height);
      const identities=[],pictures=[],memory=[];
      const rack=arsenalPreview(renderer);
      const sample=()=>canvas.getContext('2d').getImageData(0,0,320,124).data;
      const through=()=>{
        const bare={id:'ar47',attachments:[],camo:null};
        rack.draw(canvas,bare,.14);
        for(const [label,options] of cells) {
          rack.draw(canvas,{...bare,...options},.14);
          const bytes=sample(), ix=identities.length, dx=320*(ix%3),dy=152*Math.floor(ix/3);
          if(ix<cells.length){
            context.drawImage(canvas,dx,dy);
            context.font='16px sans-serif';context.fillStyle='#e5e8ed';context.fillText(label,dx+12,dy+142);
            let painted=0,different=0;const baseline=pictures[0];
            for(let i=0;i<bytes.length;i+=4){
              if(Math.abs(bytes[i]-bytes[0])+Math.abs(bytes[i+1]-bytes[1])+Math.abs(bytes[i+2]-bytes[2])>9)painted++;
              if(baseline&&Math.abs(bytes[i]-baseline[i])+Math.abs(bytes[i+1]-baseline[i+1])+Math.abs(bytes[i+2]-baseline[i+2])>12)different++;
            }
            identities.push({label,painted,changed:different,hash:canvas.toDataURL()});
            pictures.push(bytes);
          }
        }
        rack.clear();
        memory.push({...renderer.info.memory});
      };
      try{through();through();}finally{rack.clear();}
      const ids=new Set(identities.map(o=>o.hash));
      return {driver:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
        cells:identities.map(({hash,...other})=>other),distinct:ids.size,memory,export:sheet.toDataURL('image/png')};
    });
    const {export:encoded,...receipt}=result;
    assert.deepEqual(errors,[],'the native shader compiled successfully');
    assert.equal(receipt.distinct,receipt.cells.length,'every finish and fitting renders distinctly');
    for(const c of receipt.cells){
      assert(c.painted>300,c.label+' has a visible weapon');
      if(c.label!=='Original')assert(c.changed>=8,c.label+' visibly changes the weapon');
    }
    assert.deepEqual(receipt.memory[1],receipt.memory[0],'second complete catalog mount/clear retains no further GPU allocations');
    if(output){
      await mkdir(output,{recursive:true});
      await writeFile(join(output,'arsenal-fittings.png'),Buffer.from(encoded.split(',')[1],'base64'));
      await writeFile(join(output,'arsenal-fittings.json'),JSON.stringify(receipt,null,2)+'\n');
    }
    return receipt;
  }finally{page.off('console',listen);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {chromium}=await import('../frontline/source/tools/dev/node_modules/playwright-core/index.mjs');
  const native=process.env.CHROMIUM_PATH;
  const browser=await chromium.launch({executablePath:native,channel:native?undefined:'chromium',
    headless:process.env.FPS_NETWORK_HEADED!=='1',
    args:native?['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1024,height:640},reducedMotion:'reduce'});
    page.setDefaultTimeout(90000);
    await page.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/fps/?test=1',{waitUntil:'domcontentloaded'});
    await page.locator('[data-go=play]:visible').first().click();
    await page.locator('[data-go=solo]:visible').first().click();
    await page.locator('#start').click();
    await page.waitForFunction(()=>!!window.__fps?.renderer?.renderer && document.querySelector('#cs-loading').hidden);
    console.log(JSON.stringify(await verifyArsenalModels(page,process.env.CS3_ARSENAL_EVIDENCE),null,2));
  }finally{await browser.close();}
}

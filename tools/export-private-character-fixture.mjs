// Generate a compatible private-character regression fixture.
// This exercises the loader contract; it is not a Character Studio UI export.
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]});
try{
 const p=await browser.newPage();p.setDefaultTimeout(120000);p.on('pageerror',e=>console.log('pageerror',e.message));await p.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low'})));await p.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/fps/?test&network=local');await p.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden);if(!await p.evaluate(()=>!!window.__fps))throw Error(await p.locator('#fatal').textContent());
 const bytes=await p.evaluate(async()=>{
  const {loadCharacterLibrary,createAuthoredAvatar,disposeAvatar}=await import('../src/fps/character-library.mjs?v=6.1.2');
  const {GLTFExporter}=await import('../vendor/three/addons/exporters/GLTFExporter.js');
  await loadCharacterLibrary();const avatar=createAuthoredAvatar('analysts','compatible-private-fixture',false,{gender:'male',ignoreOverrides:true});
  const T=await import('../vendor/three/three.module.js');
  const skin=[...avatar.materials.values()].find(m=>m.name==='face-skin')?.color||new T.Color('#bd9270');
  // A compatible generated T-shirt fixture, not a Character Studio UI export.
  avatar.root.traverse(mesh=>{if(!mesh.isSkinnedMesh||mesh.material.name!=='jacket-fabric')return;
   mesh.geometry=mesh.geometry.clone();const g=mesh.geometry,values=new Float32Array(g.attributes.position.count*3);
   for(let i=0;i<g.attributes.position.count;i++){let lower=0;for(let j=0;j<4;j++)if(/^lowerarm_[lr]$/.test(mesh.skeleton.bones[g.attributes.skinIndex.array[i*4+j]]?.name))lower+=g.attributes.skinWeight.array[i*4+j];
    values.set(lower>.8?skin.toArray():[1,1,1],i*3);
   }g.setAttribute('color',new T.BufferAttribute(values,3));mesh.material.vertexColors=true;
  });
  const glb=await new GLTFExporter().parseAsync(avatar.holder,{binary:true,animations:[...avatar.clips.values()]});
  disposeAvatar(avatar);return Array.from(new Uint8Array(glb));
 });await writeFile(process.env.FPS_CHARACTER_OUT||'/tmp/cs2-compatible-private.glb',Buffer.from(bytes));console.log('exported',bytes.length);
}finally{await browser.close();}

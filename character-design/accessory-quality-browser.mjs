/** Visual quality regression using actual game skins, WebGL and anatomical landmarks. */
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(45000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/character-design/?quality=5.1');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));
 const metrics=await page.evaluate(async()=>{
  const T=await import('../vendor/three/three.module.js');
  const {DesignWorkbench}=await import('./workbench.mjs?v=6.1.2');
  const {newProject,addPart,validateProject}=await import('./project-schema.mjs?v=6.1.2');
  const {ACCESSORY_TYPES}=await import('./anatomy-accessories.mjs?v=6.1.2');
  const results=[];
  const posedBox=mesh=>{const b=new T.Box3(),v=new T.Vector3();mesh.updateWorldMatrix(true,false);if(mesh.isSkinnedMesh)mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);b.expandByPoint(v);}return b;};
  for(const gender of ['male','female']){
   const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-2000px;width:720px;height:660px';document.body.appendChild(canvas);const w=new DesignWorkbench(canvas,new Map());await w.initialize();const p=newProject({gender});w.update(p,{recreate:true,rebuild:true});
   const eyes=w.avatar.meshes.find(m=>m.material?.name==='eyes'),eyeCenter=posedBox(eyes).getCenter(new T.Vector3());
   for(const type of ACCESSORY_TYPES){
    p.parts=[];const part=addPart(p,type);w.update(p,{rebuild:true});try{validateProject(p);}catch(e){throw Error(gender+' '+type+': '+e.message+' '+JSON.stringify(part));}const mesh=w.partMeshes.get(part.id),box=new T.Box3().setFromObject(mesh),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
    let meshes=0;mesh.traverse(o=>{if(o.isMesh)meshes++;});
    const bone=w.avatar.bones.get(part.anchor).getWorldPosition(new T.Vector3()),anchorDistance=mesh.getWorldPosition(new T.Vector3()).distanceTo(bone);
    if(type==='glasses'&&center.distanceTo(eyeCenter)>.07)throw Error(gender+' glasses do not fit eyes');
    if(type==='cap'&&box.min.y<eyeCenter.y+.015)throw Error(gender+' cap obscures eyes');
    if(type==='beard'&&(center.y>eyeCenter.y-.02||center.y<eyeCenter.y-.18))throw Error(gender+' beard does not follow jaw');
    if(type==='shoulder'&&center.distanceTo(w.avatar.bones.get('upperarm_l').getWorldPosition(new T.Vector3()))>.11)throw Error(gender+' shoulder guard is floating');
    if(type==='wrist'&&anchorDistance>.08)throw Error(gender+' wrist band is floating');
    if(![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)||size.length()>.65)throw Error(gender+' oversized or invalid accessory '+type);
    for(const clip of ['Walk_Loop','Crouch_Idle_Loop','Jump_Loop','Pistol_Reload','Death01']){
     w.pose(clip);const moved=mesh.getWorldPosition(new T.Vector3()),anchor=w.avatar.bones.get(part.anchor).getWorldPosition(new T.Vector3());
     if(Math.abs(moved.distanceTo(anchor)-anchorDistance)>.02)throw Error(gender+' detached '+type+' in '+clip);
    }
    w.pose('Idle_Loop');results.push({gender,type,meshes,dimensions:part.dimensions});
   }
   p.parts=[];p.creative.hair='long';p.creative.face.facialHair='Helskägg';w.update(p,{rebuild:true});
   for(const m of w.fashion.parts)if(m.name==='creative-fitted-hair'||m.name==='creative-fitted-beard'){
    const box=new T.Box3().setFromObject(m);if(box.isEmpty()||!box.min.toArray().every(Number.isFinite))throw Error('Empty fitted hair surface');
   }
   w.dispose();canvas.remove();
  }
  return results;
 });
 assert.equal(metrics.length,18);assert.ok(metrics.filter(m=>['glasses','cap','helmet','backpack'].includes(m.type)).every(m=>m.meshes>=3));
 // Review the same user-visible controls and make reproducible screenshots.
 await mkdir('test-results',{recursive:true});
 for(const type of ['glasses','cap','helmet','beard','backpack','shoulder','wrist']){
  await page.locator('[data-tab=parts]').click();await page.locator('#part-type').selectOption(type);await page.locator('#add-part').click();await page.locator('#fit-part').click();
  await page.locator(['backpack','shoulder','wrist'].includes(type)?'#focus-body':'#focus-head').click();await page.locator('[data-camera="'+(type==='backpack'?'back':'front')+'"]').click();await page.locator('#right-turn').click();
  await page.locator('#preview3d').screenshot({path:'test-results/quality-'+type+'.png'});await page.locator('#remove-part').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS 18 fitted accessories on real male/female skins: anatomical placement, compound geometry and five animation poses; UI screenshots captured');
}finally{await browser.close();}

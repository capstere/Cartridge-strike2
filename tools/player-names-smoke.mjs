/** Player-visible copy and replacement-material audit on actual local WebGL.
 * Technical identifiers, source material names and credits are outside the text scan.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/player-names';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:660}}),errors=[];page.setDefaultTimeout(180000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{
 localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'standard',wanderers:false}));
 const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__fps)cb(t);});
 window.__drawnCopy=new Set();const fill=CanvasRenderingContext2D.prototype.fillText;
 CanvasRenderingContext2D.prototype.fillText=function(value,...args){__drawnCopy.add(String(value));return fill.call(this,value,...args);};
});
const denied=/\b(?:Cepheid|Danaher|GeneXpert|Infinity[ -]?80|Ricoh|BINDER|CREFORM|PQC|QDIP|IPT|QC|QA|GX\s*LAB|NEG\s*LAB|DRACO|RIGEL|ORION|KENTAUREN)\b|Instill trust|Best team wins|Deliver results|Apply insights|\b(?:27|0) BAGS|HISSRUM\s*12|VÅNING\s*0?5|FLOOR\s*(?:0?5|FIVE)/i;
const checkCopy=async()=>{
 const data=await page.evaluate(()=>({dom:document.body.innerText,drawn:[...__drawnCopy],title:document.title}));
 for(const value of [data.dom,data.title,...data.drawn])assert(!denied.test(value),'Unreviewed player-facing text: '+value);
 return data.drawn.length;
};
const report={status:'RUNNING',rooms:[],levels:[],errors};
try{
 for(const level of ['floor5-prepared','classic-floor5']){
  await page.goto(origin+'/fps/?level='+level+'&test=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});
  assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
  await page.evaluate(()=>{__fps.stopFrameLoop();__fps.start('analysts',{mode:'endless',botFire:false,botSpeed:0,wanderers:false});});
  assert.match(await page.title(),/Cartridge-Strike/);
  if(level==='floor5-prepared'){
   const materials=await page.evaluate(async()=>{
    const {renderer:r}=__fps,roles=new Set();let replacements=0;
    r.projectFurniture.traverse(o=>{for(const m of [].concat(o.material||[]))if(m.userData.fictionalEquipment){replacements++;roles.add(m.userData.artRole);if(!m.map.name.startsWith('fictional-equipment-'))throw Error('Incorrect replacement texture');}});
    const {readLibraryAsset}=await import('/furniture-editor/library/models.mjs?v=5.8.0');
    for(const id of ['genexpert:gx16','genexpert:infinity80','office:ricoh-printer']){const source=await readLibraryAsset(id);source.scene.traverse(o=>{for(const m of [].concat(o.material||[]))if(m.userData.fictionalEquipment)throw Error('Source material was modified');});}
    return {replacements,roles:[...roles].sort()};
   });
   assert.deepEqual(materials.roles,['array','console','plate','printer','screen']);report.materials=materials;
   const notes=JSON.parse(fs.readFileSync('docs/floor5-material-pass/captures.json'));
   for(const f of notes.after.captures){
    const v=await page.evaluate(async f=>{
     const {roomDisplayName}=await import('/src/fps/player-names.mjs'),a=__fps.game.player,r=__fps.renderer,w=__fps.world;
     a.x=f.point.x;a.z=f.point.z;a.y=0;a.yaw=0;a.pitch=0;__fps.render();
     const expected=roomDisplayName(w.roomAt(a.x,a.z));if(document.querySelector('#location').textContent!==expected)throw Error('HUD and room registry disagree');
     r.camera.position.set(a.x,1.6,a.z);r.camera.lookAt(f.look.x,1.35,f.look.z);r.camera.updateMatrixWorld(true);r.projectBatches.update(r.camera);r.doorVisuals.update(r.camera,[]);r.renderer.render(r.scene,r.camera);
     return {id:f.room,name:expected,canOccupy:w.canOccupy(a.x,a.z,.22)};
    },f);
    assert(v.canOccupy);report.rooms.push(v);await page.locator('#game').screenshot({path:out+'/'+f.room+'.png'});
   }
   await page.keyboard.press('m');assert.equal(await page.locator('#minimap').getAttribute('width'),'448');
   await page.screenshot({path:out+'/minimap-hud.png'});await page.keyboard.press('m');
   report.elevators=[];
   for(const team of ['analysts','counterAnalysts'])for(const progress of [0,1]){
    const v=await page.evaluate(async({team,progress})=>{
     const {roomDisplayName}=await import('/src/fps/player-names.mjs'),w=__fps.world,r=__fps.renderer,p=w.anchors[team][0],a=__fps.game.player;
     Object.assign(a,{x:p.x,z:p.z,y:0,yaw:0,pitch:0});w.setElevatorProgress(progress);__fps.render();for(const model of r.actors.values())model.visible=false;
     const cfg=w.project.gameplay.startElevators.find(c=>c.team===team),floor=w.projectScene.floors.find(f=>f.id===cfg.floorId);
     r.camera.position.set(p.x,1.6,p.z);r.camera.lookAt(floor.x1-.07,1.49,floor.z1-.38);r.camera.updateMatrixWorld(true);r.projectBatches.update(r.camera);r.doorVisuals.update(r.camera,[]);r.renderer.render(r.scene,r.camera);
     return {name:roomDisplayName(cfg.floorId),progress,location:document.querySelector('#location').textContent};
    },{team,progress});
    assert.equal(v.location,v.name);report.elevators.push(v);await page.locator('#game').screenshot({path:out+'/lift-'+team+'-'+progress+'.png'});
   }
   const badge=await page.evaluate(()=>__fps.renderer.actors.get('analysts-0').userData.avatar.root.getObjectByName('chest-role-patch').material.map.image.toDataURL());
   fs.writeFileSync(out+'/analysts-patch.png',Buffer.from(badge.split(',')[1],'base64'));
   for(const quality of ['standard','low'])await page.evaluate(quality=>{__fps.settings.graphics=quality;__fps.render();},quality);
   await page.evaluate(()=>{__fps.showBuy();});assert(await page.locator('#shop').textContent());
  }
  report.levels.push({level,generatedTextStrings:await checkCopy()});
 }
 assert.deepEqual(errors,[]);report.status='PASS';fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}

import {runtimeExport} from './runtime-export.mjs?v=6.1.2';
import {roleOf,targetOf,ROLE_TARGETS,ROLE_NAMES,targetLabel} from '../src/fps/character-roles.mjs?v=6.1.2';
import {createDwarfAsset} from '../src/fps/dwarf-rig.mjs?v=6.1.2';
import {GLTFExporter} from '../vendor/three/addons/exporters/GLTFExporter.js';
import {newMatchPilot,validateMatchPilot} from './private-match.mjs?v=6.1.2';
import {savePrivateCharacter,characterHash} from '../src/fps/private-character-store.mjs';
/** Easy UI for revising the FPS skeleton, authoring character props and independent 3D objects. */
import {saveProject,loadProject,listProjects,bytesToData,dataToBytes} from './project-store.mjs?v=53';
import {installStudioControls} from './studio-controls.mjs?v=6.1.2';
import {DesignWorkbench} from './workbench.mjs?v=6.1.2';
import {newProject,validateProject,PALETTES,PRESETS,SHAPES,addPart,clonePart,mirrorPart,aiBrief,animationContract,filename} from './project-schema.mjs?v=6.1.2';
import {makeSpelBridge,makeSpelGuide} from './spel-bridge.mjs';
import {packZip} from './zip-export.mjs?v=53';
import {inspectGLB} from '../furniture-editor/library/glb-utils.mjs';
import {installCreativeControls} from './creative-controls.mjs?v=6.1.2';
import {ensureCreative,applyStudioFoundation} from './creative-schema.mjs?v=6.1.2';

const W=480,H=680,STORE='cartridge-strike-character-studio-v2';
const byId=id=>document.getElementById(id);
const $=byId;
const ANGLES=['front','back','left','right'];
const bases=new Map(),inks=new Map();
for(const name of ANGLES){
 const base=document.querySelector('[data-base="'+name+'"]'),ink=document.querySelector('[data-ink="'+name+'"]');
 base.width=ink.width=W;base.height=ink.height=H;
 bases.set(name,base);inks.set(name,ink);
}
const workbench=new DesignWorkbench($('preview3d'),bases);
const attachments=new Map(),history=[];
let project=restoreAutosave()||newProject(),selectedPart=null,artwork={},ready=false,dirty=false,activeTab='sculpt';
let creativeControls=null,studioControls=null,slotId=null,animationFrame=null;
function restoreAttachments(){attachments.clear();for(const [name,data]of Object.entries(project.embeddedReferences||{}))attachments.set(name,dataToBytes(data));}

function status(message,error=false){
 const node=$('status');node.textContent=message;node.classList.toggle('error',error);
}
function normalText(s){return String(s||'').replace(/[\u0000-\u001f]/g,' ').slice(0,100);}
function restoreAutosave(){
 try{
  const saved=localStorage.getItem(STORE);
  if(!saved||saved.length>3_000_000)return null;
  const obj=JSON.parse(saved);validateProject(obj);ensureCreative(obj);
  return obj;
 }catch{return null;}
}
function captureArtwork(){
 const result={};for(const [n,c] of inks)result[n]=c.toDataURL('image/png');
 return result;
}
let autosaveTimer=null;
async function flushLocalSave(){
 if(!ready)return;
 if(autosaveTimer!==null){clearTimeout(autosaveTimer);autosaveTimer=null;}
 try{artwork=captureArtwork();await saveProject('autosave',projectSnapshot());$('save-state').textContent='Alla ändringar sparade på denna enhet';}
 catch{$('save-state').textContent='Sparning misslyckades · hämta JSON';status('Kunde inte autospara i webbläsaren. Hämta projektfilen (.json) innan du stänger.',true);}
}
function saveLocal(){
 if(!ready)return;
 $('save-state').textContent='Sparar…';
 if(autosaveTimer!==null)clearTimeout(autosaveTimer);
 // Drawing/export uses immediate captures; autosave can be throttled to keep
 // touch/pen strokes and shirt text responsive even with a 1024px portrait.
 autosaveTimer=setTimeout(flushLocalSave,500);
}
function download(data,name,type='application/octet-stream'){
 const b=data instanceof Blob?data:new Blob([data],{type});
 const url=URL.createObjectURL(b),link=document.createElement('a');link.href=url;link.download=name;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function projectSnapshot(){workbench.sculpt.store(project);return {...project,studioVersion:'6.1.2',artwork:ready?{...captureArtwork(),faceViews:creativeControls?.captureFaces()||{},portraitFraming:project.artwork?.portraitFraming||'anatomical-v5'}:project.artwork};}
function refreshPrompt(){
 try{$('ai-prompt').textContent=aiBrief(project,workbench.getClips(),workbench.getBones());}
 catch(e){status('Fel i projektet: '+e.message,true);}
}
function clearDrawing(){
 for(const c of inks.values())c.getContext('2d').clearRect(0,0,W,H);
 history.length=0;artwork={};saveLocal();
}
async function restoreArtwork(saved){
 const loading=[];
 for(const [name,canvas] of inks){
  const c=canvas.getContext('2d');c.clearRect(0,0,W,H);
  const data=saved?.[name];
  if(typeof data==='string'&&data.startsWith('data:image/png;base64,')&&data.length<1_500_000){
   loading.push(new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{c.drawImage(img,0,0,W,H);resolve();};
    img.onerror=()=>resolve();
    img.src=data;
   }));
  }
 }
 await Promise.all(loading);
}
function partsSummary(){
 const box=$('part-list');box.replaceChildren();
 if(!project.parts.length){
  const p=document.createElement('p');p.className='empty';p.textContent='Inga delar ännu. Välj en form och klicka på Lägg till.';box.append(p);
 }
 for(const part of project.parts){
  const b=document.createElement('button');b.type='button';b.className='part-item'+(selectedPart===part.id?' selected':'');
  const label=document.createElement('strong');label.textContent=part.name;
  const subtitle=document.createElement('span');subtitle.textContent=part.preset?'Formgivet tillbehör':SHAPES[part.shape]||part.shape;
  b.append(label,subtitle);b.setAttribute('aria-pressed',String(selectedPart===part.id));
  b.addEventListener('click',()=>{selectedPart=part.id;partsSummary();setTab('parts');});
  box.append(b);
 }
 const part=project.parts.find(p=>p.id===selectedPart);
 $('part-editor').hidden=!part;
 if(!part)return;
 $('part-name').value=part.name;
 $('part-shape').value=part.shape;$('part-shape').closest('label').hidden=!!part.preset;$('part-shape').querySelector('option[value="glb"]').disabled=!part.asset;
 $('part-anchor').value=part.anchor;
 $('part-anchor-wrap').hidden=project.kind==='object';
 $('part-color').value=part.color;
 $('part-note').value=part.note;
 const controls={
  'pos-x':[part.position[0]*100,' cm'],'pos-y':[part.position[1]*100,' cm'],'pos-z':[part.position[2]*100,' cm'],
  'size-x':[part.dimensions[0]*100,' cm'],'size-y':[part.dimensions[1]*100,' cm'],'size-z':[part.dimensions[2]*100,' cm'],
  'rot-x':[part.rotation[0],'°'],'rot-y':[part.rotation[1],'°'],'rot-z':[part.rotation[2],'°']
 };
 for(const [id,[value,suffix]]of Object.entries(controls)){
  $(id).value=Math.round(value);
  $(id+'-value').textContent=Math.round(value)+suffix;
 }
}
function referenceSummary(){
 const root=$('reference-list');root.replaceChildren();
 for(const ref of project.references){
  const item=document.createElement('div');item.className='reference-item';
  const title=document.createElement('span');title.textContent=ref.name+(attachments.has(ref.name)?' (bifogas i ZIP)':' (lägg till filen igen)');
  const remove=document.createElement('button');remove.type='button';remove.textContent='Ta bort';remove.setAttribute('aria-label','Ta bort '+ref.name);
  remove.addEventListener('click',()=>{if(project.parts.some(p=>p.asset===ref.name)){status('Ta först bort tillbehöret som använder filen.',true);return;}
   attachments.delete(ref.name);if(project.embeddedReferences)delete project.embeddedReferences[ref.name];project.references=project.references.filter(x=>x!==ref);referenceSummary();persist();});
  item.append(title,remove);root.append(item);
 }
}
function setTab(name){
 activeTab=name;
 for(const button of document.querySelectorAll('[data-tab]')){
  const on=button.dataset.tab===name;
  button.classList.toggle('active',on);button.setAttribute('aria-selected',String(on));
  $('tab-'+button.dataset.tab).hidden=!on;
 }
}
/** Task shortcuts navigate controls without changing the saved character or rig. */
function setupQuickStudio(){
 const focus=$('focus-design');
 let compact=false;
 try{compact=localStorage.getItem('cartridge-character-quiet-ui')==='1';}catch{}
 const apply=()=>{
  document.body.classList.toggle('simple-focus',compact);
  focus.setAttribute('aria-pressed',String(compact));
  focus.textContent=compact?'Visa alla verktyg':'Fokusera på designen';
  if(compact)$('viewer-tools').open=false;
  if(!compact)document.body.classList.remove('focus-show-face');
 };
 focus.addEventListener('click',()=>{
  compact=!compact;
  try{localStorage.setItem('cartridge-character-quiet-ui',compact?'1':'0');}catch{}
  apply();
 });
 const moveTo=element=>{
  if(!element)return;
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
 };
 for(const button of document.querySelectorAll('.quick-jobs [data-jump]')){
  button.addEventListener('click',()=>{
   const destination=button.dataset.jump;
   if(destination==='export'){moveTo(document.querySelector('section.export'));return;}
   if(project.kind==='object'&&!['parts','ideas'].includes(destination))return;
   setTab(destination);
   moveTo(document.querySelector('.edit-panel'));
  });
 }
 // Detailed face drawing stays reachable when other sections are hidden.
 $('jump-to-face').addEventListener('click',()=>document.body.classList.add('focus-show-face'),{capture:true});
 apply();
}
let humanPoseOptions;
function updateModeVisual(){
 humanPoseOptions??=[...$('pose').options].map(o=>({value:o.value,text:o.text}));
 const poses=roleOf(project)==='dwarf'?humanPoseOptions.filter(o=>['Idle_Loop','Walk_Loop','Death01'].includes(o.value)):humanPoseOptions;
 $('pose').replaceChildren(...poses.map(o=>new Option(o.text,o.value)));if(!poses.some(o=>o.value===project.pose))project.pose='Idle_Loop';$('pose').value=project.pose;
 const mode=project.kind==='object'?'object':project.intent==='create'?'create':'revise';
 for(const b of document.querySelectorAll('[data-mode]')){
  const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));
 }
 const role=roleOf(project);
 $('role-wrap').hidden=$('target-wrap').hidden=project.kind==='object';
 $('gender-wrap').hidden=project.kind==='object'||role==='dwarf';
 $('dwarf-variant-wrap').hidden=project.kind==='object'||role!=='dwarf';
 $('team-wrap').hidden=project.kind==='object'||role!=='player';
 $('actor-role').value=role;$('dwarf-variant').value=project.base.variant||0;
 $('actor-target').replaceChildren(...ROLE_TARGETS[role].map(t=>new Option(targetLabel(t),t)));$('actor-target').value=targetOf(project);
 $('realism-head').disabled=role==='dwarf';
 $('export-runtime').hidden=project.kind==='object';
 $('role-export-summary').textContent=project.kind==='object'?'':`${ROLE_NAMES[role]} → ${targetLabel(targetOf(project))}. Spelexporten innehåller CHARACTER.glb och en kontrollerad rollkoppling. Animationer och spelregler hålls isär.`;
 $('template-wrap').hidden=project.kind==='object';
 $('team-wrap').hidden=project.kind==='object'||role!=='player';
 $('animation-controls').hidden=project.kind==='object';
 $('animation-requests').hidden=project.kind==='object';
 $('face-detail-section').hidden=project.kind==='object';
 $('tab-look').hidden=project.kind==='object'||activeTab!=='look';
 const lookBtn=document.querySelector('[data-tab="look"]');
 lookBtn.hidden=project.kind==='object';
 for(const name of ['sculpt','fashion','face'])document.querySelector('[data-tab="'+name+'"]').hidden=project.kind==='object';
 if(project.kind==='object'&&['sculpt','look','fashion','face'].includes(activeTab))setTab('parts');
 if(project.kind==='object'&&activeTab==='parts')setTab('parts');
 if(project.kind==='character'&&activeTab==='parts')setTab('parts');
 if(project.kind==='character'&&activeTab==='look')setTab('look');
 for(const button of document.querySelectorAll('.quick-jobs [data-jump]'))button.hidden=project.kind==='object'&&!['parts','export'].includes(button.dataset.jump);
 $('character-presets').disabled=project.kind==='object';
 if(project.kind==='object'&&PRESETS[$('part-type').value])$('part-type').value='box';
 $('mode-label').textContent=project.kind==='object'?'Eget 3D-objekt':ROLE_NAMES[role];
 $('rig-hint').textContent=project.kind==='object'?'Bygg ett eget objekt av enkla former. Exportera delarna som riktig statisk 3D-prototyp.':'Grundfiguren använder en kompatibel spelrigg. Spelare/gisslan har originalets 13 animationer; dvärgen har stå, gå och falla. Extra 3D-delar följer valda ben.';
 $('export-help').textContent=project.kind==='object'?'ZIP innehåller SPEL_SOURCE.glb för Blender och en statisk prototyp. Kontrollera geometri, material och skala innan spelintegration.':'ZIP innehåller din riggade SPEL_SOURCE.glb, BASE_RIG.glb, material och en steg-för-steg-guide för Blender. SPEL måste godkänna Procreate-kompatibiliteten separat.';
 $('save-glb').disabled=!project.parts.some(p=>p.visible);
}
function refreshUI(){
 $('project-name').value=project.name;
 $('gender').value=project.base.gender;
 $('team').value=project.base.team;
 $('template').value=project.base.template;
 $('pose').value=project.pose;
 for(const input of document.querySelectorAll('[data-color]'))input.value=project.palette[input.dataset.color];
 $('height').value=project.body.height;$('height-value').textContent=project.body.height+' %';
 $('width').value=project.body.width;$('width-value').textContent=project.body.width+' %';
 for(const key of ['shoulders','chest','arms','waist']){const val=project.body[key]??100;$(key).value=val;$(key+'-value').textContent=val+' %';}
 for(const input of document.querySelectorAll('[data-note]'))input.value=project.notes[input.dataset.note];
 $('play').textContent='▶ Spela rörelsen';$('play').setAttribute('aria-pressed','false');
 selectedPart=project.parts.at(-1)?.id||null;
 updateModeVisual();partsSummary();referenceSummary();creativeControls?.refresh();studioControls?.refresh();refreshPrompt();
}
function persist(options={}){
 studioControls?.record(options);dirty=true;refreshPrompt();saveLocal();
}
function visualChange({rebuild=false,recreate=false,save=true}={}){
 if(!ready)return;
 try{
  if(animationFrame!==null){cancelAnimationFrame(animationFrame);animationFrame=null;}
  $('play').textContent='▶ Spela rörelsen';$('play').setAttribute('aria-pressed','false');
  workbench.flipped=!!project.view_flip;
  workbench.update(project,{rebuild,recreate});
  creativeControls?.syncClips();updateModeVisual();refreshPrompt();
  if(save)saveLocal();
 }catch(e){console.error(e);status('Kunde inte uppdatera 3D-vyn: '+e.message,true);}
}
function resetMode(mode){
 studioControls?.stopSculpt();
 if(!['revise','create','object'].includes(mode))return;
 if(dirty)saveProject(slotId||crypto.randomUUID(),projectSnapshot()).catch(e=>status('Kunde inte arkivera projekt: '+e.message,true));
 slotId=null;
 const isObject=mode==='object',isNew=mode==='create';
 project=newProject({kind:isObject?'object':'character',newCharacter:isNew,template:isNew?'blank':'analysts'});
 if(isNew)applyStudioFoundation(project);
 if(isObject)addPart(project,'box');
 attachments.clear();dirty=false;selectedPart=null;workbench.playing=false;
 clearDrawing();creativeControls?.restoreFaces({});setTab(isObject?'parts':'sculpt');
 refreshUI();visualChange({recreate:true,rebuild:true});
 studioControls?.resetHistory();refreshSlots();status('Nytt '+(isObject?'3D-objekt':isNew?'karaktärsprojekt':'karaktärsprojekt från originalet')+' skapat.');
}
function selected(){return project.parts.find(p=>p.id===selectedPart)||null;}
function partEdited(refresh=true){
 partsSummary();visualChange({rebuild:true});persist();
 if(refresh)partsSummary();
}
function initDrawing(){
 for(const [name,canvas] of inks){
  const ctx=canvas.getContext('2d');let pointer=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};};
  canvas.addEventListener('pointerdown',e=>{
   if(!ready||pointer!==null)return;
   e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);
   history.push({name,image:canvas.toDataURL('image/png')});if(history.length>14)history.shift();
   const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);
   ctx.strokeStyle=$('pen-color').value;ctx.lineWidth=Number($('pen-size').value);ctx.lineCap='round';ctx.lineJoin='round';
   ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke();
  });
  canvas.addEventListener('pointermove',e=>{
   if(e.pointerId!==pointer)return;
   e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{
   if(e.pointerId===pointer){pointer=null;ctx.closePath();persist();}
  });
 }
}
function undo(){
 const last=history.pop();if(!last){status('Inga fler ritstreck att ångra.');return;}
 const canvas=inks.get(last.name),ctx=canvas.getContext('2d');
 const img=new Image();img.onload=()=>{ctx.clearRect(0,0,W,H);ctx.drawImage(img,0,0,W,H);persist();};
 img.src=last.image;
}
function wrappedLines(ctx,text,x,y,maxWidth,maxLines=6){
 let lines=0;const height=19;
 for(const paragraph of String(text).split('\n')){
  let line='';
  for(const word of paragraph.split(/\s+/)){
   const candidate=line?line+' '+word:word;
   if(ctx.measureText(candidate).width>maxWidth&&line){
    ctx.fillText(line,x,y+lines++*height);line=word;
    if(lines>=maxLines)return;
   }else line=candidate;
  }
  if(line){ctx.fillText(line,x,y+lines++*height);if(lines>=maxLines)return;}
 }
}
function buildSheetCanvas(){
 const gap=22,top=108,bottom=182,w=W*4+gap*5,canvas=document.createElement('canvas');
 canvas.width=w;canvas.height=top+H+bottom;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,canvas.height);
 ctx.fillStyle='#193d49';ctx.fillRect(0,0,w,top);
 ctx.fillStyle='#e7f6f3';ctx.font='bold 34px Arial';ctx.fillText('CHARACTER / OBJECT DESIGN SHEET',gap,51);
 ctx.font='22px Arial';ctx.fillText(project.name,gap,82);
 const labels=['FRAMIFRÅN','BAKIFRÅN','VÄNSTER','HÖGER'];
 for(let i=0;i<ANGLES.length;i++){
  const x=gap+i*(W+gap),name=ANGLES[i];
  ctx.fillStyle='#27434a';ctx.font='bold 18px Arial';ctx.fillText(labels[i],x,top-11);
  ctx.drawImage(bases.get(name),x,top,W,H);
  ctx.drawImage(inks.get(name),x,top,W,H);
  ctx.strokeStyle='#d5e1dd';ctx.strokeRect(x,top,W,H);
 }
 ctx.fillStyle='#24414b';ctx.font='bold 18px Arial';ctx.fillText('DESIGNBRIEF',gap,top+H+38);
 ctx.fillStyle='#536b71';ctx.font='16px Arial';
 const summary=Object.entries(project.notes).map(([k,v])=>k+': '+(v||'–')).join('   /   ');
 wrappedLines(ctx,summary,gap,top+H+65,w-2*gap,4);
 ctx.font='14px Arial';
 ctx.fillText('Cartridge Strike · 3D-prototyp + originalrigg i AI-paketet · Quaternius CC0',gap,canvas.height-19);
 return canvas;
}
function sheetBlob(){
 return new Promise((resolve,reject)=>{
  buildSheetCanvas().toBlob(blob=>blob?resolve(blob):reject(Error('Kunde inte spara bilden.')),'image/png');
 });
}
async function writeZip(){
 studioControls?.stopSculpt();
 workbench.playing=false;if(animationFrame!==null){cancelAnimationFrame(animationFrame);animationFrame=null;}
 $('play').textContent='▶ Spela rörelsen';$('play').setAttribute('aria-pressed','false');
 if(!ready)throw Error('3D-modellerna laddas fortfarande.');
 validateProject(project);
 await Promise.all(workbench.fashion.pendingImages);
 workbench.prepareHandoff();
 // Ensure screenshots and static mesh are from the same design state.
 workbench.renderSheet();
 const sheet=await sheetBlob();
 const files=[
  {name:'PROJECT.json',data:JSON.stringify(projectSnapshot(),null,2)},
  {name:'AI_INSTRUCTIONS.md',data:aiBrief(project,workbench.getClips(),workbench.getBones())},
  {name:'ANIMATION_CONTRACT.json',data:JSON.stringify(animationContract(project,workbench.getClips(),workbench.getBones()),null,2)},
  {name:'DESIGN_SHEET.png',data:new Uint8Array(await sheet.arrayBuffer())},
  {name:'README.txt',data:'CARTRIDGE STRIKE CHARACTER STUDIO 6.0 / BLENDER + SPEL HANDOFF\n\nSPEL_SOURCE.glb and PREVIEW.glb contain identical visible design prototypes.\nFor characters, read BLENDER_SPEL_GUIDE.md and SPEL_BRIDGE.json before import.\nBASE_RIG.glb is the unmodified original animated game skeleton.\nPROJECT.json stores editable controls and assets; AI_INSTRUCTIONS.md lists finishing requirements.\nSTATIC_PROTOTYPE.glb is a STATIC mesh of authored parts, not an animation-ready costume.\nThis handoff is NOT approved as FPS/game-ready or guaranteed SPEL Procreate-compatible.\nAll changes are local; the game runtime was not modified.\n'}
 ];
 if(project.kind==='character'){
  let bytes;
  if(roleOf(project)==='dwarf'){const source=createDwarfAsset(project.base.variant||0);bytes=new Uint8Array(await new GLTFExporter().parseAsync(source.scene,{binary:true,animations:source.animations}));}
  else{const url=new URL('../assets/fps/models/'+project.base.original_glb,import.meta.url);const res=await fetch(url);if(!res.ok)throw Error('Originalriggen saknas.');bytes=new Uint8Array(await res.arrayBuffer());}
  if(bytes.length>6*1024*1024||bytes.length<1000)throw Error('Originalriggen har oväntad storlek.');
  files.push({name:'BASE_RIG.glb',data:bytes});
  if(project.creative?.hair==='swept'&&project.base.gender==='female'){
   const hairSource=await fetch(new URL('../assets/fps/models/quaternius-operator-male.glb',import.meta.url));if(!hairSource.ok)throw Error('Frisyrens originaltillgång saknas.');
   files.push({name:'HAIR_SOURCE_MALE.glb',data:new Uint8Array(await hairSource.arrayBuffer())});
  }
 }
 if(workbench.getPartInstances().length)files.push({name:'STATIC_PROTOTYPE.glb',data:new Uint8Array(await workbench.exportParts())});
 if(workbench.cloth.mesh){files.push({name:'CLOTH_SIMULATION.json',data:JSON.stringify(workbench.cloth.handoff())});const solver=await fetch(new URL('./cloth-solver.mjs?v=53',import.meta.url));if(!solver.ok)throw Error('Tygsimuleringens källkod saknas.');files.push({name:'CLOTH_SOLVER.mjs',data:await solver.text()});}
 if(project.creative?.realism?.head==='scan'){for(const name of ['LeePerrySmith.glb','Map-COL.jpg','Infinite-Level_02_Tangent_SmoothUV.jpg','LeePerrySmith_License.txt']){const response=await fetch(new URL('./assets/scan/'+name,import.meta.url));if(!response.ok)throw Error('Skanningens originalfil saknas: '+name);files.push({name:'SCAN_SOURCE_'+name,data:new Uint8Array(await response.arrayBuffer())});}}
 const preview=new Uint8Array(await workbench.exportPreview());
 files.push({name:'PREVIEW.glb',data:preview});
 // An unchanged byte-for-byte alias makes the import target discoverable.
 // Neither PREVIEW nor SPEL_SOURCE is claimed to be game- or paint-verified.
 files.push({name:'SPEL_SOURCE.glb',data:preview});
 if(project.kind==='character'){
  files.push({name:'SPEL_BRIDGE.json',data:JSON.stringify(makeSpelBridge(project,workbench.getClips(),workbench.getBones()),null,2)});
  files.push({name:'BLENDER_SPEL_GUIDE.md',data:makeSpelGuide(project)});
 }
 if(project.kind==='character'&&creativeControls)files.push(...await creativeControls.exportEntries());
 for(let i=0;i<project.references.length;i++){
  const ref=project.references[i],bytes=attachments.get(ref.name);
  if(!bytes)throw Error('Referensfil saknas: '+ref.name+'. Lägg till den igen innan export.');
  files.push({name:'REFERENCE_'+String(i+1).padStart(2,'0')+'.'+ref.type,data:bytes});
 }
 const manifest={studioVersion:'6.1.2',prototypeOnly:true,project:project.name,references:project.references.map((r,i)=>({originalName:r.name,file:'REFERENCE_'+String(i+1).padStart(2,'0')+'.'+r.type})),files:[]};
 for(const file of files){const bytes=typeof file.data==='string'?new TextEncoder().encode(file.data):file.data;const hash=await crypto.subtle.digest('SHA-256',bytes);manifest.files.push({name:file.name,bytes:bytes.byteLength,sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')});}
 files.push({name:'MANIFEST.json',data:JSON.stringify(manifest,null,2)});
 return packZip(files);
}
async function exportZip(){
 const button=$('export-zip');button.disabled=true;button.textContent='Förbereder ZIP…';
 try{
  const zip=await writeZip();download(zip,filename(project.name)+'-ai-design.zip','application/zip');
  status('Blender/SPEL-paket klart! Packa upp ZIP och öppna SPEL_SOURCE.glb i Blender. Läs BLENDER_SPEL_GUIDE.md för karaktärer.');
 }catch(e){console.error(e);status('Exporten misslyckades: '+e.message,true);}
 finally{button.disabled=false;button.textContent='Hämta Blender/SPEL-paket (.zip)';}
}
async function addReferences(e,asAccessory=false){
 for(const file of e.target.files||[]){
  try{
   const type=(file.name.split('.').pop()||'').toLowerCase();
   if(!['glb','blend','png','jpg','jpeg','webp'].includes(type))throw Error('Filtypen stöds inte.');
   if(file.size>12*1024*1024||file.size===0)throw Error('Varje fil får vara högst 12 MB.');
   if(project.references.length>=8)throw Error('Max 8 referensfiler.');
   const total=[...attachments.values()].reduce((n,x)=>n+x.byteLength,0);
   if(total+file.size>18*1024*1024)throw Error('Referensfilerna får totalt vara högst 18 MB.');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(type==='glb')inspectGLB(bytes);
   const name=normalText(file.name);
   if(project.references.some(x=>x.name===name))throw Error('En referens med samma filnamn finns redan.');
   project.references.push({name,type,bytes:bytes.byteLength});attachments.set(name,bytes);
   project.embeddedReferences??={};project.embeddedReferences[name]=bytesToData(bytes);
   if(asAccessory&&type==='glb'){
    const part=addPart(project,'box');part.shape='glb';part.asset=name;part.name=name.slice(0,80);selectedPart=part.id;
    try{await workbench.prepareAssets(project);}catch(error){project.parts=project.parts.filter(p=>p!==part);project.references=project.references.filter(r=>r.name!==name);delete project.embeddedReferences[name];attachments.delete(name);throw error;}
    partsSummary();setTab('parts');visualChange({rebuild:true});
   }
  }catch(error){status(file.name+': '+error.message,true);}
 }
 e.target.value='';referenceSummary();persist();
}
async function importProject(file){
 if(!file)return;
 try{
  if(file.size>40*1024*1024)throw Error('Projektfilen är för stor.');
  const obj=JSON.parse(await file.text());validateProject(obj);ensureCreative(obj);
  if(dirty)await saveProject(slotId||crypto.randomUUID(),projectSnapshot());
  await workbench.prepareAssets(obj);project=obj;restoreAttachments();dirty=false;selectedPart=null;slotId=null;
  setTab(obj.kind==='object'?'parts':'sculpt');
  refreshUI();visualChange({recreate:true,rebuild:true,save:false});partsSummary();
  await restoreArtwork(obj.artwork);await creativeControls?.restoreFaces(obj.artwork?.faceViews);saveLocal();
  studioControls?.resetHistory();refreshSlots();status('Projektet öppnades med sparade ritningar och inbäddade tillgångar.');
 }catch(e){status('Kunde inte öppna projektet: '+e.message,true);}
}
async function changeActorRole(role,variant=0){
 if(!ready)return;const main=document.querySelector('main');main.inert=true;
 try{await saveProject(slotId||crypto.randomUUID(),projectSnapshot());studioControls?.stopSculpt();
  slotId=null;project=newProject({role,variant,team:role==='hostage'?'hostage':'analysts',template:role==='hostage'?'civilian':'analysts',name:role==='hostage'?'Min gisslan':role==='dwarf'?'Min bot-dvärg':'Min spelkaraktär'});
  attachments.clear();selectedPart=null;dirty=false;workbench.playing=false;clearDrawing();await creativeControls.restoreFaces({});refreshUI();visualChange({recreate:true,rebuild:true});studioControls?.resetHistory();await saveProject('autosave',projectSnapshot());await refreshSlots();status('Ny '+ROLE_NAMES[role]+'. Din tidigare design finns kvar i ateljén.');
 }catch(e){status('Rollbytet avbröts: '+e.message,true);}finally{main.inert=false;}
}
async function exportRuntime(){
 if(!ready)return;const main=document.querySelector('main');main.inert=true;status('Exporterar modellen och kontrollerar återimport, benvikter och originalrörelser…');
 try{studioControls?.stopSculpt();const result=await runtimeExport(projectSnapshot(),workbench);download(result.zip,filename(project.name)+'-'+result.contract.target+'-spel.zip','application/zip');status('Spelpaket klart: '+targetLabel(result.contract.target)+' · '+result.report.clips.length+' animationer. Skicka hela ZIP-filen för integration.');}
 catch(e){status('Direkt spelexport stoppades: '+e.message+' Designen finns kvar; spara projekt/Blender-paket.',true);}finally{main.inert=false;}
}
function installEvents(){
 $('actor-role').onchange=e=>changeActorRole(e.target.value);
 $('dwarf-variant').onchange=e=>changeActorRole('dwarf',Number(e.target.value));
 $('actor-target').onchange=e=>{project.runtime={version:1,role:roleOf(project),target:e.target.value};if(roleOf(project)==='player')project.base.team=e.target.value.startsWith('counter')?'counterAnalysts':'analysts';persist();updateModeVisual();};
 $('export-runtime').onclick=exportRuntime;
 for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>resetMode(b.dataset.mode));
 $('open-project').addEventListener('click',()=>$('project-file').click());
 $('project-file').addEventListener('change',e=>{importProject(e.target.files?.[0]);e.target.value='';});
 for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>setTab(b.dataset.tab));
 $('project-name').addEventListener('input',e=>{project.name=e.target.value.slice(0,100);persist();});
 $('gender').addEventListener('change',e=>{
  project.base.gender=e.target.value;project.base.original_glb='quaternius-operator-'+e.target.value+'.glb';
  visualChange({recreate:true,rebuild:true});persist();
 });
 $('team').addEventListener('change',e=>{project.base.team=e.target.value;project.runtime={version:1,role:e.target.value==='hostage'?'hostage':'player',target:e.target.value==='hostage'?'hostage-0':e.target.value+'-0'};visualChange({recreate:true,rebuild:true});persist();});
 $('template').addEventListener('change',e=>{
  project.base.template=e.target.value;project.palette={...PALETTES[e.target.value]};
  for(const input of document.querySelectorAll('[data-color]'))input.value=project.palette[input.dataset.color];
  visualChange();persist();
 });
 for(const input of document.querySelectorAll('[data-color]'))input.addEventListener('input',()=>{
  project.palette[input.dataset.color]=input.value;for(const peer of document.querySelectorAll('[data-color]'))if(peer.dataset.color===input.dataset.color)peer.value=input.value;visualChange({save:false});persist();
 });
 for(const [id,key] of ['height','width','shoulders','chest','arms','waist'].map(key=>[key,key]))$(id).addEventListener('input',e=>{
  project.body[key]=Number(e.target.value);$(id+'-value').textContent=e.target.value+' %';
  visualChange({save:false});persist();
 });
 $('hair-glb-file').addEventListener('change',async e=>{
  if(project.kind!=='character'){e.target.value='';status('Eget hår kräver en karaktär.',true);return;}
  const before=project.parts.length;
  await addReferences(e,true);
  if(project.parts.length<=before)return;
  const part=project.parts.at(-1);
  if(!part||part.shape!=='glb')return;
  part.anchor='Head';part.hairReplacement=true;
  part.name=('Frisyr: '+part.name).slice(0,80);
  // This is the original character's neutral root-space head location;
  // fit and rotation remain user-adjustable under 3D-delar.
  part.position=[0,1.74,0];part.dimensions=[.30,.20,.28];
  visualChange({rebuild:true});persist();
  status('Hårmodellen följer huvudet. Finjustera under 3D-delar och kontrollera animationerna.');
 });
 $('pose').addEventListener('change',e=>{
  project.pose=e.target.value;workbench.pose(project.pose,false);workbench.renderSheet();
  $('play').textContent='▶ Spela rörelsen';$('play').setAttribute('aria-pressed','false');persist();
 });
 $('play').addEventListener('click',()=>{
  if(!ready)return;
  studioControls?.stopSculpt();
  const on=workbench.playToggle();
  $('play').textContent=on?'⏸ Pausa rörelsen':'▶ Spela rörelsen';
  $('play').setAttribute('aria-pressed',String(on));
  if(!on)workbench.renderSheet();
  if(animationFrame!==null)cancelAnimationFrame(animationFrame);
  if(on)animationFrame=requestAnimationFrame(animateLoop);
 });
 $('left-turn').addEventListener('click',()=>{workbench.yaw-=Math.PI/8;workbench.renderPreview();});
 $('right-turn').addEventListener('click',()=>{workbench.yaw+=Math.PI/8;workbench.renderPreview();});
 $('zoom-in').addEventListener('click',()=>{workbench.zoom=Math.min(6,workbench.zoom*1.2);workbench.renderPreview();});
 $('zoom-out').addEventListener('click',()=>{workbench.zoom=Math.max(.5,workbench.zoom/1.2);workbench.renderPreview();});
 $('flip-views').addEventListener('click',()=>{project.view_flip=!project.view_flip;workbench.flipped=!!project.view_flip;workbench.renderSheet();persist();});
 $('part-type').addEventListener('change',()=>{});
 $('add-part').addEventListener('click',()=>{
  try{
   const item=addPart(project,$('part-type').value);selectedPart=item.id;visualChange({rebuild:true});partsSummary();persist();
  }catch(e){status(e.message,true);}
 });
 $('clone-part').addEventListener('click',()=>{
  try{const p=clonePart(project,selectedPart);selectedPart=p.id;partEdited();}
  catch(e){status(e.message,true);}
 });
 $('mirror-part').addEventListener('click',()=>{
  try{const p=mirrorPart(project,selectedPart);selectedPart=p.id;partEdited();}
  catch(e){status(e.message,true);}
 });
 $('remove-part').addEventListener('click',()=>{
  project.parts=project.parts.filter(p=>p.id!==selectedPart);selectedPart=null;partEdited();
 });
 $('part-name').addEventListener('input',e=>{
  const p=selected();if(!p)return;p.name=e.target.value.slice(0,80);partEdited(false);
 });
 $('part-shape').addEventListener('change',e=>{const p=selected();if(!p)return;p.shape=e.target.value;delete p.preset;delete p.fitVersion;if(p.shape!=='glb')delete p.hairReplacement;partEdited();});
 $('part-anchor').addEventListener('change',e=>{const p=selected();if(!p)return;p.anchor=e.target.value;if(p.hairReplacement&&p.anchor!=='Head'){delete p.hairReplacement;status('Nu är modellen ett vanligt tillbehör; originalhåret visas igen.');}partEdited();});
 $('part-color').addEventListener('input',e=>{const p=selected();if(!p)return;p.color=e.target.value;visualChange({rebuild:true,save:false});persist();});
 $('part-note').addEventListener('input',e=>{const p=selected();if(!p)return;p.note=e.target.value.slice(0,1000);persist();});
 for(const id of ['pos-x','pos-y','pos-z','size-x','size-y','size-z','rot-x','rot-y','rot-z'])$(id).addEventListener('input',e=>{
  const p=selected();if(!p)return;
  p.followsFace=false;
  const index='xyz'.indexOf(id.slice(-1)),value=Number(e.target.value);
  if(id.startsWith('pos-'))p.position[index]=value/100;
  else if(id.startsWith('size-'))p.dimensions[index]=value/100;
  else p.rotation[index]=value;
  $(id+'-value').textContent=value+(id.startsWith('rot-')?'°':' cm');
  visualChange({rebuild:true,save:false});persist();
 });
 for(const input of document.querySelectorAll('[data-note]'))input.addEventListener('input',e=>{project.notes[e.target.dataset.note]=e.target.value.slice(0,3000);persist();});
 $('reference-files').addEventListener('change',addReferences);
 $('undo-stroke').addEventListener('click',undo);
 $('clear-ink').addEventListener('click',()=>{clearDrawing();status('Ritmarkeringarna är borttagna.');});
 $('save-json').addEventListener('click',()=>{
  try{validateProject(project);download(JSON.stringify(projectSnapshot(),null,2),filename(project.name)+'.json','application/json');status('Projektet sparat. Du kan öppna JSON-filen i studion senare.');}
  catch(e){status(e.message,true);}
 });
 $('save-png').addEventListener('click',async()=>{
  try{download(await sheetBlob(),filename(project.name)+'-design-sheet.png','image/png');status('Design Sheet exporterad.');}
  catch(e){status(e.message,true);}
 });
 $('save-glb').addEventListener('click',async()=>{
  try{const bytes=await workbench.exportParts();download(bytes,filename(project.name)+'-3d-prototyp.glb','model/gltf-binary');status('Statisk 3D-prototyp exporterad. Animationerna finns i separat originalrigg.');}
  catch(e){status(e.message,true);}
 });
 $('export-zip').addEventListener('click',exportZip);
 $('copy-ai').addEventListener('click',async()=>{
  const value=aiBrief(project,workbench.getClips(),workbench.getBones());
  try{await navigator.clipboard.writeText(value);status('AI-instruktionen kopierad.');}
  catch{document.querySelector('.export details').open=true;status('Kopiering blockerades. Markera texten under AI-instruktionen i stället.',true);}
 });
 $('print-sheet').addEventListener('click',()=>window.print());
}
function animateLoop(time){
 if(!ready||!workbench.playing)return;
 workbench.tick(time);
 animationFrame=requestAnimationFrame(animateLoop);
}
async function refreshSlots(){try{const rows=await listProjects();const menu=$('saved-projects');menu.replaceChildren(new Option('Öppna från ateljén…',''));for(const row of rows.filter(x=>x.id!=='autosave').sort((a,b)=>b.updated.localeCompare(a.updated)))menu.append(new Option(row.name+' · '+new Date(row.updated).toLocaleDateString('sv-SE'),row.id));}catch(e){status('Projektbiblioteket kunde inte öppnas: '+e.message,true);}}
async function saveGameCharacter(rehearsal=false){
 if(!ready)return;
 const main=document.querySelector('main');
 try{
  validateMatchPilot(project);main.inert=true;status('Kontrollerar och sparar din privata provkaraktär…');
  await Promise.all(workbench.fashion.pendingImages);
  slotId??=crypto.randomUUID();await saveProject(slotId,projectSnapshot());await saveProject('autosave',projectSnapshot());
  const source=await fetch(new URL('../assets/fps/models/quaternius-operator-male.glb',import.meta.url));if(!source.ok)throw Error('Originalkaraktären kunde inte läsas.');
  const sourceHash=await characterHash(await source.arrayBuffer());
  const bytes=await workbench.exportPreview();
  const id=await savePrivateCharacter({bytes,name:project.name,sourceHash,projectId:slotId});
  if(rehearsal)location.assign('../fps/?character='+id);
  else{await refreshSlots();status('Karaktären är sparad för spelet på denna enhet. Öppna spelmenyn och välj den under Min karaktär.');}
 }catch(e){status('Spelkopian kunde inte sparas: '+e.message,true);}finally{main.inert=false;}
}
async function createMatchPilot(){
 if(!ready)return;
 const main=document.querySelector('main');main.inert=true;
 try{
  await saveProject(slotId||crypto.randomUUID(),projectSnapshot());
  studioControls?.stopSculpt();slotId=null;project=newMatchPilot();attachments.clear();selectedPart=null;dirty=false;workbench.playing=false;
  clearDrawing();await creativeControls.restoreFaces({});refreshUI();setTab('fashion');visualChange({recreate:true,rebuild:true});studioControls?.resetHistory();
  await saveProject('autosave',projectSnapshot());await refreshSlots();status('Male-piloten är klar. Välj färger och tryck och klicka Prova i privat match. Föregående projekt finns i ateljén.');
 }catch(e){status('Kunde inte skapa piloten: '+e.message,true);}finally{main.inert=false;}
}
async function start(){
 workbench.faceCanvas=$('face-base');
 $('private-match').onclick=()=>saveGameCharacter(true);$('save-game-character').onclick=()=>saveGameCharacter(false);$('new-match-pilot').onclick=createMatchPilot;
 creativeControls=installCreativeControls({getProject:()=>project,workbench,persist,visualChange,status,download});
 installEvents();setupQuickStudio();initDrawing();
 studioControls=installStudioControls({getProject:()=>project,workbench,persist,visualChange,status,selected,getSelectedId:()=>selectedPart,selectPart:id=>{selectedPart=id;setTab('parts');partsSummary();},refresh:refreshUI,restore:async p=>{project=p;restoreAttachments();await workbench.prepareAssets(p);refreshUI();visualChange({recreate:true,rebuild:true});saveLocal();}});
 $('accessory-file').addEventListener('change',e=>addReferences(e,true));
 const zone=$('model-drop-zone');zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('drop-active');});zone.addEventListener('dragleave',()=>zone.classList.remove('drop-active'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('drop-active');addReferences({target:{files:e.dataTransfer.files,value:''}},true);});
 $('save-slot').addEventListener('click',async()=>{try{slotId??=crypto.randomUUID();await saveProject(slotId,projectSnapshot());await flushLocalSave();await refreshSlots();status('Karaktären är sparad i ateljén, inklusive tillgångar och ritningar.');}catch(e){status('Sparningen misslyckades: '+e.message,true);}});
 $('saved-projects').addEventListener('change',async e=>{const id=e.target.value;if(!id)return;try{const item=await loadProject(id);if(!item)throw Error('Projektet finns inte.');await importProject(new File([JSON.stringify(item.project)],'projekt.json'));slotId=id;}catch(error){status(error.message,true);}});
 try{
  const saved=await loadProject('autosave').catch(()=>null);if(saved){validateProject(saved.project);ensureCreative(saved.project);project=saved.project;}restoreAttachments();
  await workbench.initialize();await workbench.prepareAssets(project);ready=true;
  refreshUI();
  workbench.flipped=!!project.view_flip;workbench.update(project,{recreate:true,rebuild:true});partsSummary();
  creativeControls.syncClips();
  await restoreArtwork(project.artwork);await creativeControls.restoreFaces(project.artwork?.faceViews);
  studioControls.resetHistory();await refreshSlots();$('save-state').textContent='Projektet är öppet · automatisk sparning';
  if(new URLSearchParams(location.search).has('test'))window.__characterStudio={get project(){return project;},workbench,runtimeExport:()=>runtimeExport(projectSnapshot(),workbench),setProject:async p=>{validateProject(p);project=structuredClone(p);restoreAttachments();await workbench.prepareAssets(project);refreshUI();visualChange({recreate:true,rebuild:true});},changeRole:changeActorRole};
  status('Studion är redo! Ändra en färg, lägg till en 3D-del eller skapa en helt ny karaktär.');
 }catch(error){
  console.error(error);status('Kunde inte starta WebGL eller ladda spelets originalmodeller: '+error.message,true);
  $('export-zip').disabled=true;$('save-glb').disabled=true;
  const notice=document.createElement('div');notice.className='webgl-notice';notice.setAttribute('role','alert');const message=document.createElement('p');message.textContent='3D-visningen kunde inte starta i denna webbläsare. Ditt sparade projekt finns kvar. Prova en webbläsare med WebGL aktiverat.';const retry=document.createElement('button');retry.textContent='Försök igen';retry.onclick=()=>location.reload();notice.append(message,retry);$('model-drop-zone').append(notice);
 }
}
window.addEventListener('resize',()=>{if(ready)workbench.renderPreview();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushLocalSave();});
window.addEventListener('pagehide',()=>flushLocalSave());
start();

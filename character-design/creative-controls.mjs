/** Optional beginner-friendly creative controls. Owns face drawing and PNG art, not game state. */
import {makeCreative,ensureCreative,FACE_CHOICES,REQUEST_ANIMATIONS} from './creative-schema.mjs?v=6.1.2';
const $=id=>document.getElementById(id);
const VIEWS=['front','left','right'];
const LABELS={front:'Framifrån',left:'Vänster profil',right:'Höger profil'};
const WIDTH=1024;
const DATA_URL=/^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
function toBlob(canvas){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(Error('Bilden kunde inte sparas.')),'image/png'));}
function decodeImage(src){
 return new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>rej(Error('Ogiltig bild.'));img.src=src;});
}
function printArray(data){
 if(typeof data!=='string'||!DATA_URL.test(data))throw Error('PNG saknas eller är skadad.');
 const binary=atob(data.split(',')[1]);const out=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;
}
export function installCreativeControls({getProject,workbench,persist,visualChange,status,download}){
 const faceBase=$('face-base'),faceInk=document.querySelector('[data-ink="face"]');
 const layer=$('face-image-layer'),wrapper=$('face-canvas-wrap');
 const ctx=faceInk.getContext('2d');
 const faceViews={front:null,left:null,right:null};
 const history=[];
 let faceView='front',zoom=1,panMode=false,panX=0,panY=0,pointer=null,lastX=0,lastY=0,stroke=false;
 let throttled=false;
 const creative=()=>ensureCreative(getProject());
 function drawUpdates(){
  if(throttled)return;
  throttled=true;
  requestAnimationFrame(()=>{throttled=false;visualChange({save:false});});
 }
 function commit(appearance=false){
  if(appearance)drawUpdates();
  persist();
 }
 function transform(){layer.style.transform='translate('+panX+'px,'+panY+'px) scale('+zoom+')';}
 function snapshot(){faceViews[faceView]=faceInk.toDataURL('image/png');}
 function clearFaceSurface(){ctx.clearRect(0,0,WIDTH,WIDTH);}
 async function showFace(view,{saveOld=true}={}){
  if(saveOld)snapshot();
  if(!VIEWS.includes(view))view='front';
  faceView=view;
  creative().faceView=view;
  clearFaceSurface();
  const image=faceViews[view];
  if(typeof image==='string'&&DATA_URL.test(image)){
   try{const img=await decodeImage(image);if(faceView===view)ctx.drawImage(img,0,0,WIDTH,WIDTH);}
   catch{status('Kunde inte läsa den sparade ansiktsritningen.',true);}
  }
  $('face-angle').value=view;
  workbench.faceView=view;
  workbench.renderFace(view);
 }
 function captureFaces(){
  snapshot();
  return {...faceViews};
 }
 async function restoreFaces(saved){
  const collection=saved&&typeof saved==='object'?saved:{};
  for(const view of VIEWS){
   const value=collection[view];
   faceViews[view]=typeof value==='string'&&value.length<1200000&&DATA_URL.test(value)?value:null;
  }
  faceView=creative().faceView;
  await showFace(faceView,{saveOld:false});
  history.length=0;zoom=1;panX=panY=0;transform();
  $('face-zoom').value=100;$('face-zoom-value').textContent='100 %';
  setPan(false);
 }
 function setPan(value){
  panMode=value;$('face-pan').setAttribute('aria-pressed',String(value));
  $('face-pan').textContent=value?'Klar – börja rita':'Flytta bilden';
  faceInk.style.cursor=value?'grab':'crosshair';
 }
 function point(e){
  const r=faceInk.getBoundingClientRect();
  return [(e.clientX-r.left)*WIDTH/r.width,(e.clientY-r.top)*WIDTH/r.height];
 }
 faceInk.addEventListener('pointerdown',e=>{
  if(pointer!==null)return;
  e.preventDefault();pointer=e.pointerId;
  faceInk.setPointerCapture(pointer);lastX=e.clientX;lastY=e.clientY;
  if(panMode)return;
  history.push({view:faceView,png:faceInk.toDataURL('image/png')});if(history.length>20)history.shift();
  stroke=true;
  const [x,y]=point(e);
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+.02,y+.02);
  ctx.strokeStyle=$('face-pen-color').value;ctx.lineWidth=Number($('face-pen-size').value);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
 });
 faceInk.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  e.preventDefault();
  if(panMode){panX+=e.clientX-lastX;panY+=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;transform();return;}
  const [x,y]=point(e);ctx.lineTo(x,y);ctx.stroke();
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])faceInk.addEventListener(type,e=>{
  if(e.pointerId!==pointer)return;
  pointer=null;
  if(stroke){ctx.closePath();snapshot();persist();stroke=false;}
 });
 $('face-pan').addEventListener('click',()=>setPan(!panMode));
 $('face-center').addEventListener('click',()=>{
  panX=panY=0;zoom=1;$('face-zoom').value=100;$('face-zoom-value').textContent='100 %';transform();
 });
 $('face-zoom').addEventListener('input',e=>{
  zoom=Number(e.target.value)/100;$('face-zoom-value').textContent=e.target.value+' %';transform();
 });
 $('face-angle').addEventListener('change',async e=>{await showFace(e.target.value);persist();});
 $('face-clear').addEventListener('click',()=>{
  history.push({view:faceView,png:faceInk.toDataURL('image/png')});
  clearFaceSurface();snapshot();persist();
 });
 $('face-undo').addEventListener('click',async()=>{
  let n=history.length-1;while(n>=0&&history[n].view!==faceView)n--;
  if(n<0){status('Inga fler streck att ångra på denna sida.');return;}
  const item=history.splice(n,1)[0];clearFaceSurface();
  try{ctx.drawImage(await decodeImage(item.png),0,0,WIDTH,WIDTH);snapshot();persist();}
  catch{status('Kunde inte ångra strecket.',true);}
 });
 $('jump-to-face').addEventListener('click',()=>{
  workbench.focus='head';workbench.zoom=1;workbench.renderPreview();
  $('face-detail-section').scrollIntoView({behavior:'smooth',block:'start'});
 });
 $('focus-head').addEventListener('click',()=>{workbench.focus='head';workbench.zoom=1;workbench.renderPreview();});
 $('focus-body').addEventListener('click',()=>{workbench.focus='body';workbench.zoom=1;workbench.renderPreview();});
 for(const input of document.querySelectorAll('[data-face-field]')){
  const field=input.dataset.faceField,choices=FACE_CHOICES[field];
  if(choices&&input.tagName==='SELECT'){
   input.replaceChildren(...choices.map(value=>{const o=document.createElement('option');o.value=o.textContent=value;return o;}));
  }
  input.addEventListener('change',()=>{
   creative().face[field]=input.value;for(const peer of document.querySelectorAll('[data-face-field]'))if(peer.dataset.faceField===field)peer.value=input.value;commit(true);
  });
 }
 function syncRealismControls(){const r=creative().realism;for(const input of document.querySelectorAll('[data-face-field=eyes],[data-face-field=eyeColor],[data-face-field=eyebrows],#tab-sculpt [data-color=eyes]')){input.disabled=r.head==='scan';input.title=r.head==='scan'?'Det skannade porträttet har slutna, fotograferade ögon. Forma huden direkt.':'';}for(const [key,label] of [['hairLength','hair-length-value'],['hairVolume','hair-volume-value'],['garmentLength','garment-length-value']]){const input=$('realism-'+key);input.disabled=key==='garmentLength'?r.garment==='none':!r.fiberHair;$(label).textContent=(r[key]??100)+' %';} $('realism-fiberHair').checked=r.fiberHair;$('realism-wind').disabled=r.garment==='none';$('settle-cloth').disabled=r.garment==='none';}
 for(const key of ['head','fiberHair','fabric','garment','wind','hairLength','hairVolume','garmentLength'])$('realism-'+key).addEventListener('change',e=>{const r=creative().realism;workbench.playing=false;r[key]=key==='fiberHair'?e.target.checked:['wind','hairLength','hairVolume','garmentLength'].includes(key)?Number(e.target.value):e.target.value;if(key==='head'&&r.head==='scan'){getProject().palette.skin='#ffffff';getProject().base.template='civilian';creative().hair='bald';for(const peer of document.querySelectorAll('[data-color=skin]'))peer.value='#ffffff';}if(r.fiberHair&&['original','bald','swept'].includes(creative().hair))creative().hair='short';syncRealismControls();$('hair-style').value=creative().hair;$('fabric-material').closest('label').hidden=r.fabric!=='original';visualChange({recreate:key==='head',save:false});persist({force:true});status('Material och tygfall uppdaterade. Spela en rörelse för att se fysiken.');});
 for(const [key,label] of [['hairLength','hair-length-value'],['hairVolume','hair-volume-value'],['garmentLength','garment-length-value']])$('realism-'+key).addEventListener('input',e=>{$(label).textContent=e.target.value+' %';});
 $('settle-cloth').addEventListener('click',()=>{workbench.cloth.reset();workbench.cloth.settle(240);workbench.renderSheet();status(workbench.cloth.mesh?'Tyget har draperats med gravitation och kroppskollisioner.':'Välj axelkappa eller långväst först.');});
 $('hair-style').addEventListener('change',e=>{creative().hair=e.target.value;if(['original','bald','swept'].includes(e.target.value))creative().realism.fiberHair=false;syncRealismControls();commit(true);});
 $('outfit-style').addEventListener('change',e=>{creative().outfit=e.target.value;commit(true);});
 const printFields=[
  ['shirt-text','text'],['shirt-font','font'],['shirt-position','position'],
  ['shirt-color','color'],['shirt-size','size'],['shirt-image-mode','imageMode'],['shirt-image-scale','imageScale']
 ];
 for(const [id,key]of printFields){
  $(id).addEventListener(id==='shirt-text'?'input':'change',e=>{
   creative().print[key]=['size','imageScale'].includes(key)?Number(e.target.value):e.target.value;
   $('shirt-size-value').textContent=creative().print.size;
   $('shirt-image-scale-value').textContent=creative().print.imageScale+' %';
   commit(true);
  });
 }
 $('shirt-png').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';
  if(!file)return;
  try{
   if(!file.name.toLowerCase().endsWith('.png')||file.size>5*1024*1024||file.size===0)
    throw Error('Välj en PNG på högst 5 MB.');
   const header=new Uint8Array(await file.slice(0,8).arrayBuffer());
   if(header.length!==8||![137,80,78,71,13,10,26,10].every((x,i)=>header[i]===x))throw Error('Det här är inte en riktig PNG-fil.');
   const bitmap=await createImageBitmap(file);
   if(!bitmap.width||!bitmap.height||bitmap.width>4096||bitmap.height>4096||bitmap.width*bitmap.height>8e6){
    bitmap.close();throw Error('PNG-bilden har för hög upplösning (max 8 megapixlar).');
   }
   bitmap.close();
   const imageData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Kunde inte läsa PNG'));reader.readAsDataURL(file);});
   if(imageData.length>7_000_000)throw Error('PNG är för stor.');
   creative().print.imageData=imageData;
   creative().print.imageName=file.name.slice(0,100);
   refreshPrint();commit(true);
   status('Original-PNG är inläst utan omskalning. Det sparas i projektet och bifogas som SHIRT_ARTWORK.png.');
  }catch(error){status('Kunde inte läsa mönstret: '+error.message,true);}
 });
 $('remove-shirt-png').addEventListener('click',()=>{
  creative().print.imageData=null;creative().print.imageName=null;refreshPrint();commit(true);
 });
 function refreshPrint(){
  const p=creative().print;
  $('shirt-picture').hidden=!p.imageData;
  if(p.imageData)$('shirt-preview').src=p.imageData;
  else $('shirt-preview').removeAttribute('src');
 }
 // Dynamically expose EVERY actual embedded original animation, rather than listing
 // arbitrary clips that may not be provided by the source GLB.
 const translate={
  Idle_Loop:'Stå still',Walk_Loop:'Gå',Jog_Fwd_Loop:'Jogga',Sprint_Loop:'Spring snabbt',
  Jump_Loop:'Hoppa',Crouch_Idle_Loop:'Huka',Crouch_Fwd_Loop:'Gå hukande',
  Pistol_Idle_Loop:'Håll pistol',Pistol_Shoot:'Skjut',Pistol_Reload:'Ladda om',Death01:'Dödsanimation'
 };
 let lastClips='';
 function syncClips(){
  if(getProject().kind!=='character')return;
  const clips=workbench.getClips();
  const key=clips.join('|');if(key===lastClips)return;
  lastClips=key;
  const menu=$('pose');menu.replaceChildren();
  for(const name of clips){
   const option=document.createElement('option');option.value=name;option.textContent=(translate[name]||name.replaceAll('_',' '))+' · '+name;
   menu.append(option);
  }
  const requested=getProject().pose;
  if(clips.includes(requested))menu.value=requested;
  else if(clips.includes('Idle_Loop')){
   getProject().pose='Idle_Loop';menu.value='Idle_Loop';
  }
 }
 for(const [id,label]of Object.entries(REQUEST_ANIMATIONS)){
  const input=document.createElement('input');input.type='checkbox';input.value=id;
  const item=document.createElement('label');item.append(input,document.createTextNode(label));
  $('requested-animations').append(item);
  input.addEventListener('change',()=>{
   const c=creative(),set=new Set(c.requestedAnimations);
   if(input.checked)set.add(id);else set.delete(id);
   c.requestedAnimations=[...set];persist();
  });
 }
 $('anim-speed').addEventListener('input',e=>{
  workbench.animationSpeed=Number(e.target.value)/100;
  $('anim-speed-value').textContent=workbench.animationSpeed+'×';
 });
 $('anim-scrub').addEventListener('input',e=>{
  workbench.scrub(Number(e.target.value)/100);
  $('play').textContent='▶ Spela rörelsen';$('play').setAttribute('aria-pressed','false');
 });
 function refresh(){
  const c=creative();syncRealismControls();
  for(const key of ['head','fiberHair','fabric','garment','wind','hairLength','hairVolume','garmentLength']){const input=$('realism-'+key);if(key==='fiberHair')input.checked=c.realism[key];else input.value=c.realism[key];}
  $('fabric-material').closest('label').hidden=c.realism.fabric!=='original';
  $('outfit-style').value=c.outfit;$('hair-style').value=c.hair;
  for(const input of document.querySelectorAll('[data-face-field]'))input.value=c.face[input.dataset.faceField];
  for(const [id,key]of printFields)$(id).value=c.print[key];
  $('shirt-size-value').textContent=c.print.size;
  $('shirt-image-scale-value').textContent=c.print.imageScale+' %';
  refreshPrint();
  for(const input of $('requested-animations').querySelectorAll('input'))input.checked=c.requestedAnimations.includes(input.value);
  faceView=c.faceView;workbench.faceView=faceView;$('face-angle').value=faceView;
  $('face-detail-section').hidden=getProject().kind==='object';
  syncClips();
  workbench.renderFace(faceView);
 }
 async function composedFace(view){
  const current=faceView;
  snapshot();workbench.renderFace(view);
  const out=document.createElement('canvas');out.width=out.height=WIDTH;
  const g=out.getContext('2d');g.drawImage(faceBase,0,0,WIDTH,WIDTH);
  const drawing=faceViews[view];
  if(drawing){try{g.drawImage(await decodeImage(drawing),0,0,WIDTH,WIDTH);}catch{}}
  // Reference and angle label are embedded in the image, never as text over face.
  g.fillStyle='#173843';g.fillRect(0,0,WIDTH,45);g.fillStyle='#ffffff';g.font='bold 22px Arial';
  g.fillText('FACE DETAIL / '+LABELS[view],25,31);
  const blob=await toBlob(out);
  workbench.renderFace(current);workbench.renderPreview();
  return blob;
 }
 $('export-face').addEventListener('click',async()=>{
  try{
   const face=await composedFace(faceView);download(face,'face-'+faceView+'-detail.png','image/png');
   status('Ansiktsnärbilden exporterad i 1024×1024.');
  }catch(error){status(error.message,true);}
 });
 async function exportEntries(){
  if(getProject().kind!=='character')return [];
  const entries=[];
  for(const view of VIEWS){
   const image=await composedFace(view);
   entries.push({name:'FACE_'+view.toUpperCase()+'.png',data:new Uint8Array(await image.arrayBuffer())});
  }
  const p=creative().print;
  if(p.imageData)entries.push({name:'SHIRT_ARTWORK.png',data:printArray(p.imageData)});
  return entries;
 }
 return {refresh,syncClips,restoreFaces,captureFaces,exportEntries};
}

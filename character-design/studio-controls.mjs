import {installSculptControls} from './sculpt-controls.mjs?v=6.1.2';
/** Small studio controller: reversible edits, layers and direct touch/mouse manipulation. */
import * as T from '../vendor/three/three.module.js';
import {ensureCreative} from './creative-schema.mjs?v=6.1.2';
const $=id=>document.getElementById(id),clamp=T.MathUtils.clamp;
function copy(p){
 // Asset strings are immutable: share them across history entries rather than
 // serializing megabytes on every pointer movement. Editable fields are cloned.
 const creative=p.creative?{...p.creative,print:{...p.creative.print,imageData:null}}:undefined;
 const next=structuredClone({...p,creative,embeddedReferences:undefined,artwork:undefined});
 if(next.creative)next.creative.print.imageData=p.creative.print.imageData;
 next.embeddedReferences=p.embeddedReferences?{...p.embeddedReferences}:undefined;next.artwork=p.artwork;return next;
}
export function installStudioControls({getProject,workbench,persist,visualChange,status,selected,selectPart,refresh,restore}){
 let states=[],index=-1,restoring=false,lastKey='',lastTime=0,dragMode='rotate';
 const mobileQuery=matchMedia('(max-width:640px)');$('viewer-tools').open=!mobileQuery.matches;mobileQuery.addEventListener('change',()=>{$('viewer-tools').open=!mobileQuery.matches;});
 const sculpt=installSculptControls({getProject,workbench,persist,visualChange,status,refresh,onSelect:()=>{dragMode='rotate';for(const id of ['drag-print','drag-part','pan-view'])$(id).setAttribute('aria-pressed','false');$('model-drop-zone').classList.remove('editing');}});
 const canvas=$('preview3d'),pointers=new Map();let lastPoint=null,pinch=null;
 function updateHistory(){ $('undo-design').disabled=index<=0;$('redo-design').disabled=index>=states.length-1; }
 function resetHistory(){states=[copy(getProject())];index=0;lastKey='';updateHistory();}
 function record({force=false}={}){
  if(restoring)return;
  const now=Date.now(),key=document.activeElement?.id||'';
  const comparable=p=>JSON.stringify({...p,embeddedReferences:Object.keys(p.embeddedReferences||{}),artwork:undefined,creative:p.creative?{...p.creative,print:{...p.creative.print,imageData:p.creative.print.imageName}}:undefined});
  if(states[index]&&comparable(states[index])===comparable(getProject()))return;
  states.splice(index+1);
  if(!force&&key&&key===lastKey&&now-lastTime<700&&index>0)states[index]=copy(getProject());
  else{states.push(copy(getProject()));index++;if(states.length>25){states.shift();index--;}}
  lastKey=key;lastTime=now;updateHistory();
 }
 async function travel(delta){
  if(restoring||!states[index+delta])return;restoring=true;
  try{index+=delta;await restore(copy(states[index]));lastKey='';updateHistory();status(delta<0?'Ändringen ångrades.':'Ändringen gjordes om.');}
  catch(e){status('Kunde inte återställa: '+e.message,true);}finally{restoring=false;}
 }
 $('undo-design').addEventListener('click',()=>travel(-1));$('redo-design').addEventListener('click',()=>travel(1));
 document.addEventListener('keydown',e=>{
  if(!e.ctrlKey&&!e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key.toLowerCase()==='z'){e.preventDefault();if(sculpt.active){sculpt.cancel();return;}travel(e.shiftKey?1:-1);}
 });
 const fields=[['shoe-style','shoes'],['glove-style','gloves'],['garment-fit','fit'],['fabric-material','roughness'],['vest-layer','vest']];
 for(const [id,key]of fields)$(id).addEventListener(id==='garment-fit'?'input':'change',e=>{
  const c=ensureCreative(getProject());c[key]=id==='vest-layer'?e.target.checked:['fit','roughness'].includes(key)?Number(e.target.value):e.target.value;
  $('fit-value').textContent=c.fit+' %';visualChange({save:false});persist();
 });
 for(const [id,key]of [['print-x','x'],['print-y','y'],['print-rotation','rotation'],['print-scale','scale']])$(id).addEventListener('input',e=>{
  ensureCreative(getProject()).printTransform[key]=Number(e.target.value);workbench.pose('Idle_Loop',false);visualChange({save:false});persist();
 });
 function setDrag(mode){
  const next=dragMode===mode?'rotate':mode;sculpt.select('rotate');
  dragMode=next;
  for(const [id,value]of [['drag-print','print'],['drag-part','part'],['pan-view','pan']])$(id).setAttribute('aria-pressed',String(dragMode===value));
  $('model-drop-zone').classList.toggle('editing',dragMode==='print'||dragMode==='part');
  if(dragMode==='print'){workbench.yaw=getProject().creative.print.position==='back'?Math.PI:0;workbench.pitch=0;workbench.renderPreview();}
  status(dragMode==='rotate'?'Dra för att rotera modellen.':dragMode==='part'?'Dra vald del i 3D. Använd djupreglaget för avstånd från kroppen.':dragMode==='print'?'Dra över tröjan för att placera trycket.':'Dra för att flytta vyn.');
 }
 for(const [id,mode]of [['drag-print','print'],['drag-part','part'],['pan-view','pan']])$(id).addEventListener('click',()=>setDrag(mode));
 $('focus-shoes').addEventListener('click',()=>{sculpt.select('rotate');workbench.focus='shoes';workbench.zoom=1;workbench.pan.set(0,0);workbench.renderPreview();});
 for(const id of ['focus-head','focus-body'])$(id).addEventListener('click',()=>{if(id==='focus-body')sculpt.select('rotate');workbench.pan.set(0,0);workbench.renderPreview();});
 for(const b of document.querySelectorAll('[data-camera]'))b.addEventListener('click',()=>{workbench.yaw={front:0,back:Math.PI,left:-Math.PI/2,right:Math.PI/2}[b.dataset.camera];workbench.pitch=0;workbench.pan.set(0,0);workbench.renderPreview();});
 $('toggle-part').addEventListener('click',()=>{const p=selected();if(!p)return;p.visible=!p.visible;visualChange({rebuild:true});persist();refresh();});
 $('reset-part').addEventListener('click',()=>{const p=selected();if(!p)return;if(p.preset)workbench.fitPart(p);else{p.rotation=[0,0,0];p.dimensions=[.25,.25,.25];p.position=getProject().kind==='object'?[0,.4,0]:[0,1.25,.16];}visualChange({rebuild:true});persist();refresh();});
 $('fit-part').addEventListener('click',()=>{const p=selected();if(!p)return;if(!workbench.fitPart(p)){status('Anpassa importerade modeller med måttreglagen.');return;}visualChange({rebuild:true});persist();refresh();status('Tillbehöret har anpassats till denna grundkropp.');});
 const ray=new T.Raycaster(),ndc=new T.Vector2();
 function hit(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,workbench.camera);return ray.intersectObjects([...workbench.partMeshes.values()],true).find(h=>h.object.visible);}
 canvas.addEventListener('pointerdown',e=>{
  if(!workbench.initialized)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});lastPoint={x:e.clientX,y:e.clientY};
  if(pointers.size===2){sculpt.cancel();const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};return;}
  if(pointers.size===1&&sculpt.editing&&sculpt.begin(e))return;
  if(!sculpt.editing&&(dragMode==='rotate'||dragMode==='part')){
   const h=hit(e);let o=h?.object;while(o&&!o.userData.designId)o=o.parent;if(o)selectPart(o.userData.designId);
  }
 });
 canvas.addEventListener('pointermove',e=>{
  sculpt.hover(e);if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const r=canvas.getBoundingClientRect(),span=workbench.getFraming().span/workbench.zoom;
  if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
   if(pinch){workbench.zoom=clamp(workbench.zoom*distance/Math.max(1,pinch.distance),.5,6);workbench.pan.x-=(x-pinch.x)*span/r.height;workbench.pan.y+=(y-pinch.y)*span/r.height;}
   pinch={distance,x,y};workbench.renderPreview();return;
  }
  if(sculpt.active){sculpt.move(e);return;}
  if(!lastPoint)return;const dx=e.clientX-lastPoint.x,dy=e.clientY-lastPoint.y;lastPoint={x:e.clientX,y:e.clientY};
  if(dragMode==='pan'||e.shiftKey){workbench.pan.x-=dx*span/r.height;workbench.pan.y+=dy*span/r.height;}
  else if(dragMode==='print'){
   const t=ensureCreative(getProject()).printTransform;t.x=clamp(t.x+dx*span/r.height*100,-20,20);t.y=clamp(t.y-dy*span/r.height*100,-20,20);visualChange({save:false});refreshTransform();return;
  }else if(dragMode==='part'){
   const p=selected();if(!p)return;
   const delta=new T.Vector3(dx*span/r.height,-dy*span/r.height,0).applyQuaternion(workbench.camera.quaternion);
   if(getProject().kind==='character'){const inv=new T.Matrix4().copy(workbench.avatar.root.matrixWorld).invert();const origin=new T.Vector3().applyMatrix4(inv);delta.applyMatrix4(inv).sub(origin);}
   p.followsFace=false;p.position=p.position.map((v,i)=>clamp(v+delta.getComponent(i),-1.5,2.5));visualChange({rebuild:true,save:false});return;
  }else{workbench.yaw-=dx*.008;workbench.pitch=clamp(workbench.pitch+dy*.006,-.8,.8);}
  workbench.renderPreview();
 });
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{
  if(!pointers.has(e.pointerId))return;sculpt.end();pointers.delete(e.pointerId);pinch=null;lastPoint=null;
  if(dragMode==='print'||dragMode==='part'){persist();refresh();}
 });
 canvas.addEventListener('wheel',e=>{e.preventDefault();workbench.zoom=clamp(workbench.zoom*(e.deltaY>0?.9:1.1),.5,6);workbench.renderPreview();},{passive:false});
 function refreshTransform(){const t=ensureCreative(getProject()).printTransform;for(const [id,key]of [['print-x','x'],['print-y','y'],['print-rotation','rotation'],['print-scale','scale']])$(id).value=t[key];}
 function refreshControls(){sculpt.sync();const c=ensureCreative(getProject());for(const [id,key]of fields){if(id==='vest-layer')$(id).checked=c[key];else $(id).value=c[key];}$('fit-value').textContent=c.fit+' %';refreshTransform();updateHistory();}
 return {record,resetHistory,refresh:refreshControls,stopSculpt:()=>sculpt.select('rotate')};
}

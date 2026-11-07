/** Direct face manipulation. Pointer transactions are shared with the orbit,
 * pan and accessory controller; two-finger gestures cancel an unfinished stroke. */
import * as T from '../vendor/three/three.module.js';
const $=id=>document.getElementById(id);
export function installSculptControls({getProject,workbench,persist,visualChange,status,refresh,onSelect}){
 const canvas=$('preview3d'),cursor=$('sculpt-cursor'),ray=new T.Raycaster(),ndc=new T.Vector2();
 let mode='rotate',active=false,start=null,plane=null,inverse=null,pending=null,frame=null;
 const settings=()=>({mode,radius:Number($('sculpt-radius').value)/1000,strength:Number($('sculpt-strength').value)/100,symmetry:$('sculpt-symmetry').checked,color:new T.Color($('sculpt-color').value)});
 function setRay(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,workbench.camera);}
 function hit(e){if(!workbench.avatar||getProject().kind!=='character')return null;setRay(e);workbench.avatar.holder.updateWorldMatrix(true,true);return ray.intersectObjects(workbench.sculpt.entries.filter(v=>v.mesh.visible&&(mode==='grab'||v.key==='face-skin')).map(v=>v.mesh),false)[0]||null;}
 function hover(e){
  if(mode==='rotate'||!workbench.initialized||active||e.buttons){cursor.hidden=true;return;}
  const target=hit(e);if(!target){cursor.hidden=true;return;}
  const rect=canvas.getBoundingClientRect(),frameRect=$('model-drop-zone').getBoundingClientRect(),framing=workbench.getFraming();
  const diameter=settings().radius*workbench.avatar.scale*rect.height/(framing.span/workbench.zoom)*2;
  cursor.hidden=false;cursor.style.width=cursor.style.height=diameter+'px';cursor.style.left=(e.clientX-frameRect.left)+'px';cursor.style.top=(e.clientY-frameRect.top)+'px';
 }
 function select(next){
  end();onSelect?.();mode=next;
  for(const b of document.querySelectorAll('[data-sculpt-tool]')){b.classList.toggle('active',b.dataset.sculptTool===mode);b.setAttribute('aria-pressed',String(b.dataset.sculptTool===mode));}
  document.querySelector('.preview-hint').textContent=mode==='rotate'?'Dra: rotera · Nyp: zooma · Två fingrar: flytta':mode==='grab'?'Dra i huden · Profil ändrar djup · Två fingrar styr vyn':'För penseln över huden · Ångra tar tillbaka steget';
  canvas.style.cursor=mode==='rotate'?'grab':'crosshair';cursor.hidden=true;
  $('sculpt-feedback').textContent={rotate:'Dra för att rotera. Välj ett verktyg för att forma.',grab:'Ta tag i huden och dra. Byt till profil för att ändra djup.',inflate:'Dra penseln över huden för att bygga mjuk volym.',deflate:'Dra penseln över huden för att trycka in formen.',smooth:'Mjukar upp de ändringar du har gjort.',paint:'Dra penseln över huden för att måla din valda färg.',restore:'Sudda lokalt bort din formning och målning.'}[mode];
  if(mode!=='rotate'&&workbench.initialized){if(getProject().pose!=='Idle_Loop'){getProject().pose='Idle_Loop';$('pose').value='Idle_Loop';persist();}workbench.playing=false;workbench.pose('Idle_Loop');workbench.focus='head';workbench.zoom=1;workbench.pan.set(0,0);workbench.renderPreview();$('play').textContent='▶ Spela rörelsen';$('play').setAttribute('aria-pressed','false');}
 }
 function begin(e){
  if(mode==='rotate'||e.button===2||e.altKey)return false;
  const target=hit(e);if(!target)return false;
  const engine=workbench.sculpt;
  if(!engine.begin(getProject(),target,settings()))return false;
  active=true;start=target.point.clone();plane=new T.Plane().setFromNormalAndCoplanarPoint(workbench.camera.getWorldDirection(new T.Vector3()),start);
  const entry=engine.entries.find(v=>v.mesh===target.object);
  // Same matrix as the actual weighted vertex, including body proportions.
  inverse=engineMatrix(entry.mesh,target.face.a).invert();cursor.hidden=true;
  if(mode!=='grab')update(e);return true;
 }
 // Filled by a static import at module load, without exposing test globals.
 function engineMatrix(mesh,index){return skinMatrix(mesh,index);}
 function update(e){
  if(!active)return;setRay(e);const engine=workbench.sculpt;
  if(mode==='grab'){
   const target=ray.ray.intersectPlane(plane,new T.Vector3());if(!target)return;
   const a=start.clone().applyMatrix4(inverse),b=target.applyMatrix4(inverse),delta=b.sub(a);if(delta.length()>.06)delta.setLength(.06);
   engine.brush(getProject(),{delta});
  }else{
   const target=hit(e);if(!target)return;const bind=target.point.clone().applyMatrix4(engineMatrix(target.object,target.face.a).invert());engine.brush(getProject(),{center:bind,amount:Math.max(.25,e.pressure||.5)*2});
  }
  workbench.renderPreview();$('sculpt-feedback').textContent='Din form ändras direkt i 3D. Släpp för att spara steget.';
 }
 function move(e){if(!active)return;pending={clientX:e.clientX,clientY:e.clientY,pressure:e.pressure};if(frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;const event=pending;pending=null;if(event)update(event);});}
 function end(){
  if(!active)return;
  if(frame!==null){cancelAnimationFrame(frame);frame=null;}if(pending){update(pending);pending=null;}
  active=false;if(workbench.sculpt.finish(getProject())){visualChange({rebuild:true,save:false});persist({force:true});$('sculpt-feedback').textContent='Sparat steg. Fortsätt forma, eller välj Ångra.';}cursor.hidden=true;
 }
 function cancel(){
  if(frame!==null)cancelAnimationFrame(frame);frame=null;pending=null;if(active){const changed=workbench.sculpt.stroke?.changed;workbench.sculpt.cancel(getProject());if(changed)persist();}active=false;cursor.hidden=true;workbench.renderPreview();
 }
 for(const b of document.querySelectorAll('[data-sculpt-tool]'))b.addEventListener('click',()=>select(b.dataset.sculptTool));
 for(const b of document.querySelectorAll('[data-sculpt-view]'))b.addEventListener('click',()=>{
  end();workbench.focus='head';workbench.yaw={front:0,left:-Math.PI/2,right:Math.PI/2,back:Math.PI}[b.dataset.sculptView];workbench.pitch=0;workbench.zoom=1;workbench.pan.set(0,0);workbench.renderPreview();
 });
 $('sculpt-radius').addEventListener('input',()=>{$('sculpt-radius-value').textContent=Number($('sculpt-radius').value)/10+' cm';});
 $('sculpt-strength').addEventListener('input',()=>{$('sculpt-strength-value').textContent=$('sculpt-strength').value+' %';});
 $('sculpt-reset').addEventListener('click',()=>{end();workbench.sculpt.reset(getProject(),true);visualChange({rebuild:true,save:false});persist({force:true});status('Din fria formning och målning är återställd. Ångra kan ta tillbaka den.');});
 $('sculpt-focus').addEventListener('click',()=>{select('grab');workbench.yaw=0;workbench.pitch=0;workbench.renderPreview();canvas.scrollIntoView({behavior:'auto',block:'center'});});
 canvas.addEventListener('pointerleave',()=>{cursor.hidden=true;});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 function sync(){cursor.hidden=true;if(getProject().kind==='object')select('rotate');}
 return {select,begin,move,end,cancel,hover,sync,get editing(){return mode!=='rotate';},get active(){return active;}};
}
import {skinMatrix} from './sculpt-engine.mjs?v=6.1.2';

/** Small projected 3D handles; uses the editor camera and existing project/undo state. */
import * as T from '../vendor/three/three.module.js';
import {furnitureHandleFrame} from './furniture-translation.mjs?v=5.8.1';
const vec=p=>new T.Vector3(p.x,p.y,p.z);
export function installFurnitureHandles({canvas,camera,getSelection,getWalls,onBegin,onDrag,onFinish,onCancel,onHint,onCameraGesture,onWheel,isCameraGesture}){
 const root=document.createElement('div');root.id='furnitureHandles';root.className='furniture-handles';root.hidden=true;root.setAttribute('aria-label','Flytta markerad möbel i 3D');canvas.parentElement.append(root);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');root.append(svg);
 const buttons=new Map(),lines=new Map(),labels={x:'Sidled',z:'Djup',height:'Höjd',move:'Flytta'};
 let frame=null,gesture=null;
 const ray=new T.Raycaster();
 function project(p){const v=vec(p).project(camera),r=canvas.getBoundingClientRect();return {x:(v.x+1)*r.width/2,y:(1-v.y)*r.height/2,z:v.z};}
 function hit(e,plane){const r=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);return ray.ray.intersectPlane(plane,new T.Vector3());}
 function finish(cancel=false){if(!gesture)return;const old=gesture;gesture=null;root.classList.remove('dragging');old.button.classList.remove('active');if(old.button.hasPointerCapture(old.pointerId))old.button.releasePointerCapture(old.pointerId);cancel?onCancel(old.token):onFinish(old.token);update();}
 for(const key of ['x','z','height','move']){
  const button=document.createElement('button');button.type='button';button.dataset.furnitureHandle=key;button.className='furniture-handle handle-'+key;
  button.innerHTML=`<span aria-hidden="true">${key==='move'?'✥':'➜'}</span><small>${labels[key]}</small>`;
  button.setAttribute('aria-label',key==='height'?'Höj eller sänk möbeln':key==='move'?'Flytta möbeln på ytan':'Flytta möbeln '+labels[key].toLowerCase());
  button.title='Dra handtaget. Piltangenter flyttar 0,1. Esc avbryter dragningen.';root.append(button);buttons.set(key,button);
  if(key!=='move'){const line=document.createElementNS(ns,'line');line.setAttribute('class','handle-line handle-'+key);svg.append(line);lines.set(key,line);}
  button.addEventListener('pointerdown',e=>{
   if(gesture)return;e.preventDefault();e.stopPropagation();
   if(e.button!==0||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||isCameraGesture?.(e)){onCameraGesture(e);return;}
   if(!frame)return;camera.updateMatrixWorld(true);const origin=vec(frame.origin),axis=key==='move'?null:vec(frame.axes[key]);
   let normal=vec(frame.normal);if(axis){normal=camera.position.clone().sub(origin);normal.addScaledVector(axis,-normal.dot(axis));if(normal.lengthSq()<1e-6)return;normal.normalize();}
   const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,origin),start=hit(e,plane);if(!start)return;
   const token=onBegin();if(!token)return;
   gesture={key,axis,plane,start,token,button,pointerId:e.pointerId};button.setPointerCapture(e.pointerId);button.classList.add('active');root.classList.add('dragging');onHint('Dra för att flytta. Släpp för att spara, Esc för att avbryta.');
  });
  button.addEventListener('pointermove',e=>{if(!gesture||e.pointerId!==gesture.pointerId)return;e.preventDefault();const point=hit(e,gesture.plane);if(!point)return;let delta=point.sub(gesture.start);if(gesture.axis)delta=gesture.axis.clone().multiplyScalar(Math.round(delta.dot(gesture.axis)*10)/10);else delta.set(Math.round(delta.x*10)/10,Math.round(delta.y*10)/10,Math.round(delta.z*10)/10);onDrag(gesture.token,{x:delta.x,y:delta.y,z:delta.z});update();});
  button.addEventListener('pointerup',e=>{if(gesture?.pointerId===e.pointerId)finish();});
  for(const event of ['pointercancel','lostpointercapture'])button.addEventListener(event,e=>{if(gesture?.pointerId===e.pointerId)finish(true);});
  button.addEventListener('keydown',e=>{if(gesture||!frame||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();const axis=key==='move'?(e.key==='ArrowUp'||e.key==='ArrowDown'?(frame.axes.z||frame.axes.height):frame.axes.x):frame.axes[key];const sign=['ArrowDown','ArrowLeft'].includes(e.key)?-1:1,token=onBegin();if(token){onDrag(token,{x:axis.x*.1*sign,y:axis.y*.1*sign,z:axis.z*.1*sign});onFinish(token);update();}});
 }
 root.addEventListener('contextmenu',e=>e.preventDefault());root.addEventListener('wheel',e=>{e.preventDefault();if(!gesture)onWheel(e);},{passive:false});
 document.addEventListener('keydown',e=>{if(!gesture)return;if(e.key==='Escape')finish(true);e.preventDefault();e.stopImmediatePropagation();},true);
 window.addEventListener('blur',()=>finish(true));window.addEventListener('resize',()=>finish(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(true);});
 function update(){const item=getSelection();if(!item){root.hidden=true;return;}frame=furnitureHandleFrame(item,getWalls());if(!frame){root.hidden=true;return;}
  camera.updateMatrixWorld(true);const r=canvas.getBoundingClientRect(),parent=canvas.parentElement.getBoundingClientRect(),anchor=project(frame.origin);
  root.hidden=canvas.hidden||anchor.z<-1||anchor.z>1||anchor.x<0||anchor.x>r.width||anchor.y<0||anchor.y>r.height;if(root.hidden)return;
  Object.assign(root.style,{left:(r.left-parent.left)+'px',top:(r.top-parent.top)+'px',width:r.width+'px',height:r.height+'px'});svg.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);
  for(const [key,button] of buttons){const axis=frame.axes[key];button.hidden=key!=='move'&&!axis;const line=lines.get(key);if(line)line.style.display=axis?'':'none';if(button.hidden)continue;
   let x=anchor.x,y=anchor.y;if(axis){const end=project({x:frame.origin.x+axis.x,y:frame.origin.y+axis.y,z:frame.origin.z+axis.z}),dx=end.x-anchor.x,dy=end.y-anchor.y,length=Math.hypot(dx,dy);button.disabled=length<.5;const scale=78/Math.max(.5,length);x+=dx*scale;y+=dy*scale;button.querySelector('span').style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;}
   // Keep complete touch targets inside the canvas near a viewport edge.
   x=Math.max(32,Math.min(r.width-32,x));y=Math.max(35,Math.min(r.height-35,y));
   if(line)for(const [k,v] of Object.entries({x1:anchor.x,y1:anchor.y,x2:x,y2:y}))line.setAttribute(k,v);
   button.style.left=x+'px';button.style.top=y+'px';
  }
  buttons.get('x').querySelector('small').textContent=item.wallMount?'Längs vägg':'Sidled';buttons.get('height').title=`Höjd över golvet: ${(item.elevation||0).toFixed(2)}. Dra uppåt/nedåt eller använd piltangenter.`;
 }
 return {update,cancel:()=>finish(true),get active(){return !!gesture;}};
}

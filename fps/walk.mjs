import {parseProject} from '../furniture-editor/build/level-project.mjs?v=5.9.0';
import {createWorld} from '../src/fps/world.mjs?v=5.9.0';
import {findWalkStart} from '../src/fps/walk-start.mjs';
import {Renderer} from '../src/fps/render.mjs?v=floor5-environment-1';

const canvas=document.getElementById('game'),message=document.getElementById('message'),hint=document.getElementById('hint');
const params=new URLSearchParams(location.search);document.body.classList.toggle('embedded',params.has('embed'));
let world,renderer,actor,yaw=0,pitch=0,last=0,time=0,raf=0,frames=0;const keys=new Set();
window.studioWalkPose=()=>actor?{x:actor.x,z:actor.z,yaw,pitch}:null;
const show=text=>{message.hidden=false;message.textContent=text;};
document.getElementById('exit').onclick=()=>{if(document.pointerLockElement)document.exitPointerLock();
 if(window.parent===window){history.back();return;}
 // Both documents are same-origin. Leave synchronously so a busy WebGL frame
 // cannot delay or drop the button's exit message during iframe teardown.
 try{if(window.parent.location.origin===location.origin&&typeof window.parent.__levelStudio?.leaveWalk==='function'){
  window.parent.__levelStudio.leaveWalk();return;
 }}catch{}
 window.parent.postMessage({type:'cartridge-walk-close'},location.origin);
};
document.addEventListener('keydown',e=>{if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape'].includes(e.code))e.preventDefault();keys.add(e.code);});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas)return;yaw-=e.movementX*.0022;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*.0022));});
canvas.addEventListener('click',()=>{canvas.focus();Promise.resolve(canvas.requestPointerLock?.()).catch(()=>{hint.textContent='Muslås saknas; använd piltangenter för att se dig omkring.';});});
document.addEventListener('pointerlockchange',()=>{hint.textContent=document.pointerLockElement===canvas?'W A S D: gå · mus: titta · Esc: släpp musen':'W A S D: gå · klicka i vyn för musstyrning · Esc: släpp musen';});
function frame(now){frames++;
 const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;time+=dt;
 if(keys.has('ArrowLeft'))yaw+=dt*1.8;if(keys.has('ArrowRight'))yaw-=dt*1.8;
 const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
 const sideways=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
 const length=Math.hypot(forward,sideways)||1,speed=2.8*dt/length;
 world.doors.update(time,dt,[actor]);
 if(forward||sideways)world.move(actor,(-Math.sin(yaw)*forward+Math.cos(yaw)*sideways)*speed,0,(-Math.cos(yaw)*forward-Math.sin(yaw)*sideways)*speed);
 renderer.camera.position.set(actor.x,actor.y+1.59,actor.z);renderer.camera.rotation.set(pitch,yaw,0);renderer.camera.updateMatrixWorld();
 renderer.updateLights(actor,time);renderer.facilityScene?.update(renderer.camera);renderer.renderer.render(renderer.scene,renderer.camera);
 raf=requestAnimationFrame(frame);
}
try{
 const saved=localStorage.getItem('cartridge-level-walk');if(!saved)throw Error('Ingen bana finns att utforska. Öppna promenadvyn från Designstudion.');
 const project=parseProject(saved),levelWorld=createWorld({levelProject:project,fresh:true});
 let start=findWalkStart(levelWorld);
 const x=Number(params.get('x')),z=Number(params.get('z')),angle=Number(params.get('yaw'));
 if(params.has('x')&&params.has('z')&&[x,z].every(v=>Number.isFinite(v)&&Math.abs(v)<=100)&&
  levelWorld.canOccupy(x,z,.22))start={x,z,yaw:Number.isFinite(angle)&&Math.abs(angle)<=Math.PI?angle:0};
 if(!start)throw Error('Ingen fri plats att stå på. Flytta ett föremål eller rita mer golv och prova igen.');
 world=levelWorld;actor={x:start.x,z:start.z,y:0,vy:0,radius:.22,height:1.7,alive:true};yaw=start.yaw;
 // Missing objectives are normal in a draft. Keep their visual markers off-map;
 // this is a renderer-only fallback and never changes the exported project.
 for(const kind of ['bomb','rescue'])if(!world.anchors[kind])world.anchors[kind]={x:1000,z:1000,radius:1};
 renderer=new Renderer(canvas,world,{graphics:'standard',mobile:false,reducedMotion:true});await renderer.assetsReady;
 message.hidden=true;last=performance.now();raf=requestAnimationFrame(frame);
 if(window.parent!==window)window.parent.postMessage({type:'cartridge-walk-ready'},location.origin);
 if(params.has('test'))window.__walk={world,renderer,actor,keys,get frames(){return frames;}};
}catch(error){show('Promenadvyn kunde inte öppnas: '+error.message);}
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);renderer?.dispose();});

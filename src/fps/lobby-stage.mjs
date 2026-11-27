// Cinematic lobby: renders the real authored operator (same character library and
// private-character install as the match) on a lit stage over the live level.
// Purely presentational — team/mode/character state stays owned by app.mjs.
import {UI_EN} from './english-ui.mjs';
import * as T from '../../vendor/three/three.module.js';
import {loadCharacterLibrary,createAuthoredAvatar,animateAuthored,disposeAvatar,setPrivateCharacterActors} from './character-library.mjs?v=6.1.2';

const $=id=>document.getElementById(id);
const menu=$('menu'),canvas=$('lobby-stage'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENT={analysts:0x3d8bff,counterAnalysts:0xe8a33d};

/* ---------- UI wiring (no state of its own) ---------- */
function syncTeam(){
  const sel=document.querySelector('.lobby .team-option.selected'),team=sel?.dataset.team||'analysts';
  menu.dataset.side=team;
  $('roster-analysts').textContent=team==='analysts'?'You + 4 bots':'5 bots';
  $('roster-counter').textContent=team==='counterAnalysts'?'You + 4 bots':'5 bots';
  $('lb-team-name').textContent=sel?.querySelector('strong')?.textContent||'Analysts';
  if(!menu.classList.contains('network-menu'))$('lb-objective').textContent=sel?.querySelector('em')?.textContent||'';
  stage?.setTeam(team);
}
menu.addEventListener('cs-team-selected',syncTeam);

const modeSelect=$('game-mode'),seg=$('lb-mode-seg');
function buildSeg(){
  seg.innerHTML='';
  for(const o of modeSelect.options){
    const {name:title,detail:sub}=UI_EN.modes[o.value] || {name:o.textContent,detail:''};const b=document.createElement('button');
    b.type='button';b.setAttribute('role','radio');b.dataset.value=o.value;b.innerHTML=`${title}<small>${sub||''}</small>`;
    b.addEventListener('click',()=>{if(modeSelect.value===o.value)return;modeSelect.value=o.value;modeSelect.dispatchEvent(new Event('change'));syncSeg();});
    seg.append(b);
  }
  syncSeg();
}
function syncSeg(){for(const b of seg.children)b.setAttribute('aria-checked',String(b.dataset.value===modeSelect.value));}
modeSelect.addEventListener('change',syncSeg);buildSeg();setTimeout(syncSeg,0);

const charSelect=$('player-character');
function syncOperator(){const o=charSelect.selectedOptions[0];$('lb-op-name').textContent=(o?.dataset.name||o?.textContent||UI_EN.defaultOperator);}
new MutationObserver(syncOperator).observe(charSelect,{childList:true,subtree:true,attributes:true});charSelect.addEventListener('change',syncOperator);syncOperator();

window.addEventListener('keydown', event => {
  if (menu.hidden || menu.inert || menu.dataset.screen !== 'solo' || event.defaultPrevented) return;
  const tag = event.target?.tagName;
  if (event.key === 'Enter' && !['SELECT','INPUT','TEXTAREA','BUTTON','A','SUMMARY'].includes(tag) && !$('start').disabled) {
    event.preventDefault();
    $('start').click();
  }
});

/* ---------- 3D operator stage ---------- */
function makeStage(){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(24,1,.1,50);camera.position.set(0,1.18,6.1);camera.lookAt(0,.92,0);
  scene.add(new T.HemisphereLight(0xbfd2ff,0x0a0d14,.9));
  const key=new T.DirectionalLight(0xffffff,2.3);key.position.set(-2.4,3.2,3.4);scene.add(key);
  const fill=new T.DirectionalLight(0x8aa6d8,.55);fill.position.set(3,1.2,2);scene.add(fill);
  const rimA=new T.DirectionalLight(ACCENT.analysts,3.2);rimA.position.set(2.2,2.4,-2.6);scene.add(rimA);
  const rimB=new T.DirectionalLight(ACCENT.analysts,2.2);rimB.position.set(-2.6,1.6,-2.2);scene.add(rimB);
  // Floor: soft pool of light + accent ring
  const g=document.createElement('canvas');g.width=g.height=256;const c=g.getContext('2d'),grd=c.createRadialGradient(128,128,0,128,128,128);
  grd.addColorStop(0,'rgba(255,255,255,.55)');grd.addColorStop(.45,'rgba(255,255,255,.12)');grd.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=grd;c.fillRect(0,0,256,256);
  const pool=new T.Mesh(new T.PlaneGeometry(3.4,3.4),new T.MeshBasicMaterial({map:new T.CanvasTexture(g),transparent:true,depthWrite:false,color:0xbfd6ff}));pool.rotation.x=-Math.PI/2;pool.position.y=.002;scene.add(pool);
  const ringMat=new T.MeshBasicMaterial({color:ACCENT.analysts,transparent:true,opacity:.85,side:T.DoubleSide});
  const ring=new T.Mesh(new T.RingGeometry(.62,.645,96),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=.004;scene.add(ring);
  const ring2=new T.Mesh(new T.RingGeometry(.86,.865,96,1,0,Math.PI*1.4),ringMat.clone());ring2.material.opacity=.35;ring2.rotation.x=-Math.PI/2;ring2.position.y=.004;scene.add(ring2);
  const turntable=new T.Group();scene.add(turntable);

  let avatar=null,team=null,yaw=Math.PI-.32,dragYaw=0,dragging=false,lastX=0,t0=performance.now(),last=t0;
  // Use the rig's relaxed upper-body idle for this unarmed operator preview.
  const actor={x:0,z:0,y:0,yaw:0,moving:0,onGround:true,crouching:false,height:1.8,weapon:'knife',reloadUntil:-1,alive:true};
  function setTeam(next){
    if(next===team&&avatar)return;team=next;const col=ACCENT[next]||ACCENT.analysts;
    rimA.color.setHex(col);rimB.color.setHex(col);ringMat.color.setHex(col);ring2.material.color.setHex(col);
    try{
      setPrivateCharacterActors([next+'-0']);
      const fresh=createAuthoredAvatar(next,next+'-0');
      canvas.classList.remove('is-ready');
      if(avatar){turntable.remove(avatar.holder);disposeAvatar(avatar);}
      avatar=fresh;turntable.add(fresh.holder);canvas.classList.add('is-ready');
    }catch(e){console.warn('Lobby preview unavailable:',e.message);}
  }
  function resize(){
    const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;
    const centre=menu.dataset.screen==='main'?(w/h>1.1?.72:.63):w<=760?.5:w<=1100?.66:.535;camera.setViewOffset(w,h,-(centre-.5)*w,0,w,h);camera.updateProjectionMatrix();
  }
  addEventListener('resize',resize);menu.addEventListener('cs-menu-screen',resize);resize();
  canvas.style.pointerEvents='auto';canvas.style.cursor='grab';
  canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;dragYaw+=(e.clientX-lastX)*.01;lastX=e.clientX;});
  const release=()=>{dragging=false;canvas.style.cursor='grab';};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('lostpointercapture',release);
  // Render loop runs only while the lobby is visible; fully stopped during loading/gameplay.
  let running=false;
  const loadingOpen=()=>document.documentElement.classList.contains('cs-loading-open');
  const visible=()=>['main','solo','outfits'].includes(menu.dataset.screen);
  function wake(){if(running||menu.hidden||document.hidden||loadingOpen()||!visible())return;running=true;last=performance.now();requestAnimationFrame(frame);}
  new MutationObserver(wake).observe(menu,{attributes:true,attributeFilter:['hidden','data-screen']});
  new MutationObserver(wake).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',wake);
  function frame(now){
    if(menu.hidden||document.hidden||loadingOpen()||!visible()){running=false;return;}
    requestAnimationFrame(frame);
    const dt=Math.min(.05,(now-last)/1000),time=(now-t0)/1000;last=now;
    const sway=reduced?0:Math.sin(time*.35)*.18;
    if(!dragging)dragYaw*=.985;
    turntable.rotation.y=yaw+sway+dragYaw;
    ring2.rotation.z=reduced?0:time*.25;
    if(avatar){try{animateAuthored(avatar,actor,time);}catch{avatar.mixer?.update(dt);}}
    renderer.render(scene,camera);
  }
  wake();
  return {setTeam};
}

let stage=null;
async function boot(){
  // Wait until app.mjs finished loading the level and any private character design.
  await new Promise(r=>{const ok=()=>$('loading').hidden||$('loading').style.display==='none';if(ok())return r();const mo=new MutationObserver(()=>{if(ok()){mo.disconnect();r();}});mo.observe($('loading'),{attributes:true});});
  if (!$('fatal').hidden) return;
  try{await loadCharacterLibrary();stage=makeStage();syncTeam();}catch(e){console.warn('Lobby preview unavailable:',e.message);}
}
syncTeam();boot();

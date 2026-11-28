// Adapted from Riposte 09qb-tactile-layout. Store normalized anchors, size and opacity.
import {normalizeTouchProfile, TOUCH_DEFAULTS} from './mobile-profile.mjs';

const controls={
  fire:['Fire',.90,.56],aim:['Aim',.80,.56],jump:['Jump',.80,.76],crouch:['Crouch',.90,.76],
  interact:['Use',.69,.76],reload:['Reload',.80,.91],weapon:['Weapon',.91,.91],
  run:['Run',.28,.62],stick:['Fixed stick',.22,.75],bonuses:['Bonuses',.49,.87]
};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const defaultRow=key=>({x:controls[key][1],y:controls[key][2],size:key==='stick'?100:54,opacity:1});
const numeric=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

export function validateLayout(layout) {
  if (!isObject(layout)) throw Error('Choose a valid touch layout.');
  const result={};
  for (const [key,row] of Object.entries(layout)) {
    if (!Object.hasOwn(controls,key) || !isObject(row) || !numeric(row.x,0,1) || !numeric(row.y,0,1)
        || !numeric(row.size,44,112) || !numeric(row.opacity,.35,1)) throw Error('A control has an invalid position, size or opacity.');
    result[key]={x:row.x,y:row.y,size:row.size,opacity:row.opacity};
  }
  return result;
}

export function exportTouchProfile(settings,layout) {
  const fields={};
  for(const key of [...Object.keys(TOUCH_DEFAULTS),'mobileAutoFire','mobileAimAssist']) if (Object.hasOwn(settings,key)) fields[key]=settings[key];
  return JSON.stringify({version:1,settings:fields,layout:validateLayout(layout)});
}

export function importTouchProfile(text) {
  if (typeof text!=='string'||text.length>8192) throw Error('The touch profile exceeds the size limit.');
  let profile;
  try {profile=JSON.parse(text);} catch {throw Error('Enter a valid touch profile.');}
  if (!isObject(profile)||profile.version!==1||!isObject(profile.settings)) throw Error('Unsupported touch profile version.');
  const settings=normalizeTouchProfile({});
  for (const [key,value] of Object.entries(profile.settings)) {
    if (!Object.hasOwn(TOUCH_DEFAULTS,key) && !['mobileAutoFire','mobileAimAssist'].includes(key)) throw Error('Unrecognized touch setting.');
    if (key==='mobileAutoFire'||key==='mobileAimAssist') {
      if (typeof value!=='boolean') throw Error('Invalid touch setting.');
    } else if (normalizeTouchProfile({[key]:value})[key]!==value) throw Error('Invalid touch setting.');
    settings[key]=value;
  }
  return {settings,layout:validateLayout(profile.layout)};
}

export function applyTouchLayout(root,saved) {
  if (!root) return;
  let layout={};
  try {layout=validateLayout(saved);} catch { /* Older saves use the shipped layout. */ }
  for (const key of Object.keys(controls)) {
    const selector=key==='aim'?'[data-tactical-aim]':key==='stick'?'[data-mobile-stick]':`[data-mobile-action="${key}"]`;
    const button=key==='bonuses'?root.ownerDocument.getElementById('bonus-controls'):root.querySelector(selector);
    if (!button) continue;
    const row=layout[key];
    button.classList.toggle('touch-custom',!!row);
    if (!row) continue;
    for (const [css,value] of Object.entries({x:row.x*100+'%',y:row.y*100+'%',size:row.size+'px',opacity:row.opacity}))
      button.style.setProperty('--touch-'+css,String(value));
  }
}

export function editTouchLayout(root,settings,save,refresh) {
  const dialog=document.createElement('dialog');
  dialog.className='touch-layout-editor';
  dialog.setAttribute('aria-label','Edit touch layout');
  dialog.innerHTML=`<h2>Touch layout</h2><p>Drag a control or move it with the arrow keys. Size and opacity apply to the selected control.</p>
    <div class="touch-layout-surface" aria-label="Control positions"></div>
    <label>Control <select data-control></select></label>
    <label>Size <input type="range" data-field="size" min="44" max="112" step="1"></label>
    <label>Opacity <input type="range" data-field="opacity" min=".35" max="1" step=".05"></label>
    <details><summary>Import or export profile</summary><textarea aria-label="Touch profile" maxlength="8192"></textarea>
    <button type="button" data-export>Export</button><button type="button" data-import>Import</button><p role="status"></p></details>
    <footer><button type="button" data-defaults>Reset layout</button><button type="button" data-cancel>Cancel</button><button type="button" data-save>Save layout</button></footer>`;
  const surface=dialog.querySelector('.touch-layout-surface'),select=dialog.querySelector('select'),fields=dialog.querySelectorAll('[data-field]');
  const markers={},originalFocus=document.activeElement;
  let draft={},imported={},selected='fire',drag=null;
  try {draft=validateLayout(settings.touchLayout);} catch {}
  const row=key=>draft[key]||defaultRow(key);
  function render(){
    for(const [key,marker] of Object.entries(markers)){
      const r=row(key);
      marker.style.left=r.x*100+'%';marker.style.top=r.y*100+'%';marker.style.opacity=String(r.opacity);
      marker.style.setProperty('--preview-size',r.size+'px');
      marker.setAttribute('aria-pressed',String(key===selected));
    }
    select.value=selected;
    for(const field of fields)field.value=String(row(selected)[field.dataset.field]);
  }
  function move(x,y){draft[selected]={...row(selected),x:clamp(x,.015,.985),y:clamp(y,.02,.98)};render();}
  for(const [key,[label]] of Object.entries(controls)){
    select.add(new Option(label,key));const marker=document.createElement('button');
    marker.type='button';marker.textContent=label;markers[key]=marker;surface.append(marker);
    marker.addEventListener('pointerdown',e=>{
      if (drag||e.button!==0) return;
      selected=key;drag={id:e.pointerId,key};render();marker.setPointerCapture(e.pointerId);
    });
    marker.addEventListener('pointermove',e=>{
      if (drag?.id!==e.pointerId || drag.key!==key)return;
      const rect=surface.getBoundingClientRect();move((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])marker.addEventListener(event,e=>{if(drag?.id===e.pointerId)drag=null;});
    marker.addEventListener('focus',()=>{selected=key;render();});
    marker.addEventListener('keydown',e=>{
      const steps={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};
      if(!Object.hasOwn(steps,e.key))return;
      e.preventDefault();const v=row(selected);move(v.x+steps[e.key][0],v.y+steps[e.key][1]);
    });
  }
  select.onchange=()=>{selected=select.value;render();};
  for(const field of fields)field.oninput=()=>{draft[selected]={...row(selected),[field.dataset.field]:Number(field.value)};render();};
  const text=dialog.querySelector('textarea'),status=dialog.querySelector('[role=status]');
  dialog.querySelector('[data-export]').onclick=()=>{text.value=exportTouchProfile({...settings,...imported},draft);text.select();status.textContent='Profile ready to copy.';};
  dialog.querySelector('[data-import]').onclick=()=>{
    try {const profile=importTouchProfile(text.value);draft=profile.layout;imported=profile.settings;render();status.textContent='Profile imported. Save to apply it.';}
    catch(error){status.textContent=error.message;}
  };
  dialog.querySelector('[data-defaults]').onclick=()=>{draft={};render();};
  dialog.querySelector('[data-save]').onclick=()=>{
    Object.assign(settings,imported,{touchLayout:draft});applyTouchLayout(root,draft);save();dialog.close();refresh?.();
  };
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(originalFocus?.isConnected)originalFocus.focus();},{once:true});
  document.body.append(dialog);render();dialog.showModal();
}

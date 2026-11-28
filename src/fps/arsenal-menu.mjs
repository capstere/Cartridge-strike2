// Class list and workshop adapted from Riposte 09n-armurerie.js (MIT).
import {PRESETS,CUSTOM_LEVELS,ATTACHMENTS,CAMOS,BASE_ENTITLEMENTS,defaultArsenal,resolveClass,
  weaponLevel,weaponFits,weaponDefinition,readArsenal,saveArsenal,hasSavedArsenal} from './arsenal.mjs';
import {WEAPONS} from './config.mjs';
import {accountRequest} from './account-profile.mjs';

const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const gun=id=>({id,attachments:[],camo:null});
const emptySlot=i=>({name:'Custom '+(i+1),primary:gun('rifle'),secondary:gun('sidearm'),equipment:'he'});
const labels={optic:'Optic',barrel:'Barrel',under:'Underbarrel',side:'Side rail',magazine:'Magazine or cartridges',stock:'Stock'};
const teamAlternatives={rifle:['cr4','ar47'],sidearm:['p9','p12']};
let accountClass=null;
let accountRevision=0;
const hasAccountService=()=>location.protocol==='https:'&&!location.hostname.endsWith('.github.io');
function adoptAccount(data){
  accountClass=data?.user?{profile:data.arsenal||null,entitlements:data.entitlements||BASE_ENTITLEMENTS}:null;
}
export async function refreshArsenalAccount(){
  if(!hasAccountService())return;
  const rev=++accountRevision;
  try{
    const data=await accountRequest('/api/account',undefined,AbortSignal.timeout(3500));
    if(rev===accountRevision)adoptAccount(data);
    return data;
  }catch{
    if(rev===accountRevision)accountClass=null;
    return undefined;
  }
}
if(typeof window!=='undefined')window.addEventListener('cs-account-changed',e=>{
  accountRevision++;adoptAccount(e.detail);
  document.getElementById('menu')?.dispatchEvent(new Event('cs-class-identity'));
});
export function selectedArsenal(team){
  if(accountClass)return accountClass.profile?resolveClass(accountClass.profile,team,accountClass.entitlements):null;
  try{if(!hasSavedArsenal())return null;return resolveClass(readArsenal(),team);}
  catch{return null;}
}
export function localArsenalProfile(){
  if(accountClass)return structuredClone(accountClass.profile);
  try{return hasSavedArsenal()?readArsenal():null;}catch{return null;}
}
export function mountArsenal({team,draw,clear}){
  const panel=document.querySelector('[data-panel=classes]'),find=s=>panel.querySelector(s);
  const menu=document.getElementById('menu'),status=find('[data-class-status]'),equip=find('[data-class-equip]');
  const rack=find('.arsenal-rack'),editor=find('[data-class-editor]'),stats=find('[data-class-stats]');
  let profile=readArsenal(),rights=BASE_ENTITLEMENTS,view=profile.selected,draft=null,weaponSlot='primary',angle=.14;
  let account=false,generation=0,busy=false,active=false,frame=0;
  const slots=new Map(),tiles=new Map();
  const notice=text=>{status.textContent=text;};
  function index(){return CUSTOM_LEVELS.findIndex((_,i)=>view==='custom-'+(i+1));}
  function candidate(){
    const p=structuredClone(profile);p.selected=view;
    if(draft)p.slots[index()]=structuredClone(draft);
    return p;
  }
  function resolved(){
    // The working name is validated on Save. Clearing the text field should keep the preview.
    const p=candidate();if(draft)p.slots[index()].name=emptySlot(index()).name;
    return resolveClass(p,team(),rights);
  }
  function select(id){
    view=id;weaponSlot='primary';angle=.14;
    const i=index();draft=i<0||rights.playerLevel<CUSTOM_LEVELS[i]?null:structuredClone(profile.slots[i]||emptySlot(i));
    notice('');render();
  }
  for(const [id,title,sub,parent] of [
    ...PRESETS.map(p=>[p.id,p.name,p.description,find('[data-class-presets]')]),
    ...CUSTOM_LEVELS.map((level,i)=>['custom-'+(i+1),'Custom '+(i+1),'Level '+level,find('[data-class-custom]')])
  ]){
    const button=el('button'),name=el('strong',title),note=el('small',sub);
    button.type='button';button.dataset.classId=id;button.append(name,note);button.onclick=()=>select(id);parent.append(button);
    slots.set(id,{button,name,note});
  }
  for(const part of ['primary','secondary']){
    const button=el('button'),canvas=el('canvas'),name=el('span');
    button.type='button';button.dataset.inspectSlot=part;canvas.width=320;canvas.height=124;canvas.setAttribute('aria-hidden','true');
    button.append(canvas,name);rack.append(button);tiles.set(part,{button,canvas,name});
    button.onclick=()=>{if(weaponSlot!==part){weaponSlot=part;angle=.14;render();}};
    let drag=null;
    canvas.addEventListener('pointerdown',e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{
      if(drag===null)return;
      weaponSlot=part;angle+=(e.clientX-drag)*.014;drag=e.clientX;queuePreview();
    });
    canvas.addEventListener('lostpointercapture',()=>{drag=null;});
  }
  for(const b of panel.querySelectorAll('[data-class-turn]'))b.onclick=()=>{angle+=Number(b.dataset.classTurn)*Math.PI/6;queuePreview();};
  function drawPreview(){
    if(!active||rack.hidden)return;
    const kit=resolved();
    for(const [part,tile] of tiles)draw(tile.canvas,kit[part],part===weaponSlot?angle:.14);
  }
  function queuePreview(){
    if(!frame)frame=requestAnimationFrame(()=>{frame=0;drawPreview();});
  }
  function selectField(parent,label,key,entries,value,change){
    const field=el('label',label),select=el('select');select.dataset.classField=key;
    for(const [id,title,locked=false] of entries){const opt=new Option(title,id);opt.disabled=locked;select.add(opt);}
    select.value=value;field.append(select);parent.append(field);
    select.onchange=()=>{
      change(select.value);render();
      editor.querySelector('[data-class-field="'+key+'"]')?.focus({preventScroll:true});
    };
  }
  function editWeapon(parent,kit){
    const spec=draft[weaponSlot],id=kit[weaponSlot].id;
    const ids=weaponSlot==='primary'?['rifle','smg','shotgun','sniper','bazooka']:['sidearm'];
    if(!ids.includes(spec.id))ids.push(spec.id);
    selectField(parent,weaponSlot==='primary'?'Primary weapon':'Sidearm','weapon',ids.map(k=>[k,k==='rifle'?'Team rifle':k==='sidearm'?'Team sidearm':WEAPONS[k].name]),spec.id,
      value=>{draft[weaponSlot]=gun(value);});
    const level=Math.min(...(teamAlternatives[spec.id]||[id]).map(w=>weaponLevel(rights,w)));
    for(const [group,label] of Object.entries(labels)){
      const choices=Object.values(ATTACHMENTS).filter(a=>a.group===group&&weaponFits(id,a.id));if(!choices.length)continue;
      const current=spec.attachments.find(a=>ATTACHMENTS[a]?.group===group)||'';
      selectField(parent,label,group,[['','Standard'],...choices.map(a=>{
        const locked=level<a.level,full=!current&&spec.attachments.length>=4;
        return [a.id,a.name+(locked?' · Weapon level '+a.level:full?' · Mount limit':''),locked||full];
      })],current,value=>{spec.attachments=spec.attachments.filter(a=>ATTACHMENTS[a]?.group!==group);if(value)spec.attachments.push(value);});
    }
    selectField(parent,'Camouflage','camo',[['','Issued finish'],...Object.values(CAMOS).map(c=>[c.id,c.name+(level<c.level?' · Weapon level '+c.level:''),level<c.level])],spec.camo||'',value=>{spec.camo=value||null;});
  }
  function render(){
    const i=index(),locked=i>=0&&rights.playerLevel<CUSTOM_LEVELS[i],preset=PRESETS.find(p=>p.id===view);
    const next=CUSTOM_LEVELS.find(n=>n>rights.playerLevel);
    find('[data-class-progress]').textContent='Level '+rights.playerLevel+' · '+CUSTOM_LEVELS.filter(n=>n<=rights.playerLevel).length+'/5 custom slots'+(next?' · Next slot at level '+next:'')+'. '+(account?'Classes saved to your account.':'Guest classes stay on this device.');
    for(const [id,{button,name,note}] of slots){
      const k=CUSTOM_LEVELS.findIndex((_,n)=>id==='custom-'+(n+1));
      button.setAttribute('aria-pressed',String(id===view));
      if(k>=0){name.textContent=profile.slots[k]?.name||'Custom '+(k+1);note.textContent=rights.playerLevel<CUSTOM_LEVELS[k]?'Locked · Level '+CUSTOM_LEVELS[k]:id===profile.selected?'Equipped':'Editable slot';}
      else {const p=PRESETS.find(item=>item.id===id);note.textContent=id===profile.selected?'Equipped preset':p.description;}
    }
    find('[data-class-title]').textContent=preset?.name||draft?.name||'Custom '+(i+1);
    find('[data-class-note]').textContent=locked?'Unlock this class at player level '+CUSTOM_LEVELS[i]+'.':preset?preset.description+' This preset has a fixed loadout.':'Choose equipment and save this class before deploying.';
    rack.hidden=locked;find('.arsenal-rotate').hidden=locked;equip.hidden=locked;equip.disabled=busy;
    equip.textContent=draft?'Save and equip':'Equip preset';
    stats.replaceChildren();editor.replaceChildren();if(locked)return;
    const kit=resolved(),item=kit[weaponSlot],w=weaponDefinition(item.id,item.attachments);
    for(const [part,tile] of tiles){tile.button.setAttribute('aria-pressed',String(part===weaponSlot));tile.name.textContent=WEAPONS[kit[part].id].name;}
    const heading=el('h3',w.name+' · Weapon level '+weaponLevel(rights,item.id)),list=el('dl');
    for(const [name,value] of [['Damage',Number(w.damage.toFixed(1))],['Range',Math.round(w.range)+' m'],['Magazine',w.magazine],['Rate',Math.round(60/w.interval)+' rpm'],['Reload',Number(w.reload.toFixed(2))+' s'],['Zoom',Number((w.zoom||1).toFixed(2))+'×']]){
      const row=el('div');row.append(el('dt',name),el('dd',String(value)));list.append(row);
    }
    stats.append(heading,list,el('p','Attachments · '+(item.attachments.map(a=>ATTACHMENTS[a].name).join(', ')||'None')),el('p','Equipment · '+WEAPONS[kit.equipment].name));
    if(draft){
      const fields=el('fieldset'),title=el('legend','Edit class'),name=el('input'),label=el('label','Class name');
      fields.append(title);name.value=draft.name;name.maxLength=16;name.dataset.classField='name';name.oninput=()=>{draft.name=name.value;};label.append(name);fields.append(label);
      selectField(fields,'Equipment','equipment',['he','smoke','flash'].map(id=>[id,WEAPONS[id].name]),draft.equipment,id=>{draft.equipment=id;});
      editWeapon(fields,kit);editor.append(fields);
    }
    queuePreview();
  }
  equip.onclick=async()=>{
    if(busy)return;
    const ticket=generation;
    try{
      const p=candidate();resolveClass(p,team(),rights);
      busy=true;equip.disabled=true;
      if(account){
        await accountRequest('/api/account/arsenal',{profile:p});
        if(ticket!==generation)return;
        accountClass={profile:p,entitlements:rights};
      }else saveArsenal(p,undefined,rights);
      profile=p;render();notice('Class equipped. Classic equipment still costs match money.');
      menu.dispatchEvent(new CustomEvent('cs-class-equipped',{detail:{profile:p}}));
    }catch(e){if(ticket===generation)notice(e.message||'Could not save this class.');}
    finally{if(ticket===generation){busy=false;equip.disabled=false;}}
  };
  async function open(){
    const ticket=++generation;active=true;busy=false;
    rights=BASE_ENTITLEMENTS;account=false;profile=readArsenal();select(profile.selected);
    if(!hasAccountService())return;
    busy=true;equip.disabled=true;
    try{
      const data=await refreshArsenalAccount();
      if(ticket!==generation||!active)return;
      if(!data){notice('Online profile unavailable. Guest classes stay on this device.');return;}
      account=!!data.user;
      if(account){
        rights=data.entitlements||BASE_ENTITLEMENTS;profile=data.arsenal||defaultArsenal();
        select(profile.selected);
      }
    }catch{if(ticket===generation)notice('Online profile unavailable. Guest classes stay on this device.');}
    finally{if(ticket===generation){busy=false;equip.disabled=false;}}
  }
  function close(){active=false;generation++;busy=false;cancelAnimationFrame(frame);frame=0;clear();}
  menu.addEventListener('cs-menu-screen',e=>{if(e.detail.screen==='classes')open();else if(active)close();});
  window.addEventListener('pagehide',close);
  if(menu.dataset.screen==='classes')open();
  return {draw:queuePreview};
}

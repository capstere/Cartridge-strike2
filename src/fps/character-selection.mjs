/** Menu for local, validated playable GLBs; no network or studio-project parsing. */
import {listPrivateCharacters,deletePrivateCharacter,validCharacterId} from './private-character-store.mjs';
export const CHARACTER_PREFERENCE='cartridge-selected-character';
export function preferredCharacter(url,storage){
 const q=new URL(url).searchParams;if(q.has('avatar'))return q.get('avatar');
 try{return storage.getItem(CHARACTER_PREFERENCE)||'';}catch{return '';}
}
export function characterMenuURL(url,id,{team='analysts',seed=42}={}){
 if(id&&!validCharacterId(id))throw Error('Invalid saved character. Choose the default operator.');
 const next=new URL(url);next.searchParams.delete('character');next.searchParams.set('avatar',id);
 next.searchParams.set('team',team==='counterAnalysts'?'counterAnalysts':'analysts');
 next.searchParams.set('seed',String(Math.min(999999,Math.max(1,Math.floor(Number(seed)||42)))));return next.href;
}
export function characterOptionLabel(row,rows){
 const same=rows.filter(r=>r.name===row.name);if(same.length<2)return row.name;
 const date=new Date(row.updated),stamp=Number.isFinite(date.getTime())?date.toLocaleString('en-US'):'unknown time';
 return row.name+' · '+stamp+' · copy '+(same.findIndex(r=>r.id===row.id)+1);
}
export async function setupCharacterMenu({getTeam,getSeed}){
 const select=document.getElementById('player-character'),status=document.getElementById('character-status'),remove=document.getElementById('delete-character');
 const id=preferredCharacter(location.href,{getItem:key=>localStorage.getItem(key)});let rows=[];
 const say=text=>{status.textContent=text;};
 try{rows=await listPrivateCharacters();}catch(e){say('Saved characters could not be read. You can still use the default operator.');}
 select.replaceChildren(new Option('Default operator',''));
 for(const row of rows){const option=new Option(characterOptionLabel(row,rows)+(row.compatible?'':' · update required'),row.id);option.dataset.name=row.name;select.append(option);}
 if(id&&!rows.some(r=>r.id===id))select.append(new Option('Saved character missing from this device',id));
 select.value=id;remove.hidden=!id||!rows.some(r=>r.id===id);
 if(!status.textContent)say(rows.length?'Saved on this device. Your design is applied to your player.':'No saved characters on this device. The default operator is ready.');
 const navigate=value=>{document.getElementById('start').disabled=true;select.disabled=true;say('Loading character…');location.assign(characterMenuURL(location.href,value,{team:getTeam(),seed:getSeed()}));};
 select.onchange=()=>navigate(select.value);
 remove.onclick=async()=>{if(!confirm('Delete this local game copy? Your other saved files will be kept.'))return;remove.disabled=true;try{await deletePrivateCharacter(select.value);navigate('');}catch{say('This browser could not delete the saved game copy.');remove.disabled=false;}};
 return {id,loaded(name){try{if(id)localStorage.setItem(CHARACTER_PREFERENCE,id);else localStorage.removeItem(CHARACTER_PREFERENCE);}catch{say('Your choice applies now. This browser could not save your preference.');return;}
  if(name)say(name+' · Saved locally. Your first-person hands match this operator.');
 },error(){
  say('The selected character could not be loaded. Choose the default operator or another compatible saved character.');
 }};
}

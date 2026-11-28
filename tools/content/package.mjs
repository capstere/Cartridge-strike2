// Package files can select reviewed definitions and compatible combinations.
// Paths, credit declarations, statistics and unlocks come from the registry.
import {createHash} from 'node:crypto';

const options={
 character:['outfit','rig'],outfit:['rig'],rig:[],weapon:['attachments'],attachment:['weapon'],
 map:['mode','surface'],mode:['map','surface'],bonus:[],audio:[],bot:[],theme:[],progression:['outfit'],
};
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
function check(value,message){if(!value)throw new Error(message);}
function fields(object,allowed){
 check(plain(object),'Expected a JSON object.');
 for(const key of Object.keys(object))check(allowed.includes(key),'Unsupported package field: '+key);
}

export function validateContentPackage(pkg,catalog){
 fields(pkg,['format','version','id','entries']);
 check(pkg.format==='cartridge-strike-content'&&pkg.version===1&&catalog?.version===1,'Unsupported content format or version.');
 check(validId(pkg.id),'Invalid package ID.');
 check(Array.isArray(pkg.entries)&&pkg.entries.length>0&&pkg.entries.length<=64,'A package needs 1–64 entries.');
 const registry=new Map(catalog.entries.map(e=>[e.kind+'/'+e.id,e])),seen=new Set();
 function lookup(kind,id){
  check(validId(id),'Invalid '+kind+' ID.');
  const result=registry.get(kind+'/'+id);check(result,'Unknown '+kind+': '+id);return result;
 }
 const resolved=pkg.entries.map(ref=>{
  check(plain(ref)&&typeof ref.kind==='string'&&Object.hasOwn(options,ref.kind),'Unknown content kind.');
  fields(ref,['kind','id','digest',...options[ref.kind]]);
  const entry=lookup(ref.kind,ref.id),key=entry.kind+'/'+entry.id,data=entry.details;
  check(!seen.has(key),'Duplicate content entry: '+key);seen.add(key);
  if(Object.hasOwn(ref,'digest'))check(typeof ref.digest==='string'&&ref.digest===entry.digest,'Stale content digest: '+key);
  if(ref.kind==='map'||ref.kind==='mode'){
   const counterpart=ref.kind==='map'?'mode':'map',linked=Object.hasOwn(ref,counterpart);
   check(linked===Object.hasOwn(ref,'surface'),'Map/mode combinations require both the related ID and a surface.');
   if(linked){
    check(['online','solo'].includes(ref.surface),'Unknown play surface.');
    lookup(counterpart,ref[counterpart]);
    check(data[ref.surface].includes(ref[counterpart]),'Unavailable '+ref.surface+' map/mode combination: '+key+' / '+ref[counterpart]);
   }
  }
  if(ref.kind==='weapon'&&Object.hasOwn(ref,'attachments')){
   check(Array.isArray(ref.attachments)&&ref.attachments.length<=4,'Each weapon accepts at most four attachments.');
   const groups=new Set();
   for(const id of ref.attachments){
    const attachment=lookup('attachment',id);
    check(attachment.details.weapons.includes(entry.id),'Incompatible weapon and attachment: '+entry.id+' / '+id);
    check(!groups.has(attachment.details.group),'Overlapping attachment slot: '+attachment.details.group);groups.add(attachment.details.group);
   }
  }
  if(ref.kind==='attachment'&&Object.hasOwn(ref,'weapon')){
   lookup('weapon',ref.weapon);check(data.weapons.includes(ref.weapon),'Incompatible attachment for weapon: '+ref.weapon);
  }
  if(Object.hasOwn(ref,'rig')){
   lookup('rig',ref.rig);
   check(ref.kind==='character'?data.rig===ref.rig:data.rigs.includes(ref.rig),'Incompatible rig: '+ref.rig);
  }
  if(Object.hasOwn(ref,'outfit')){
   const outfit=lookup('outfit',ref.outfit);
   check(ref.kind==='character'?data.wardrobe&&outfit.details.rigs.includes(data.rig):data.outfit===ref.outfit,'Incompatible outfit: '+ref.outfit);
  }
  const selection={},references=[];
  for(const option of options[ref.kind]){
   if(!Object.hasOwn(ref,option))continue;
   const value=ref[option];
   selection[option]=Array.isArray(value)?[...value].sort():value;
   if(option==='surface')continue;
   const kind=option==='attachments'?'attachment':option;
   const ids=Array.isArray(value)?selection[option]:[value];
   for(const id of ids)references.push({kind,id,digest:lookup(kind,id).digest});
  }
  return {kind:entry.kind,id:entry.id,digest:entry.digest,selection,references,assets:entry.assets};
 });
 // Package identity is independent of entry order, property order and redundant pins.
 const canonical=[...resolved].sort((a,b)=>{
  const left=a.kind+'/'+a.id,right=b.kind+'/'+b.id;
  return left<right?-1:left>right?1:0;
 });
 const packageDigest=createHash('sha256').update(JSON.stringify({version:1,id:pkg.id,resolved:canonical})).digest('hex');
 return {version:1,id:pkg.id,catalogDigest:catalog.digest,packageDigest,resolved};
}

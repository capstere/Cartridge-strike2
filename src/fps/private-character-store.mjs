/** Bounded local playable copies. No upload; original studio projects are separate. */
export const PRIVATE_CHARACTER_SCHEMA=1;
export const MAX_CHARACTER_BYTES=24*1024*1024;
export const validCharacterId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
export async function characterHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function inspectPrivateGLB(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<28||bytes.byteLength>MAX_CHARACTER_BYTES)throw Error('Provkaraktären måste vara en GLB på högst 24 MiB.');
 const v=new DataView(bytes),length=v.getUint32(12,true);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength||v.getUint32(16,true)!==0x4e4f534a||length>2*1024*1024||20+length>bytes.byteLength)throw Error('Provkaraktärens GLB är skadad.');
 let doc;try{doc=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+length)));}catch{throw Error('Provkaraktärens GLB innehåller skadad metadata.');}
 if(doc.asset?.version!=='2.0'||doc.extensionsRequired?.length||!doc.meshes?.length||doc.meshes.length>32||!doc.skins?.length||doc.skins.length>16||doc.animations?.length!==13||(doc.nodes?.length||0)>180||(doc.materials?.length||0)>24||(doc.images?.length||0)>32)throw Error('Provkaraktären ligger utanför den verifierade Male-piloten.');
 for(const kind of ['buffers','images'])for(const item of doc[kind]||[])if(item.uri!==undefined)throw Error('Provkaraktären måste ha alla bilder och data inbäddade i GLB.');
 if((doc.accessors||[]).some(a=>!Number.isInteger(a.count)||a.count<0||a.count>500000||a.sparse))throw Error('Provkaraktärens geometri eller animation är för stor eller inkompatibel.');
 return doc;
}
// Version 2 preserves v1 rows but prevents old cached writers from silently pruning them.
export const CHARACTER_DATABASE_VERSION=2;
async function database(){return new Promise((resolve,reject)=>{
 let blocked=false,r;const failure=()=>reject(Error('Webbläsaren kunde inte öppna sparade karaktärer. Tillåt lokal lagring.'));
 try{r=indexedDB.open('cartridge-private-characters',CHARACTER_DATABASE_VERSION);}catch{failure();return;}
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts',{keyPath:'id'});};
 r.onblocked=()=>{blocked=true;reject(Error('Stäng eller ladda om äldre spelflikar för att uppdatera karaktärsbiblioteket.'));};
 r.onsuccess=()=>{const db=r.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};r.onerror=failure;
});}
export const MAX_SAVED_CHARACTERS=8;
export async function listPrivateCharacters(){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const rows=[],tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').openCursor();
  // Keep only metadata: never retain all GLB buffers while listing the menu.
  r.onsuccess=()=>{const c=r.result;if(!c)return;const v=c.value;if(validCharacterId(v.id))rows.push({id:v.id,name:String(v.name||'Namnlös karaktär').slice(0,80),updated:v.updated||v.created||0,compatible:v.schema===PRIVATE_CHARACTER_SCHEMA});c.continue();};
  tx.oncomplete=()=>resolve(rows.sort((a,b)=>b.updated-a.updated));tx.onerror=tx.onabort=()=>reject(Error('Kunde inte läsa dina sparade karaktärer. Du kan fortfarande välja Originalkaraktär.'));
 });}finally{db.close();}
}
export async function deletePrivateCharacter(id){
 if(!validCharacterId(id))throw Error('Ogiltig karaktär.');const db=await database();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete(id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('Kunde inte ta bort spelkopian.'));});}finally{db.close();}
}
export async function savePrivateCharacter({bytes,name,sourceHash,projectId=null}){
 inspectPrivateGLB(bytes);
 if(!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('Originalmodellens identitet saknas.');
 if(projectId!==null&&!validCharacterId(projectId))throw Error('Projektets identitet är ogiltig.');
 const row={id:crypto.randomUUID(),schema:PRIVATE_CHARACTER_SCHEMA,bytes,name:String(name).slice(0,80),sourceHash,sha256:await characterHash(bytes),created:Date.now(),updated:Date.now(),projectId};
 const db=await database();
 try{await new Promise((resolve,reject)=>{let count=0,existing=null,full=false;const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.openCursor();
  r.onsuccess=()=>{const c=r.result;if(c){count++;if(projectId&&c.value.projectId===projectId)existing={id:c.value.id,created:c.value.created};c.continue();return;}
   if(existing)Object.assign(row,existing);else if(count>=MAX_SAVED_CHARACTERS){full=true;tx.abort();return;}s.put(row);
  };
  tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error(full?'Åtta karaktärer är sparade. Ta bort en spelkopia i spelmenyn innan du sparar en ny.':'Kunde inte spara spelkopian. Kontrollera ledigt utrymme och lokal webbläsarlagring. Den tidigare kopian är kvar.'));
 });}finally{db.close();}
 return row.id;
}
export async function loadPrivateCharacter(id){
 if(!validCharacterId(id))throw Error('Ogiltig privat karaktärslänk.');
 const db=await database();let row;
 try{row=await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').get(id);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(Error('Provkaraktären kunde inte läsas.'));});}finally{db.close();}
 if(!row||row.schema!==PRIVATE_CHARACTER_SCHEMA)throw Error('Den sparade karaktären saknas på denna enhet. Öppna studion och välj Spara för spelet igen.');
 inspectPrivateGLB(row.bytes);
 if(await characterHash(row.bytes)!==row.sha256)throw Error('Karaktärens kontrollsumma stämmer inte. Öppna studion och välj Spara för spelet igen.');
 return row;
}

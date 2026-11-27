/** Bounded local playable copies. No upload; original studio projects are separate. */

const messages = Object.freeze({
  'size': 'Choose a saved character GLB between 28 bytes and 24 MiB.',
  'header': 'The saved character GLB header is invalid.',
  'metadata': 'The saved character GLB metadata is invalid.',
  'model': 'This saved character is incompatible with the supported male operator rig.',
  'embedded': 'The saved character GLB must contain all its images and model data.',
  'geometry': 'The saved character geometry or animation exceeds the supported limits.',
  'storage': 'Allow local storage in this browser to open saved characters.',
  'blocked': 'Close or reload older game tabs to open the saved character library.',
  'list': 'Saved characters could not be read. You can still choose the default operator.',
  'id': 'The saved character ID is invalid.',
  'delete': 'This browser could not delete the saved game copy.',
  'source': 'The original model checksum is missing.',
  'project': 'The character project ID is invalid.',
  'full': 'Eight characters are already saved. Delete a game copy before saving another.',
  'save': 'The game copy could not be saved. Check local storage and free space. Your previous copy is safe.',
  'link': 'The saved character link is invalid.',
  'read': 'This browser could not read the saved character.',
  'missing': 'This character is missing from this device.',
  'checksum': 'The saved character checksum does not match.',
  'rig-version': 'This saved character uses a different rig version.',
  schema: 'This saved character uses an unsupported save format.',
});

export class SavedCharacterError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = 'SavedCharacterError';
    this.code = code;
  }
}

export function savedCharacterMessage(error, fallback) {
  return Object.hasOwn(messages, error?.code) ? messages[error.code] : fallback;
}

export const PRIVATE_CHARACTER_SCHEMA=1;
export const MAX_CHARACTER_BYTES=24*1024*1024;
export const validCharacterId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
export async function characterHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function inspectPrivateGLB(bytes){
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<28||bytes.byteLength>MAX_CHARACTER_BYTES)throw new SavedCharacterError('size');
 const v=new DataView(bytes),length=v.getUint32(12,true);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength||v.getUint32(16,true)!==0x4e4f534a||length>2*1024*1024||20+length>bytes.byteLength)throw new SavedCharacterError('header');
 let doc;try{doc=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+length)));}catch{throw new SavedCharacterError('metadata');}
 if(doc?.asset?.version!=='2.0'||doc.extensionsRequired?.length||!doc.meshes?.length||doc.meshes.length>32||!doc.skins?.length||doc.skins.length>16||doc.animations?.length!==13||(doc.nodes?.length||0)>180||(doc.materials?.length||0)>24||(doc.images?.length||0)>32)throw new SavedCharacterError('model');
 for(const kind of ['buffers','images'])for(const item of doc[kind]||[])if(item.uri!==undefined)throw new SavedCharacterError('embedded');
 if((doc.accessors||[]).some(a=>!Number.isInteger(a.count)||a.count<0||a.count>500000||a.sparse))throw new SavedCharacterError('geometry');
 return doc;
}
// Version 2 preserves v1 rows but prevents old cached writers from silently pruning them.
export const CHARACTER_DATABASE_VERSION=2;
async function database(){return new Promise((resolve,reject)=>{
 let blocked=false,r;const failure=()=>reject(new SavedCharacterError('storage'));
 try{r=indexedDB.open('cartridge-private-characters',CHARACTER_DATABASE_VERSION);}catch{failure();return;}
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts',{keyPath:'id'});};
 r.onblocked=()=>{blocked=true;reject(new SavedCharacterError('blocked'));};
 r.onsuccess=()=>{const db=r.result;if(blocked){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};r.onerror=failure;
});}
export const MAX_SAVED_CHARACTERS=8;
export async function listPrivateCharacters(){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const rows=[],tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').openCursor();
  // Keep only metadata: never retain all GLB buffers while listing the menu.
  r.onsuccess=()=>{const c=r.result;if(!c)return;const v=c.value;if(validCharacterId(v.id))rows.push({id:v.id,name:String(v.name||'Unnamed character').slice(0,80),updated:v.updated||v.created||0,compatible:v.schema===PRIVATE_CHARACTER_SCHEMA});c.continue();};
  tx.oncomplete=()=>resolve(rows.sort((a,b)=>b.updated-a.updated));tx.onerror=tx.onabort=()=>reject(new SavedCharacterError('list'));
 });}finally{db.close();}
}
export async function deletePrivateCharacter(id){
 if(!validCharacterId(id))throw new SavedCharacterError('id');const db=await database();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').delete(id);tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new SavedCharacterError('delete'));});}finally{db.close();}
}
export async function savePrivateCharacter({bytes,name,sourceHash,projectId=null}){
 inspectPrivateGLB(bytes);
 if(!/^[a-f0-9]{64}$/.test(sourceHash))throw new SavedCharacterError('source');
 if(projectId!==null&&!validCharacterId(projectId))throw new SavedCharacterError('project');
 const row={id:crypto.randomUUID(),schema:PRIVATE_CHARACTER_SCHEMA,bytes,name:String(name).slice(0,80),sourceHash,sha256:await characterHash(bytes),created:Date.now(),updated:Date.now(),projectId};
 const db=await database();
 try{await new Promise((resolve,reject)=>{let count=0,existing=null,full=false;const tx=db.transaction('drafts','readwrite'),s=tx.objectStore('drafts'),r=s.openCursor();
  r.onsuccess=()=>{const c=r.result;if(c){count++;if(projectId&&c.value.projectId===projectId)existing={id:c.value.id,created:c.value.created};c.continue();return;}
   if(existing)Object.assign(row,existing);else if(count>=MAX_SAVED_CHARACTERS){full=true;tx.abort();return;}s.put(row);
  };
  tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(new SavedCharacterError(full?'full':'save'));
 });}finally{db.close();}
 return row.id;
}
export async function loadPrivateCharacter(id){
 if(!validCharacterId(id))throw new SavedCharacterError('link');
 const db=await database();let row;
 try{row=await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').get(id);tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(new SavedCharacterError('read'));});}finally{db.close();}
 if(!row)throw new SavedCharacterError('missing');
 if(row.schema!==PRIVATE_CHARACTER_SCHEMA)throw new SavedCharacterError('schema');
 inspectPrivateGLB(row.bytes);
 if(await characterHash(row.bytes)!==row.sha256)throw new SavedCharacterError('checksum');
 return row;
}

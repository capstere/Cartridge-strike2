/** Self-contained binary glTF inspection. Never follows remote or relative URLs. */
export const GLB_MAX_BYTES=8*1024*1024;
const utf8=new TextDecoder('utf-8',{fatal:true});
export function inspectGLB(input,{maxBytes=GLB_MAX_BYTES}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength<28||bytes.byteLength>maxBytes)throw Error('GLB-filen är för stor eller ogiltig (max 8 MB).');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.byteLength)throw Error('Endast kompletta GLB-filer i glTF 2.0 stöds.');
 const jsonSize=v.getUint32(12,true);
 if(v.getUint32(16,true)!==0x4e4f534a||jsonSize>bytes.length-20)throw Error('GLB saknar giltig JSON-del.');
 let doc;try{doc=JSON.parse(utf8.decode(bytes.subarray(20,20+jsonSize)).trim());}catch{throw Error('Felaktig glTF-beskrivning.');}
 if(doc?.asset?.version!=='2.0'||!Array.isArray(doc.meshes)||doc.meshes.length===0||doc.meshes.length>250)throw Error('GLB saknar stödda meshobjekt.');
 if((doc.nodes?.length||0)>600||(doc.materials?.length||0)>200||(doc.textures?.length||0)>150)throw Error('GLB innehåller för många objekt.');
 for(const type of ['buffers','images'])for(const entry of doc[type]||[]){if(entry.uri!==undefined&&!String(entry.uri).startsWith('data:'))throw Error('GLB får inte länka till filer eller webbplatser.');}
 if((doc.extensionsRequired||[]).some(x=>['KHR_draco_mesh_compression','EXT_meshopt_compression','KHR_texture_basisu'].includes(x)))throw Error('Modellen behöver en extern decoder och stöds inte.');
 if((doc.accessors||[]).reduce((n,x)=>n+Number(x.count||0),0)>350000)throw Error('Modellen är för tung för redigeraren.');
 // Only JSON and BIN chunk types. Do not interpret arbitrary appended bytes.
 let offset=20+jsonSize,parts=1;
 while(offset<bytes.byteLength){if(offset+8>bytes.byteLength)throw Error('Avbruten GLB.');const len=v.getUint32(offset,true),typ=v.getUint32(offset+4,true);if(typ!==0x004e4942||offset+8+len>bytes.byteLength||++parts>2)throw Error('Ogiltiga GLB-block.');offset+=8+len;}
 return {meshCount:doc.meshes.length,nodeCount:doc.nodes?.length||0,byteCount:bytes.byteLength};
}
export async function assetHash(buffer){const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);const b=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function safeFilename(name){const t=String(name||'Min modell').replace(/[^\wÀ-ž åäöÅÄÖ.-]+/g,'_').slice(0,75);return t||'Min modell';}
const DB_NAME='cartridge-strike-furniture-assets-v2';
export function openAssetDB(){return new Promise((resolve,reject)=>{
 if(!('indexedDB' in globalThis)){reject(Error('Webbläsaren saknar IndexedDB.'));return;}
 const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('models',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);
});}
export async function assetPut(row){const db=await openAssetDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('models','readwrite');tx.objectStore('models').put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export async function assetGet(id){const db=await openAssetDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models','readonly');const r=tx.objectStore('models').get(id);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}finally{db.close();}}
export async function assetAll(){const db=await openAssetDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models','readonly');const r=tx.objectStore('models').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}finally{db.close();}}

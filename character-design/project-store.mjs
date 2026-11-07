/** Transactional local project library. No file bytes in localStorage. */
const DB='cartridge-strike-studio-4';
let pending;
function open(){
 return pending??=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB,2);
  r.onupgradeneeded=()=>{
   const db=r.result;
   if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});
   if(!db.objectStoreNames.contains('catalog')){
    const catalog=db.createObjectStore('catalog',{keyPath:'id'});
    const cursor=r.transaction.objectStore('projects').openCursor();
    cursor.onsuccess=()=>{const row=cursor.result;if(row){const {id,name,updated}=row.value;catalog.put({id,name,updated});row.continue();}};
   }
  };
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>{pending=null;reject(r.error);};
 });
}
async function request(store,action){
 const db=await open();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),r=action(tx.objectStore(store));let result;
  r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Läsningen avbröts'));
 });
}
export async function saveProject(id,project){
 const db=await open(),name=project.name,updated=new Date().toISOString();
 // Metadata and full data commit atomically. Opening the menu does not read all
 // imported model buffers from every saved character into memory on mobile.
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['projects','catalog'],'readwrite');
  tx.objectStore('projects').put({id,name,updated,project});tx.objectStore('catalog').put({id,name,updated});
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Sparningen avbröts'));
 });
}
export const loadProject=id=>request('projects',s=>s.get(id));
export const listProjects=()=>request('catalog',s=>s.getAll());
export function bytesToData(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
export function dataToBytes(data){const binary=atob(data);return Uint8Array.from(binary,c=>c.charCodeAt(0));}

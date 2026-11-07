/** Lossless authoring backups. Never interpreted as permission to run a level.
 * Uses the existing bounded ZIP codec and verifies every bundled binary.
 */
import {makeZip,readZip,PROJECT_ZIP_MAX_BYTES,PROJECT_ZIP_MAX_FILES} from '../library/zip.mjs?v=5.7.2';
import {assetHash} from '../library/glb-utils.mjs';
export const RECOVERY_FORMAT='cartridge-strike-level-recovery';
export const MAX_DRAFT_JSON_BYTES=16*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const modelId=id=>typeof id==='string'&&/^local:[a-f0-9]{64}$/.test(id);
export function draftText(project){
 const text=JSON.stringify(project,null,2);
 if(typeof text!=='string'||!project||typeof project!=='object')throw Error('Inget projekt att säkerhetskopiera.');
 if(encoder.encode(text).length>MAX_DRAFT_JSON_BYTES)throw Error('Utkastet är större än säkerhetskopians JSON-gräns på 16 MiB. Behåll fliken öppen.');
 return text+'\n';
}
export function draftModelIds(project){
 const rows=[...(Array.isArray(project?.assets?.local)?project.assets.local:[])];
 for(const key of ['placements','added'])if(Array.isArray(project?.furniture?.[key]))rows.push(...project.furniture[key]);
 return [...new Set(rows.map(o=>o?.assetId).filter(modelId))];
}
export async function collectDraftFiles(project,readModel){
 const files=new Map(),missing=[];let total=encoder.encode(draftText(project)).length;
 for(const id of draftModelIds(project)){
  const file=`assets/models/${id.slice(6)}.glb`;
  try{
   const row=await readModel(id),data=row?.data??row;
   if(!(data instanceof Uint8Array)&&!(data instanceof ArrayBuffer))throw Error('Modellfilen saknas lokalt');
   const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
   if(await assetHash(bytes)!==id.slice(6))throw Error('Modellens kontrollsumma stämmer inte');
   if(files.size>=PROJECT_ZIP_MAX_FILES-2||total+bytes.length>PROJECT_ZIP_MAX_BYTES-65536)throw Error('Modellen ryms inte i säkerhetskopian');
   files.set(file,bytes);total+=bytes.length;
  }catch(e){missing.push({assetId:id,file,reason:String(e.message||e)});}
 }
 for(const row of Array.isArray(project?.assets?.posters)?project.assets.posters:[])
  missing.push({file:row?.file||'okänd affisch',reason:'Separat bildfil behöver återställas från originalpaketet'});
 return {files,missing};
}
export async function exportDraftZip(project,{files=new Map(),missing=[],reason='Manuell säkerhetskopia'}={}){
 const text=draftText(project),assets=[];
 for(const [file,bytes] of files){
  if(!/^assets\/models\/[a-f0-9]{64}\.glb$/.test(file)||!(bytes instanceof Uint8Array))throw Error('Ogiltig bilaga till utkast.');
  const sha256=await assetHash(bytes);if(sha256!==file.slice(14,-4))throw Error('Fel kontrollsumma för utkastets modell.');
  assets.push({file,bytes:bytes.length,sha256});
 }
 const recovery={format:RECOVERY_FORMAT,schemaVersion:1,createdAt:new Date().toISOString(),reason:String(reason).slice(0,2000),
  projectSha256:await assetHash(encoder.encode(text)),assets,missing,
  notice:'Originaldata, inte en godkänd spelbana. Spelkontrollerna gäller fortfarande. Inga felaktiga objekt har raderats.'};
 return makeZip([{name:'project.json',data:text},{name:'RECOVERY.json',data:JSON.stringify(recovery,null,2)+'\n'},
  ...[...files].map(([name,data])=>({name,data}))]);
}
export async function readDraftZip(bytes){
 const archive=readZip(bytes),manifest=archive.get('RECOVERY.json');if(!manifest)return null;
 const recovery=JSON.parse(decoder.decode(manifest)),raw=archive.get('project.json');
 if(recovery.format!==RECOVERY_FORMAT||recovery.schemaVersion!==1||!raw||raw.length>MAX_DRAFT_JSON_BYTES||
  !Array.isArray(recovery.assets)||!Array.isArray(recovery.missing)||await assetHash(raw)!==recovery.projectSha256)
  throw Error('Säkerhetskopian är skadad. Originalfilen ska bevaras.');
 const files=new Map(),allowed=new Set(['project.json','RECOVERY.json']);
 for(const row of recovery.assets){
  if(!/^assets\/models\/[a-f0-9]{64}\.glb$/.test(row.file)||allowed.has(row.file))throw Error('Ogiltig utkastbilaga.');
  const data=archive.get(row.file);
  if(!data||data.length!==row.bytes||row.sha256!==row.file.slice(14,-4)||await assetHash(data)!==row.sha256)throw Error('Utkastbilagan är skadad.');
  allowed.add(row.file);files.set(row.file,data);
 }
 if([...archive.keys()].some(name=>!allowed.has(name)))throw Error('Oväntad fil i säkerhetskopian.');
 return {raw:decoder.decode(raw),project:JSON.parse(decoder.decode(raw)),files,recovery};
}
/** Keep rejected autosaves and concurrent tabs from silently replacing user work. */
export function createDraftStore(storage,key){
 let last=null,blockedRaw=null,problem=null,failed=false;
 return {
  load(parse){
   try{last=storage.getItem(key);if(!last)return null;return parse(last);}
   catch(e){blockedRaw=last;problem=String(e.message||e);failed=true;return null;}
  },
  get rejected(){return blockedRaw;},get problem(){return problem;},get failed(){return failed;},
  save(project){
   if(blockedRaw!==null){failed=true;return {ok:false,message:'Ett tidigare utkast är skyddat. Hämta säkerhetskopian före återställning.'};}
   try{
    const text=JSON.stringify(project),current=storage.getItem(key);
    if(current!==last)throw Error('En annan flik har ändrat projektet. Spara ZIP innan du laddar om.');
    if(text!==current){if(current)storage.setItem(key+':previous',current);storage.setItem(key,text);last=text;}
    failed=false;return {ok:true,message:'Ändringar sparade lokalt. Spara även en ZIP-kopia.'};
   }catch(e){failed=true;return {ok:false,message:'Autosparning misslyckades: '+e.message+' Hämta säkerhetskopia; behåll fliken öppen.'};}
  },
  acceptImport(project){
   const current=storage.getItem(key),text=JSON.stringify(project);
   if(current!==last)throw Error('En annan flik har ändrat utkastet. Spara dina kopior först.');
   if(current){const backup=key+':before-import';storage.setItem(backup,current);}
   // setItem is atomic: a quota failure leaves the previous key untouched.
   storage.setItem(key,text);last=text;blockedRaw=null;problem=null;failed=false;
  }
 };
}

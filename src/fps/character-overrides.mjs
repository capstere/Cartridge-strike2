/** Cosmetic roster; authored GLBs replace visuals, never actor/gameplay data. */
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {assignmentKeys} from './character-roles.mjs?v=6.1.2';
import {inspectActorGLB,validateActorContract,validateActorAsset,actorHash} from './character-runtime-contract.mjs?v=6.1.2';
import {createDwarfAsset} from './dwarf-rig.mjs?v=6.1.2';
let entries=new Map(),pending=null;
function disposeEntry(entry){
 entry.viewAppearance?.dispose();if(!entry.ownsAsset)return;
 const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
 entry.asset.scene.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.skeleton)skeletons.add(n.skeleton);for(const m of [n.material].flat().filter(Boolean))materials.add(m);});
 for(const m of materials){for(const t of Object.values(m))if(t?.isTexture)textures.add(t);m.dispose();}
 for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const s of skeletons)s.dispose();
}
export function getCharacterOverride(role,id,variant=0){for(const target of assignmentKeys(role,id,variant)){const entry=entries.get(target);if(entry?.contract.role===role)return entry;}return null;}
/** Host/test integration: caller owns this already parsed asset and its lifetime. */
export function installCharacterOverride(asset,contract,source){const report=validateActorAsset(asset,contract,source);const entry={asset,contract,report,signature:contract.sha256,ownsAsset:false};entries.set(contract.target,entry);return entry;}
export async function loadCharacterOverrides(sources){
 if(pending)return pending;
 pending=(async()=>{
  const response=await fetch(new URL('../../assets/fps/character-overrides.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw Error('Karaktärsregistret kunde inte läsas.');
  const manifest=await response.json();if(manifest.schema!==1||!Array.isArray(manifest.characters)||manifest.characters.length>48)throw Error('Ogiltigt karaktärsregister.');
  const staged=new Map(),loader=new GLTFLoader(),sourceHashes=new Map();
  try{for(const row of manifest.characters){
   const c=validateActorContract(row.contract);if(staged.has(c.target)||row.file!==`assets/fps/custom-characters/${c.sha256}.glb`)throw Error('Ogiltig eller duplicerad karaktärssökväg.');
   if(c.role!=='dwarf'){
    if(!sourceHashes.has(c.gender)){const original=await fetch(new URL('../../assets/fps/models/'+c.source.file,import.meta.url));if(!original.ok)throw Error('Originalriggen saknas.');sourceHashes.set(c.gender,await actorHash(await original.arrayBuffer()));}
    if(sourceHashes.get(c.gender)!==c.source.sha256)throw Error('Exporten bygger på en annan originalrigg. Exportera på nytt från studion.');
   }
   const r=await fetch(new URL('../../'+row.file,import.meta.url));if(!r.ok)throw Error('Karaktärsfil saknas: '+c.target);const bytes=await r.arrayBuffer();
   if(bytes.byteLength!==c.bytes||await actorHash(bytes)!==c.sha256)throw Error('Karaktärens kontrollsumma stämmer inte.');inspectActorGLB(bytes);
   const source=c.role==='dwarf'?createDwarfAsset():sources[c.gender];
   const asset=await loader.parseAsync(bytes,'');let report;
   try{report=validateActorAsset(asset,c,source);}catch(e){disposeEntry({asset,ownsAsset:true});throw e;}finally{if(c.role==='dwarf')disposeEntry({asset:source,ownsAsset:true});}
   staged.set(c.target,{asset,contract:c,report,signature:c.sha256,ownsAsset:true});
  }}catch(e){for(const entry of staged.values())disposeEntry(entry);throw e;}
  for(const entry of entries.values())disposeEntry(entry);entries=staged;
 })().catch(error=>{pending=null;throw error;});return pending;
}
export function clearCharacterOverrides(){for(const entry of entries.values())disposeEntry(entry);entries.clear();pending=null;}

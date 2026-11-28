// Authoring CLI. The installed registry is the only file this command changes.
import {createHash,randomUUID} from 'node:crypto';
import {open,readFile,rename,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL} from 'node:url';
import {validateAppearancePackage,installedPalettes} from '../src/fps/appearance-package.mjs';
import {reservedOutfitIds} from '../src/fps/operator-outfits.mjs';
import {inspectActorGLB} from '../src/fps/character-runtime-contract.mjs';

const requiredClips=['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Crouch_Idle_Loop','Crouch_Fwd_Loop',
  'Jump_Loop','Jump_Land','Hit_Chest','Death01','Pistol_Idle_Loop','Pistol_Shoot','Pistol_Reload'];
const materialSlots=['jacket-fabric','trousers-fabric','vest-shell','gloves-leather'];

export async function verifyAppearanceRigs(root,packages){
  const receipts=[];
  for(const gender of ['male','female']){
    const path='assets/fps/models/quaternius-operator-'+gender+'.glb';
    const bytes=await readFile(resolve(root,path));
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if(packages.some(pack=>pack.rigs[gender]!==sha256))throw Error('The '+gender+' operator rig hash differs from the package.');
    const model=inspectActorGLB(bytes);
    const bones=new Set(model.skins.flatMap(s=>s.joints.map(index=>model.nodes[index]?.name)));
    const clips=new Set(model.animations.map(clip=>clip.name));
    const materials=new Set(model.materials.map(material=>material.name));
    if(!['pelvis','spine_03','Head','hand_l','hand_r'].every(bone=>bones.has(bone))||
       !requiredClips.every(name=>clips.has(name))||!materialSlots.every(name=>materials.has(name))||
       !model.images?.length||model.images.some(image=>!model.bufferViews[image.bufferView]))
      throw Error('The '+gender+' operator lacks required kit anchors, clips, materials or embedded textures.');
    receipts.push({gender,path,bytes:bytes.length,sha256,bones:bones.size,clips:[...clips],materials:materialSlots,
      embeddedImages:model.images.length});
  }
  return receipts;
}

export async function importAppearance(root,file,install=false){
  const registry=resolve(root,'assets/fps/outfit-packs.json'),lock=registry+'.lock';
  const packHandle=await open(file,'r');
  let pack;
  try{
    const info=await packHandle.stat();
    if(!info.isFile()||info.size>16384)throw Error('Choose an operator palette JSON file of up to 16 KiB.');
    pack=validateAppearancePackage(JSON.parse(await packHandle.readFile('utf8')));
  }finally{await packHandle.close();}
  // Two imports must never overwrite one another's installed palette.
  const writer=install?await open(lock,'wx'):null;
  let temp;
  try{
    const manifest=JSON.parse(await readFile(registry,'utf8'));
    installedPalettes(manifest,reservedOutfitIds);
    const existing=manifest.packages.find(item=>item.id===pack.id);
    if(existing&&!isDeepStrictEqual(existing,pack))throw Error('An installed outfit already uses this ID.');
    if(!existing)manifest.packages.push(pack);
    installedPalettes(manifest,reservedOutfitIds);
    const rigs=await verifyAppearanceRigs(root,manifest.packages);
    if(install&&!existing){
      manifest.packages.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
      temp=registry+'.'+randomUUID()+'.tmp';
      const out=await open(temp,'wx');
      try{await out.writeFile(JSON.stringify(manifest,null,2)+'\n');await out.sync();}finally{await out.close();}
      await rename(temp,registry);temp=null;
    }
    return {status:existing?'already-installed':install?'installed':'validated',id:pack.id,rigs,rights:pack.rights};
  }finally{
    try{if(temp)await rm(temp,{force:true});}finally{if(writer){await writer.close();await rm(lock);}}
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if((args.length===1&&!args[0].startsWith('--'))||(args.length===2&&args[0]==='--install')){
    console.log(JSON.stringify(await importAppearance(process.cwd(),args.at(-1),args.length===2),null,2));
  }else{
    console.error('Usage: node tools/appearance-import.mjs [--install] <palette.json>');process.exitCode=2;
  }
}

/** Native Quaternius rig: keep its bone/clip names and original shared resources. */
export const BUSINESS_HOSTAGE_FILE='Business_Man_Quaternius_Anims.glb';
export function prepareBusinessHostage(asset){
 const clips=new Set(asset.animations.map(c=>c.name)),bones=new Set(),support=new Map();let skins=0;
 for(const name of ['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Crouch_Idle_Loop','Crouch_Fwd_Loop','Jump_Loop','Death01'])if(!clips.has(name))throw Error('Missing hostage clip: '+name);
 asset.scene.traverse(o=>{if(o.isBone)bones.add(o.name);if(!o.isSkinnedMesh)return;skins++;
  const joints=o.geometry.attributes.skinIndex,weights=o.geometry.attributes.skinWeight,indices=[];
  if(!joints||!weights)throw Error('Hostage mesh has no skin weights');
  for(let i=0;i<joints.count;i++){
   let weight=0;for(let k=0;k<4;k++)if(/^(Foot|Toes)_[LR]$/.test(o.skeleton.bones[joints.getComponent(i,k)]?.name))weight+=weights.getComponent(i,k);
   if(weight>.5)indices.push(i);
  }
  if(indices.length)support.set(o.geometry,Uint32Array.from(indices));
  o.frustumCulled=false;
 });
 for(const name of ['Hips','Chest','Head','Foot_L','Foot_R'])if(!bones.has(name))throw Error('Missing hostage bone: '+name);
 if(!skins||!support.size)throw Error('Incomplete hostage rig');
 return support;
}

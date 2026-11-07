/** Cosmetic first-person adapter for the validated Male/T-shirt pilot.
 * Reads the exported GLB, not a second palette or mutable studio preferences.
 * Owns two small strip textures and two materials; never edits character data.
 */
import * as T from '../../vendor/three/three.module.js';
export const SHIRT_FRACTION=.32;
function textureColor(material,u,v){
 const color=material.color.clone(),texture=material.map;if(!texture)return color;
 texture.updateMatrix();const uv=texture.transformUv(new T.Vector2(u,v)),im=texture.image;
 if(!im?.width||!im?.height)throw Error('Karaktärens tröjtextur kunde inte läsas. Skapa provmatchen igen i studion.');
 const x=Math.min(im.width-1,Math.max(0,Math.floor(uv.x*im.width))),y=Math.min(im.height-1,Math.max(0,Math.floor(uv.y*im.height)));let rgba;
 if(im.data){rgba=im.data.subarray((y*im.width+x)*4,(y*im.width+x)*4+4);}
 else{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,x,y,1,1,0,0,1,1);rgba=ctx.getImageData(0,0,1,1).data;}
 return color.multiply(new T.Color().setRGB(rgba[0]/255,rgba[1]/255,rgba[2]/255,texture.colorSpace));
}
export function createPrivateViewAppearance(asset){
 const gloves=new Set(),shirts=[],faces=new Set();asset.scene.traverse(o=>{if(!o.isMesh)return;
  if(o.material?.name==='gloves-leather')gloves.add(o.material);
  if(o.material?.name==='jacket-fabric')shirts.push(o);
  if(o.material?.name==='face-skin')faces.add(o.material);
 });
 if(gloves.size!==1||!shirts.length||faces.size!==1)throw Error('Karaktärens hand- och ärmmaterial kunde inte matchas. Skapa provmatchen igen i studion.');
 const hand=[...gloves][0],face=[...faces][0],shirt=shirts[0].material;
 if(hand.map||hand.vertexColors)throw Error('Texturmålade händer kräver separat förstapersonsstöd. Använd pilotens handfärg.');
 const skin=new T.Color(0,0,0);let count=0;
 for(const mesh of shirts){const {color,skinIndex,skinWeight}=mesh.geometry.attributes;if(!color||!skinIndex||!skinWeight||!mesh.skeleton)continue;
  for(let i=0;i<color.count;i++){let influence=0;for(let j=0;j<4;j++)if(/^lowerarm_[lr]$/.test(mesh.skeleton.bones[skinIndex.array[i*4+j]]?.name))influence+=skinWeight.array[i*4+j];
   if(influence<.8)continue;skin.r+=color.getX(i);skin.g+=color.getY(i);skin.b+=color.getZ(i);count++;
  }
 }
 if(!count)throw Error('Karaktärens bara underarmar kunde inte matchas. Skapa en ny Male-pilot.');
 skin.multiplyScalar(1/count);
 // Exported torso artwork is masked away from sleeves at this reserved UV.
 const cloth=textureColor(shirt,.005,.005);
 if([...skin.toArray(),...cloth.toArray()].some(v=>!Number.isFinite(v)||v<0||v>1.001))throw Error('Karaktärens färgdata är ogiltiga. Skapa provmatchen igen i studion.');
 const colorBytes=new Uint8Array(128*4),roughBytes=new Uint8Array(128*4);
 for(let y=0;y<128;y++){const covered=(y+.5)/128<SHIRT_FRACTION,c=(covered?cloth:skin).clone().convertLinearToSRGB(),r=covered?shirt.roughness:face.roughness;
  for(let k=0;k<3;k++){colorBytes[y*4+k]=Math.round(c.toArray()[k]*255);roughBytes[y*4+k]=Math.round(r*255);}colorBytes[y*4+3]=roughBytes[y*4+3]=255;
 }
 const map=new T.DataTexture(colorBytes,1,128),roughnessMap=new T.DataTexture(roughBytes,1,128);
 map.colorSpace=T.SRGBColorSpace;for(const t of [map,roughnessMap]){t.needsUpdate=true;t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.userData.sharedWeapon=true;}
 const glove=new T.MeshStandardMaterial({color:hand.color,roughness:hand.roughness,metalness:hand.metalness});
 const sleeve=new T.MeshStandardMaterial({map,roughnessMap,roughness:1,metalness:0});
 glove.name='private-character-hands';sleeve.name='private-character-short-sleeves';for(const m of [glove,sleeve])m.userData.sharedWeapon=true;
 let disposed=false;
 return {glove,sleeve,skin:skin.toArray(),cloth:cloth.toArray(),dispose(){if(disposed)return;disposed=true;glove.dispose();sleeve.dispose();map.dispose();roughnessMap.dispose();}};
}
export function syncWeaponAppearance(model,profile){
 if(!model.userData.viewmodel)return;
 let state=model.userData.characterAppearance;
 if(!state&&!profile||state?.profile===profile)return;
 if(!state){
  const targets=[],d=model.userData,add=(mesh,role)=>targets.push({mesh,role,material:mesh.material,uv:mesh.geometry.attributes.uv,visible:mesh.visible});
  if(d.heroKit){for(const hand of [d.rightHand,d.leftHand])add(hand.userData.skin,'hand');for(const arm of [d.rightArm,d.leftArm])add(arm,'kit-sleeve');}
  else{
   for(const hand of Object.values(d.presentationHands||{}))hand?.traverse(o=>{if(o.isMesh)add(o,'hand');});
   d.arms?.traverse(o=>{if(o.isMesh&&o.material?.userData.privateViewRole)add(o,o.material.userData.privateViewRole);});
  }
  state=model.userData.characterAppearance={profile:null,targets};
 }
 for(const item of state.targets){const {mesh,role}=item;
  mesh.material=profile?(role==='hand'?profile.glove:profile.sleeve):item.material;
  mesh.visible=item.visible;
  // Keep the legacy wrist connector: hiding it leaves a gap at the glove.
  if(role==='cuff'){
   if(profile&&!item.privateUV){item.privateUV=item.uv.clone();for(let i=0;i<item.privateUV.count;i++)item.privateUV.setXY(i,.5,1);}
   mesh.geometry.setAttribute('uv',profile?item.privateUV:item.uv);
  }
  if(role==='kit-sleeve'){
   if(profile&&!item.privateUV){item.privateUV=item.uv.clone();for(let i=0;i<item.privateUV.count;i++)item.privateUV.setXY(i,.5,1-item.uv.getY(i)/6);}
   mesh.geometry.setAttribute('uv',profile?item.privateUV:item.uv);
   mesh.userData.privateShortSleeves=!!profile&&profile.shortSleeves!==false;mesh.userData.last.fill(NaN);
  }
 }
 state.profile=profile;
}

/** Long- and short-sleeved exported designs share their actual material colours. */
export function createRuntimeViewAppearance(asset,{shortSleeves=false}={}){
 let shirt,hand,skin;asset.scene.traverse(o=>{if(!o.isMesh)return;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if(m.name==='jacket-fabric')shirt=m;if(m.name==='gloves-leather')hand=m;if(m.name==='face-skin')skin=m;}});
 if(!shirt||!hand||!skin)throw Error('Spelkaraktären saknar hand-/ärmmaterial.');
 // A short-sleeved export needs vertex/atlas matching; reuse its verified reader.
 if(shortSleeves){const p=createPrivateViewAppearance(asset);p.shortSleeves=true;return p;}
 const cloth=textureColor(shirt,.005,.005),glove=hand.clone(),sleeve=new T.MeshStandardMaterial({color:cloth,roughness:shirt.roughness,metalness:shirt.metalness});
 glove.name='runtime-character-hands';sleeve.name='runtime-character-long-sleeves';for(const m of [glove,sleeve]){delete m.userData.ownedTexture;m.userData.sharedWeapon=true;}
 return {glove,sleeve,shortSleeves:false,cloth:cloth.toArray(),skin:skin.color.toArray(),dispose(){glove.dispose();sleeve.dispose();}};
}

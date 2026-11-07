/** Shared export/import checks. A receipt proves compatibility, not art quality. */
import * as T from '../../vendor/three/three.module.js';
import {validateRole} from './character-roles.mjs?v=6.1.2';
export const ACTOR_FORMAT='cartridge-strike-runtime-character';
export const ACTOR_VERSION=1,ACTOR_MAX_BYTES=48*1024*1024;
export function validateActorContract(c){
 if(!c||c.format!==ACTOR_FORMAT||c.version!==ACTOR_VERSION)throw Error('Okänt karaktärspaket.');
 validateRole(c.role,c.target);
 if(!['male','female'].includes(c.gender)||c.rig!==(c.role==='dwarf'?'cartridge-dwarf-v1':'quaternius-operator-'+c.gender))throw Error('Fel rigg för rollen.');
 if(c.file!=='CHARACTER.glb'||!Number.isInteger(c.bytes)||c.bytes<28||c.bytes>ACTOR_MAX_BYTES||!/^[a-f0-9]{64}$/.test(c.sha256))throw Error('Modellens filidentitet saknas.');
 if(c.front!=='+Z'||c.up!=='+Y')throw Error('Karaktärens axlar måste vara +Y upp, +Z framåt.');
 if(c.role!=='dwarf'&&(c.source?.file!=='quaternius-operator-'+c.gender+'.glb'||!/^[a-f0-9]{64}$/.test(c.source.sha256)))throw Error('Originalriggens identitet saknas.');
 if(c.role==='dwarf'&&c.source?.generator!=='cartridge-dwarf-v1')throw Error('Dvärgens källrigg saknas.');
 if(!c.view||typeof c.view.shortSleeves!=='boolean')throw Error('Förstapersonsprofil saknas.');
 return c;
}
export function inspectActorGLB(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.length<28||bytes.length>ACTOR_MAX_BYTES)throw Error('Karaktären får vara högst 48 MiB.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),size=v.getUint32(12,true);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.length||v.getUint32(16,true)!==0x4e4f534a||size>4*1024*1024||size+20>bytes.length)throw Error('Skadad GLB.');
 let offset=20+size,binCount=0;while(offset<bytes.length){if(offset+8>bytes.length||v.getUint32(offset+4,true)!==0x004e4942||++binCount>1)throw Error('Ogiltiga GLB-block.');const n=v.getUint32(offset,true);if(n%4||offset+8+n>bytes.length)throw Error('Avbruten GLB.');offset+=8+n;}
 if(size%4||binCount!==1)throw Error('GLB måste innehålla ett komplett binärblock.');
 const d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(20,20+size)));
 if(d.asset?.version!=='2.0'||!d.meshes?.length||d.meshes.length>256||!d.skins?.length||(d.nodes?.length||0)>1200||(d.materials?.length||0)>256||(d.images?.length||0)>128)throw Error('Modellens struktur stöds inte.');
 if((d.extensionsRequired||[]).length)throw Error('Komprimerade eller externa tillägg stöds inte i detta exportformat.');
 for(const list of ['buffers','images'])for(const item of d[list]||[])if(item.uri!==undefined)throw Error('Alla texturer och modelldata måste vara inbäddade.');
 for(const a of d.accessors||[])if(!Number.isInteger(a.count)||a.count<0||a.count>2_000_000||a.sparse)throw Error('Ogiltig eller för stor geometri.');
 return d;
}
export async function actorHash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const equalValues=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1e-5);
export function validateActorAsset(asset,c,source){
 validateActorContract(c);
 if(!source?.scene||!source.animations?.length)throw Error('Originalmodellen krävs för kompatibilitetskontrollen.');
 const bones=new Map(),sourceBones=new Map(),meshList=[];let vertices=0,triangles=0;
 source.scene.traverse(o=>{if(o.isBone)sourceBones.set(o.name,o);});
 asset.scene.traverse(o=>{
  if(o.name&&o.isBone){if(bones.has(o.name))throw Error('Duplicerat skelettben: '+o.name);bones.set(o.name,o);}
  if(![...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()].every(Number.isFinite))throw Error('Ogiltig modelltransform.');
  if(!o.isMesh)return;meshList.push(o);const p=o.geometry.attributes.position;if(!p||!p.count)throw Error('Mesh saknar geometri.');vertices+=p.count;triangles+=(o.geometry.index?.count||p.count)/3;
  for(const key of ['position','normal','uv','color','skinWeight']){const a=o.geometry.attributes[key];if(a&&Array.from(a.array).some(v=>!Number.isFinite(v)))throw Error('Ogiltiga geometridata: '+key);}
  if(o.isSkinnedMesh){
   const j=o.geometry.attributes.skinIndex,w=o.geometry.attributes.skinWeight;if(!j||!w||j.count!==p.count||w.count!==p.count)throw Error('Modellen saknar kompletta benvikter.');
   for(let i=0;i<p.count;i++){let sum=0;for(let k=0;k<4;k++){const joint=j.getComponent(i,k),weight=w.getComponent(i,k);if(weight<0||weight>1.00001||!Number.isInteger(joint)||!o.skeleton.bones[joint])throw Error('Ogiltig benvikt.');sum+=weight;}if(Math.abs(sum-1)>1e-3)throw Error('Benvikterna är inte normaliserade.');}
   if(o.skeleton.boneInverses.some(m=>m.elements.some(v=>!Number.isFinite(v))||Math.abs(m.determinant())<1e-12))throw Error('Ogiltig bindpose.');
  }
 });
 if(vertices>2_000_000||meshList.length>256)throw Error('Karaktären är för stor för denna importprofil. Spara designoriginalet separat.');
 for(const [name,original]of sourceBones){const bone=bones.get(name);if(!bone)throw Error('Originalben saknas: '+name);if(original.parent?.isBone&&bone.parent?.name!==original.parent.name)throw Error('Benhierarkin har ändrats: '+name);}
 for(const o of meshList)if(o.isSkinnedMesh&&o.skeleton.bones.some(b=>bones.get(b.name)!==b))throw Error('Ben utanför den exporterade scenen.');
 const clips=new Map(asset.animations.map(clip=>[clip.name,clip]));
 if(clips.size!==asset.animations.length||clips.size!==source.animations.length)throw Error('Alla originalanimationer måste följa med.');
 for(const original of source.animations){
  const clip=clips.get(original.name);if(!clip||Math.abs(clip.duration-original.duration)>1e-5||clip.tracks.length!==original.tracks.length)throw Error('Originalanimation saknas eller har ändrats: '+original.name);
  for(const track of original.tracks){const out=clip.tracks.find(t=>t.name===track.name);if(!out||out.getInterpolation()!==track.getInterpolation()||!equalValues(track.times,out.times)||!equalValues(track.values,out.values))throw Error('Animationsspår har ändrats: '+track.name);}
 }
 if(c.role!=='dwarf')for(const side of ['l','r']){const sole=asset.scene.getObjectByName('boot-sole-'+side);if(!sole?.isMesh||sole.isSkinnedMesh)throw Error('Fotens stödgeometri saknas.');let p=sole.parent;while(p&&p.name!=='foot_'+side)p=p.parent;if(!p)throw Error('Skon följer inte fotbenet.');}
 // Sample re-imported skinning in every included animation; never the editor proxy.
 const mixer=new T.AnimationMixer(asset.scene),bounds=new T.Box3(),v=new T.Vector3();let samples=0,maxExtent=0;
 for(const clip of asset.animations){const action=mixer.clipAction(clip);mixer.stopAllAction();action.reset().play();for(const f of [0,.25,.5,.9]){
  mixer.setTime(clip.duration*f);asset.scene.updateMatrixWorld(true);bounds.makeEmpty();
  for(const mesh of meshList){if(mesh.isSkinnedMesh)mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);if(![v.x,v.y,v.z].every(Number.isFinite))throw Error('Animationen ger ogiltig geometri.');bounds.expandByPoint(v);}}
  const size=bounds.getSize(new T.Vector3());maxExtent=Math.max(maxExtent,size.x,size.y,size.z);if(maxExtent>8)throw Error('Animation eller tillbehör ligger orimligt långt utanför figuren.');samples++;
 }}
 mixer.stopAllAction();asset.scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.pose();});asset.scene.updateMatrixWorld(true);mixer.uncacheRoot(asset.scene);
 return {rig:c.rig,role:c.role,target:c.target,bones:bones.size,meshes:meshList.length,vertices,triangles,clips:[...clips.keys()],animationSamples:samples,maxExtent,sourceAnimationsPreserved:true,finitePosedGeometry:true,visualQualityCertified:false};
}

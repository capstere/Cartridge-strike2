/** Lazy local CC0 PBR loader for existing Three.js projects. */
const ALLOWED=/^[a-z][a-z0-9-]{0,48}$/;
export function createPBRLibrary({THREE,baseURL=new URL('../../assets/fps/materials/riposte/',import.meta.url),anisotropy=4}={}){
 if(!THREE?.TextureLoader||!THREE?.MeshStandardMaterial)throw new TypeError('Supply THREE');
 const loader=new THREE.TextureLoader(),root=new URL(baseURL,import.meta.url),cache=new Map();let disposed=false;
 async function load(name,{repeatX=1,repeatY=1}={}){
  if(disposed)throw new Error('PBR library disposed');
  if(!ALLOWED.test(name))throw new TypeError('Unsafe material name');
  if(![repeatX,repeatY].every(x=>Number.isFinite(x)&&x>0))throw new TypeError('Invalid repeat');
  if(!cache.has(name))cache.set(name,Promise.all(['map','normal','rough'].map(s=>loader.loadAsync(new URL(name+'/'+s+'.webp',root).href))).catch(e=>{cache.delete(name);throw e;}));
  const originals=await cache.get(name);if(disposed)throw new Error('PBR library disposed');
  const textures=originals.map(src=>{const t=src.clone();t.needsUpdate=true;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(repeatX,repeatY);t.anisotropy=anisotropy;return t;});
  const [map,normalMap,roughnessMap]=textures;map.colorSpace=THREE.SRGBColorSpace;
  if('NoColorSpace' in THREE){normalMap.colorSpace=THREE.NoColorSpace;roughnessMap.colorSpace=THREE.NoColorSpace;}
  const material=new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,roughness:1});
  material.userData={source:'Riposte 5.6.0 CC0 PBR',surface:name};
  let released=false;
  return {material,release(){if(released)return;released=true;textures.forEach(t=>t.dispose());material.dispose();}};
 }
 function dispose(){if(disposed)return;disposed=true;for(const p of cache.values())p.then(ts=>ts.forEach(t=>t.dispose())).catch(()=>{});cache.clear();}
 return {load,dispose};
}

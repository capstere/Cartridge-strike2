/** Local PBR palette. UV coordinates are metres, not per-box 0..1 spans.
 * Color maps are sRGB; OpenGL normals and roughness stay in data space.
 * ambientCG / Poly Haven CC0 provenance and exact source hashes: docs/fps-assets.json.
 */
import * as THREE from '../../vendor/three/three.module.js';

export const MATERIAL_LIBRARY = Object.freeze({
  carpet: { source: 'Fabric045', metres: [.65,.65], color: 0x42494f, roughness: .98, normal: .14, colorMapStrength: .12 },
  'office-carpet': {source:'Fabric045',metres:[.50,.50],color:0x42494f,roughness:.98,normal:.14,colorMapStrength:.12},
  fabric: { source: 'Fabric045', metres: [.38,.38], color: 0x35556d, roughness: .98, normal: .12, colorMapStrength: .12 },
  vinyl: { source: 'Concrete034', metres: [1.1,.55], color: 0xd6dfd7, roughness: .52, normal: .11 },
  labVinyl: { source: 'Concrete034', metres: [1.1,.55], color: 0xb9c9ca, roughness: .67, normal: .055, colorMapStrength: .24 },
  wall: { source: 'WhitePlaster02', metres: [1,1], color: 0xe8e7e1, roughness: .84, normal: .05, colorMapStrength: .14 },
  ceiling: { source: 'WhitePlaster02', metres: [.6,.6], color: 0xe1e3df, roughness: .96, normal: .04, colorMapStrength: .10 },
  wood: { source: 'Wood051', metres: [.8,.8], color: 0xffffff, roughness: .73, normal: .16 },
  table: { color: 0xe7e9e4, roughness: .48 },
  metal: { color: 0xa6afb0, roughness: .40, metalness: .85 },
  paintedMetal: { color: 0x858e90, roughness: .57, metalness: 0 },
  polymer: { color: 0x272e32, roughness: .76 },
  glass: { color: 0xccd8d8, roughness: .19, metalness: 0, transparent: true, opacity: .16, depthWrite: false },
  frostedGlass: { color: 0xd5ddda, roughness: .78, transparent: true, opacity: .50, depthWrite: false },
});

export function createMaterialRegistry(renderer, settings = {}) {
  const loader = new THREE.TextureLoader(), textureCache = new Map(), materials = new Map(), pending = [];
  const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  const anisotropy = Math.min(maxAnisotropy, settings.graphics === 'low' ? 2 : 8);
  function texture(source, channel, metres) {
    const key = `${source}/${channel}/${metres}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const url = new URL(`../../assets/fps/materials/${source}/${source}_1K-JPG_${channel}.jpg`, import.meta.url);
    let resolve, reject;
    pending.push(new Promise((yes,no)=>{resolve=yes;reject=no;}));
    const map = loader.load(url.href, () => resolve(map), undefined, reject);
    map.name = key; map.colorSpace = channel === 'Color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(1/metres[0],1/metres[1]);
    map.anisotropy = anisotropy; textureCache.set(key,map); return map;
  }
  function get(category, options = {}) {
    const spec = MATERIAL_LIBRARY[category] || MATERIAL_LIBRARY.polymer;
    const key = `${category}:${JSON.stringify(options)}`;
    if (materials.has(key)) return materials.get(key);
    const params = {color:spec.color,roughness:spec.roughness ?? .7,metalness:spec.metalness ?? 0};
    for (const prop of ['transparent','opacity','depthWrite']) if (spec[prop] != null) params[prop] = spec[prop];
    if (spec.transparent) params.side = THREE.DoubleSide;
    if (spec.source) {
      params.map = texture(spec.source,'Color',spec.metres);
      params.normalMap = texture(spec.source,'NormalGL',spec.metres);
      params.roughnessMap = texture(spec.source,'Roughness',spec.metres);
      params.normalScale = new THREE.Vector2(spec.normal,spec.normal);
    }
    if(category==='metal'){
      // Fine directional brushing in gloss, shared by all exposed-steel variants.
      if(!textureCache.has('steel-brush')){
        const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
        for(let y=0;y<128;y++){const v=240+(y*17%15);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(0,y,128,1);}
        const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=anisotropy;t.name='fine-steel-brushing';textureCache.set('steel-brush',t);
      }
      params.roughnessMap=textureCache.get('steel-brush');
    }
    const material = new THREE.MeshStandardMaterial({...params,...options});
    // A fresh paint coat retains microtexture while suppressing bare plaster mottling.
    // Only the color-map contribution is reduced; standard PBR lighting/normal/roughness remain.
    if(spec.colorMapStrength != null){
      material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, ${spec.colorMapStrength.toFixed(3)});`);};
      material.customProgramCacheKey=()=>`paint-map-${spec.colorMapStrength}`;
    }
    material.name = `floor5-${category}`; material.userData.category = category;
    material.userData.uvUnits = 'metres'; materials.set(key,material); return material;
  }
  for (const category of Object.keys(MATERIAL_LIBRARY)) get(category);
  return {get,materials,textures:textureCache,ready:Promise.all(pending),
    dispose(){for(const m of materials.values())m.dispose();for(const t of textureCache.values())t.dispose();materials.clear();textureCache.clear();}};
}

/** Apply metre UVs to an already scaled, unindexed box or arbitrary axis-aligned mesh.
 * Wall facing planes use horizontal X/Z and vertical Y; top planes use X/Z.
 * For rotated furniture call before rotation, after scaling.
 */
export function applyMetreUV(geometry) {
  const pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=[];
  for(let i=0;i<pos.count;i++) {
    const nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i)),nz=Math.abs(normal.getZ(i));
    if(ny>=nx&&ny>=nz)uv.push(pos.getX(i),pos.getZ(i));
    else if(nx>=nz)uv.push(pos.getZ(i),pos.getY(i));
    else uv.push(pos.getX(i),pos.getY(i));
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geometry;
}

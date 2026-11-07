/** Selected original NORD-01 assets, not the complete private portfolio.
 * All units are meters, +Y up, front +Z. This owns presentation resources only;
 * callers place inside existing furniture/walls and keep authoritative collision.
 */
import {createAssetLibrary} from './static-asset-library.mjs';

export const FACILITY_CATALOG = {
  "schemaVersion": 1,
  "assets": [
    {
      "id": "access_terminal",
      "name": "Access Terminal",
      "lodDistance": 5,
      "dimensions": [
        0.23,
        0.34,
        0.1015
      ],
      "lods": [
        {
          "level": 0,
          "path": "models/nord01-access_terminal-lod0.glb",
          "triangles": 708,
          "primitives": 5,
          "bytes": 29648,
          "sha256": "8fcd1685b7908e27e98daae25fae0fa75da13c3b88f3aa966db6694839ba538c"
        },
        {
          "level": 2,
          "path": "models/nord01-access_terminal-lod2.glb",
          "triangles": 432,
          "primitives": 4,
          "bytes": 18576,
          "sha256": "6af1b9a3f74a827cb66024e7b44140e7427dee006a6ad3302d1f008d6f54fdfe"
        }
      ]
    },
    {
      "id": "wall_vent",
      "name": "Wall Vent",
      "lodDistance": 7,
      "dimensions": [
        0.62,
        0.42,
        0.0885
      ],
      "lods": [
        {
          "level": 0,
          "path": "models/nord01-wall_vent-lod0.glb",
          "triangles": 1080,
          "primitives": 3,
          "bytes": 40648,
          "sha256": "25482d2abec3a01920b9f213bf5df6223ac5df4df3a578a53da7c095e2c97757"
        },
        {
          "level": 2,
          "path": "models/nord01-wall_vent-lod2.glb",
          "triangles": 540,
          "primitives": 3,
          "bytes": 22048,
          "sha256": "5b0b934e822c8275bfee08812a3dbd1940fda3d8174f6247b336824748e8ef99"
        }
      ]
    },
    {
      "id": "strip_light",
      "name": "Strip Light",
      "lodDistance": 0,
      "dimensions": [
        1.2,
        0.0905,
        0.1425
      ],
      "lods": [
        {
          "level": 0,
          "path": "models/nord01-strip_light-lod0.glb",
          "triangles": 324,
          "primitives": 3,
          "bytes": 14632,
          "sha256": "11785a1708dfae00d37628e3f06dee5cf95175ce49b0fc5bd867f0bd83b96f53"
        }
      ]
    },
    {
      "id": "security_locker",
      "name": "Security Locker",
      "lodDistance": 13,
      "dimensions": [
        0.72,
        1.82,
        0.5405
      ],
      "lods": [
        {
          "level": 0,
          "path": "models/nord01-security_locker-lod0.glb",
          "triangles": 972,
          "primitives": 5,
          "bytes": 38028,
          "sha256": "4368ceb4cd3a26d1c8a3ead0413f71cd5204274410b46b031c423b5d1388b277"
        },
        {
          "level": 2,
          "path": "models/nord01-security_locker-lod2.glb",
          "triangles": 432,
          "primitives": 4,
          "bytes": 18476,
          "sha256": "a08cb42c5a564981f520c2c38aaed6f82e448926a501cf7fe6b0dd14a56a5028"
        }
      ]
    },
    {
      "id": "supply_crate",
      "name": "Supply Crate",
      "lodDistance": 0,
      "dimensions": [
        0.84,
        0.44,
        0.614
      ],
      "lods": [
        {
          "level": 0,
          "path": "models/nord01-supply_crate-lod0.glb",
          "triangles": 540,
          "primitives": 4,
          "bytes": 22360,
          "sha256": "a021e8b54ee354f0a41e4ceaa37b994e68e444b8d715033d47d6f3d4bed3a67d"
        }
      ]
    },
    {
      "id": "medical_case",
      "name": "Medical Case",
      "lodDistance": 0,
      "dimensions": [
        0.58,
        0.2375,
        0.4225
      ],
      "lods": [
        {
          "level": 0,
          "path": "models/nord01-medical_case-lod0.glb",
          "triangles": 540,
          "primitives": 4,
          "bytes": 22340,
          "sha256": "c7579a593d944d0f32f3554b8ca0b0254de65ae0658d2de0204ef695b6a52b10"
        }
      ]
    }
  ]
};

export function createFacilityAssetLibrary({THREE,GLTFLoader,baseURL=new URL('../../assets/fps/',import.meta.url)}={}){
  const library=createAssetLibrary({THREE,GLTFLoader,baseURL,catalog:FACILITY_CATALOG});
  const handles=new Set();let pending=null,ready=false,disposed=false;
  const metadata=id=>{const asset=FACILITY_CATALOG.assets.find(a=>a.id===id);if(!asset)throw new Error('Unsupported facility asset: '+id);return asset;};
  const assertReady=()=>{if(disposed)throw new Error('Facility assets disposed');if(!ready)throw new Error('Preload facility assets before instantiation');};
  function preload(){
    if(disposed)return Promise.reject(new Error('Facility assets disposed'));
    if(!pending)pending=library.preload(FACILITY_CATALOG.assets.flatMap(a=>a.lods.map(lod=>({id:a.id,lod:lod.level}))))
      .then(()=>{if(disposed)throw new Error('Facility assets disposed');ready=true;})
      .catch(e=>{pending=null;throw e;});
    return pending;
  }
  function track(object,releases,extra={}){
    let released=false;
    const handle={object,...extra,release(){if(released)return;released=true;object.removeFromParent();for(const release of releases)release();handles.delete(handle);}};
    handles.add(handle);return handle;
  }
  function instantiate(id,{quality='standard'}={}){
    assertReady();const asset=metadata(id),specs=quality==='low'?[asset.lods.at(-1)]:asset.lods;
    const parts=specs.map(spec=>library.instantiate(id,{lod:spec.level}));
    const object=parts.length===1?parts[0].object:new THREE.LOD();
    if(parts.length>1){object.name='facility-'+id;parts.forEach((part,i)=>object.addLevel(part.object,i?asset.lodDistance:0,.18));}
    object.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
    object.userData.facilityAsset=id;
    return track(object,parts.map(part=>()=>part.release()),{metadata:asset});
  }
  /** Repeated static fixtures can share a batch per room/sector. No cross-room
   * super-batch: keep bounds local so Three's ordinary frustum culling works.
   * Matrix transforms are local to the returned object, matching Object3D use.
   */
  function instantiateBatch(id,matrices,{quality='standard'}={}){
    assertReady();const asset=metadata(id);
    if(!matrices.length)throw new RangeError('Facility batch requires placements');
    if(matrices.some(m=>!m?.isMatrix4||m.elements.some(x=>!Number.isFinite(x))))throw new TypeError('Supply finite Matrix4 placements');
    const part=library.instantiate(id,{lod:quality==='low'?asset.lods.at(-1).level:0});
    part.object.updateMatrixWorld(true);
    const object=new THREE.Group(),batches=[],matrix=new THREE.Matrix4();object.name='facility-batch-'+id;
    part.object.traverse(o=>{if(!o.isMesh)return;
      const batch=new THREE.InstancedMesh(o.geometry,o.material,matrices.length);
      batch.name=o.name;batch.castShadow=false;batch.receiveShadow=true;
      matrices.forEach((placement,index)=>batch.setMatrixAt(index,matrix.multiplyMatrices(placement,o.matrixWorld)));
      batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();object.add(batch);batches.push(batch);
    });
    object.userData.facilityAsset=id;object.userData.instanceCount=matrices.length;
    return track(object,[()=>{for(const b of batches)b.dispose();part.release();}],{metadata:asset});
  }
  function dispose(){if(disposed)return;disposed=true;for(const h of [...handles])h.release();library.dispose();ready=false;pending=null;}
  const stats=()=>({...library.stats(),placements:handles.size,ready});
  return {preload,instantiate,instantiateBatch,dispose,stats};
}

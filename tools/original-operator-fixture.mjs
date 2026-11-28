import {readFile} from 'node:fs/promises';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';

export async function originalOperator(gender) {
  const file=new URL('../assets/fps/models/quaternius-operator-'+gender+'.glb',import.meta.url);
  const bytes=await readFile(file);
  const loader=new GLTFLoader();
  loader.register(parser=>{
    for(const material of parser.json.materials) {
      for(const field of [material,material.pbrMetallicRoughness||{}]) {
        for(const key of Object.keys(field)) if (key.endsWith('Texture')) delete field[key];
      }
    }
    return {name:'cpu-rig-fixture'};
  });
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}

/** Headless geometry/animation check. Textures are NOT rendered or certified. */
import * as T from '../vendor/three/three.module.js';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
export function characterDataLoader(){
 return new GLTFLoader().register(()=>({name:'NODE_NO_IMAGE_DECODE',loadTexture(){const t=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);t.needsUpdate=true;return Promise.resolve(t);}}));
}
export const asBuffer=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);

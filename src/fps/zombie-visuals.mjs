import * as T from '../../vendor/three/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {cloneSkinned} from './skinned-clone.mjs';
import {POSES,zombiePosition} from './zombie-poses.mjs';

async function loadModel(kind){
  const url=new URL('../../assets/fps/zombies/'+kind+'.glb.gz',import.meta.url);
  const response=await fetch(url);if(!response.ok)throw Error('Zombie model '+kind+' HTTP '+response.status);
  const packed=await response.arrayBuffer();
  // Some static hosts supply Content-Encoding. Browsers then decompress before fetch resolves.
  const glb=new Uint8Array(packed)[0]===0x1f
    ? await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : packed;
  const {scene,animations}=await new GLTFLoader().parseAsync(glb,url.href);
  const clips=new Map();
  for(const original of animations){
    // Only the hips translation is private to the in-place playback clip. Preserve
    // the authored vertical curve, every joint rotation and every source sampler.
    const tracks=original.tracks.map(track=>{
      if(track.name!=='mixamorigHips.position')return track;
      const fixed=track.clone();
      for(let i=0;i<fixed.values.length;i+=3){fixed.values[i]=0;fixed.values[i+2]=0;}
      return fixed;
    });
    clips.set(original.name,new T.AnimationClip(original.name,original.duration,tracks));
  }
  for(const name of Object.values(POSES[kind]))if(!clips.has(name))throw Error(kind+' is missing '+name);
  return {scene,clips};
}

function releaseSource({scene}){
  const materials=new Set(),maps=new Set();
  scene.traverse(n=>{n.geometry?.dispose();n.skeleton?.dispose();for(const m of [].concat(n.material||[]))materials.add(m);});
  for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)maps.add(v);m.dispose();}
  for(const map of maps){map.dispose();map.source?.data?.close?.();}
}

export class ZombieVisuals{
  constructor(scene,mobile){
    this.scene=scene;this.mobile=mobile;this.sources=new Map();this.instances=new Map();
    this.frustum=new T.Frustum();this.projection=new T.Matrix4();this.sphere=new T.Sphere(new T.Vector3(),1.65);
    this.ready=Promise.all(['hollow','tattered'].map(async kind=>{
      const source=await loadModel(kind);if(this.disposed)releaseSource(source);else this.sources.set(kind,source);
    }));
  }
  instance(z){
    let v=this.instances.get(z.id);
    if(v&&v.kind!==z.model){this.remove(v);this.instances.delete(z.id);v=null;}
    if(!v){
      const source=this.sources.get(z.model);if(!source)return null;
      const root=cloneSkinned(source.scene);root.name=z.name;root.visible=false;
      this.scene.add(root);
      v={kind:z.model,root,mixer:new T.AnimationMixer(root),clips:source.clips,last:-Infinity};
      this.instances.set(z.id,v);
    }
    return v;
  }
  update(game,camera){
    if(!game)return;
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const t=game.state.time;
    for(const z of game.state.zombies||[]){
      const v=this.instance(z);if(!v)continue;
      const p=zombiePosition(z,t);this.sphere.center.set(p.x,p.y+.74,p.z);
      const distance=camera.position.distanceToSquared(this.sphere.center);
      const visible=this.frustum.intersectsSphere(this.sphere)&&distance<(this.mobile?42:58)**2;
      const arrived=!v.root.visible || v.occupant!==z;
      v.root.visible=visible;if(!visible)continue;
      v.root.position.set(p.x,p.y,p.z);v.root.rotation.y=z.yaw+Math.PI;
      const changed=v.occupant!==z||v.started!==z.poseAt||v.clip!==z.clip||v.rate!==z.rate;
      if(changed){
        v.previous?.stop();v.previous=null;
        const next=v.mixer.clipAction(v.clips.get(z.clip));
        if(v.current && v.current!==next && !arrived)v.previous=v.current;
        else v.current?.stop();
        v.current=next;next.reset().setLoop(z.loop?T.LoopRepeat:T.LoopOnce,z.loop?Infinity:1).play();
        next.clampWhenFinished=!z.loop;next.paused=true;
        v.occupant=z;v.started=z.poseAt;v.clip=z.clip;v.rate=z.rate;v.blendAt=t;
      }
      const cadence=distance>18**2?.125:distance>9**2?.066:0;
      if(!changed&&!arrived&&(t===v.last||t-v.last<cadence||v.final))continue;
      const duration=v.current.getClip().duration,elapsed=(t-z.poseAt)*z.rate+z.offset;
      v.current.time=z.loop?((elapsed%duration)+duration)%duration:Math.max(0,Math.min(duration,elapsed));
      const weight=v.previous?Math.min(1,Math.max(0,(t-v.blendAt)/.18)):1;
      v.current.setEffectiveWeight(weight);
      if(v.previous){v.previous.setEffectiveWeight(1-weight);if(weight===1){v.previous.stop();v.previous=null;}}
      v.mixer.update(0);v.last=t;v.final=!z.alive && v.current.time===duration && weight===1;
    }
  }
  clear(){
    for(const v of this.instances.values()){
      v.root.visible=false;v.mixer.stopAllAction();v.current=v.previous=v.occupant=null;
      v.last=-Infinity;v.final=false;
    }
  }
  remove(v){
    v.mixer.stopAllAction();v.mixer.uncacheRoot(v.root);v.root.removeFromParent();
    v.root.traverse(n=>n.skeleton?.dispose());
  }
  dispose(){
    this.disposed=true;for(const v of this.instances.values())this.remove(v);
    for(const s of this.sources.values())releaseSource(s);
    this.instances.clear();this.sources.clear();
  }
}

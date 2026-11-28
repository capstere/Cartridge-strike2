// Adapted from Riposte 09o-vitrine.js (MIT), using the existing lobby GPU context.
import * as T from '../../vendor/three/three.module.js';
import {makeWeapon,releaseWeaponFittings} from './models.mjs?v=6.1.2';

export function arsenalPreview(renderer) {
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(24,1,.015,20);
  scene.background=new T.Color(0x425868);
  scene.add(new T.HemisphereLight(0xe3edfa,0x535b65,1.5));
  for(const [color,intensity,x,y,z] of [[0xffedcc,2.6,-2,3,2],[0x94bdf2,1.8,2,1,-1]]){
    const light=new T.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);
  }
  let target,pixels,image;
  // Each slot owns just its current instance. The world model factory shares the bare meshes.
  const instances=new Map();
  function clear(){
    for(const {model} of instances.values()){releaseWeaponFittings(model);model.removeFromParent();}
    instances.clear();target?.dispose();target=null;pixels=null;image=null;
  }
  function draw(canvas,spec,yaw=0){
    const key=JSON.stringify([spec.id,spec.attachments,spec.camo]);
    let instance=instances.get(canvas);
    if(instance?.key!==key){
      if(instance){releaseWeaponFittings(instance.model);instance.model.removeFromParent();}
      const model=makeWeapon(spec.id,{viewmodel:false,attachments:spec.attachments,camo:spec.camo});
      const bounds=new T.Box3().setFromObject(model),centre=bounds.getCenter(new T.Vector3());
      instance={key,model,centre,size:bounds.getSize(new T.Vector3())};
      instances.set(canvas,instance);
    }
    const width=canvas.width,height=canvas.height;
    if(!width||!height)return;
    if(!target){
      target=new T.WebGLRenderTarget(width,height,{depthBuffer:true});
      target.texture.colorSpace=T.SRGBColorSpace;
    }
    target.setSize(width,height);
    if(image?.width!==width||image?.height!==height){
      pixels=new Uint8Array(width*height*4);image=new ImageData(width,height);
    }
    const {model,centre,size}=instance;
    camera.aspect=width/height;camera.updateProjectionMatrix();
    const halfFov=Math.tan(T.MathUtils.degToRad(camera.fov*.5));
    const dist=Math.max(size.y,size.z/camera.aspect,size.x/camera.aspect)*.62/halfFov+size.x*.6;
    camera.position.set(centre.x-dist*Math.cos(yaw),centre.y+dist*.12,centre.z+dist*Math.sin(yaw));
    camera.lookAt(centre);
    const prior=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    scene.add(model);
    try{
      renderer.autoClear=true;renderer.setRenderTarget(target);renderer.render(scene,camera);
      renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    }finally{renderer.setRenderTarget(prior);renderer.autoClear=autoClear;model.removeFromParent();}
    const stride=width*4;
    for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-y-1)*stride,(height-y)*stride),y*stride);
    canvas.getContext('2d').putImageData(image,0,0);
  }
  return {draw,clear};
}

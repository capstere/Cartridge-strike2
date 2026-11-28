// Riposte 09i-modes domBuild/domColor: zone circumference, pole and raised flag.
// One instanced draw per shape for all three sites, owned by the map renderer.
import * as T from '../../vendor/three/three.module.js';
const count=3;
export class DominationFlags{
  constructor(scene){
    this.root=new T.Group();this.root.name='domination-flags';
    this.pose=new T.Object3D();this.color=new T.Color();
    const ring=new T.RingGeometry(.97,1,40);ring.rotateX(-Math.PI/2);
    const pole=new T.CylinderGeometry(.04,.05,2.8,6);
    const flag=new T.PlaneGeometry(1,.62);flag.translate(.5,0,0);
    const batch=(geometry,options={})=>{
      const material=new T.MeshBasicMaterial(options);
      const mesh=new T.InstancedMesh(geometry,material,count);
      mesh.frustumCulled=false;this.root.add(mesh);return mesh;
    };
    this.rings=batch(ring,{transparent:true,opacity:.86,depthWrite:false});
    this.poles=batch(pole,{color:0x635f54});
    this.flags=batch(flag,{side:T.DoubleSide});
    scene.add(this.root);
  }
  update(zones,team,time){
    this.root.visible=true;
    const pose=this.pose;
    const apply=(mesh,i,x,y,z,scale,angle=0)=>{
      pose.position.set(x,y,z);pose.rotation.set(0,angle,0);pose.scale.setScalar(scale);
      pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
    };
    for(const [i,z] of zones.entries()){
      const color=this.color.setHex(z.contested?0xf4b94e:!z.owner?0xa8adb0:z.owner===team?0x4eb9a9:0xdf7462);
      this.rings.setColorAt(i,color);this.flags.setColorAt(i,color);
      apply(this.rings,i,z.x,z.y+.045,z.z,z.radius);
      apply(this.poles,i,z.x,z.y+1.4,z.z,1);
      apply(this.flags,i,z.x,z.y+.5+2*Math.abs(z.progress),z.z,1,Math.sin(time*2.2+i)*.25);
    }
    for(const mesh of this.root.children){
      mesh.count=zones.length;mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }
  dispose(){
    this.root.removeFromParent();
    for(const mesh of this.root.children){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}
  }
}

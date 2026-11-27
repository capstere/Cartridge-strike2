// Adapted from Riposte's groundHeight, collideCircle and ceilingAbove (MIT).
// Board coordinates, heights and radius are in metres. One source volume can
// stop an actor, stop a shot, do both, or act only as an invisible shore edge.
import {SpatialIndex} from './physics.mjs';

const STEP = .45;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const inside = (x,z,b) => x>=b[0] && x<=b[1] && z>=b[2] && z<=b[3];
const project = (v,lo,hi) => clamp(v,lo,hi);
function rampY(r,x,z){
  const t=r.axis==='x'?(x-r.x0)/(r.x1-r.x0):(z-r.z0)/(r.z1-r.z0);
  return r.h0+(r.h1-r.h0)*clamp(t,0,1);
}

export function createReferenceTerrain(spec){
  const {bounds,water,holes,ramps}=spec;
  const index=new SpatialIndex(4),nearby=[];
  const solids=spec.solids.map(([x0,x1,y0,y1,z0,z1,material,rayOnly,noRay,invisible,prop],i)=>{
    const b={id:'volume-'+i,x0,x1,y0,y1,z0,z1,material,rayOnly,noRay,invisible,prop};
    index.insert(b,{minX:x0,maxX:x1,minZ:z0,maxZ:z1});
    return b;
  });
  function lowerSurface(x,z){
    if(water&&inside(x,z,water.box)&&!water.land.some(box=>inside(x,z,box)))return water.floor;
    for(const h of holes)if((x-h.x)**2+(z-h.z)**2<h.r*h.r)return h.y;
    return 0;
  }
  function groundHeight(x,z,y,r=.20){
    let floor=lowerSurface(x,z);
    for(const b of index.query(x,z,r,nearby)){
      if(b.rayOnly||b.y1>y+STEP||b.y1<=floor)continue;
      if(x+r*.5>=b.x0&&x-r*.5<=b.x1&&z+r*.5>=b.z0&&z-r*.5<=b.z1)floor=b.y1;
    }
    for(const ramp of ramps){
      if(x<ramp.x0||x>ramp.x1||z<ramp.z0||z>ramp.z1)continue;
      const h=rampY(ramp,x,z);if(h<=y+STEP&&h>floor)floor=h;
    }
    return floor;
  }
  function ceiling(x,z,y,r){
    let limit=Infinity;
    for(const b of index.query(x,z,r,nearby)){
      if(b.rayOnly||b.y0<y-.05||b.y0>=limit)continue;
      if(x+r*.7>=b.x0&&x-r*.7<=b.x1&&z+r*.7>=b.z0&&z-r*.7<=b.z1)limit=b.y0;
    }
    return limit;
  }
  function scopeAllowed(x,z,r=.20){
    return x>=bounds.x0+r&&x<=bounds.x1-r&&z>=bounds.z0+r&&z<=bounds.z1-r;
  }
  function obstacles(x,z,y,r,height,resolve){
    let changed=false;
    const push=(x0,x1,z0,z1)=>{
      const dx=x-project(x,x0,x1),dz=z-project(z,z0,z1),d2=dx*dx+dz*dz;
      if(d2>=r*r-1e-10)return;
      changed=true;
      if(!resolve)return;
      if(d2>1e-10){const d=Math.sqrt(d2);x+=dx*(r-d)/d;z+=dz*(r-d)/d;}
      else{
        const l=x-x0,right=x1-x,front=z-z0,back=z1-z,m=Math.min(l,right,front,back);
        if(m===l)x=x0-r;else if(m===right)x=x1+r;else if(m===front)z=z0-r;else z=z1+r;
      }
    };
    for(const b of index.query(x,z,r,nearby)){
      if(!b.rayOnly&&b.y1>y+STEP&&b.y0<y+height)push(b.x0,b.x1,b.z0,b.z1);
    }
    for(const ramp of ramps){
      // A cylinder inside the ramp footprint stands on its interpolated top.
      if(x>=ramp.x0&&x<=ramp.x1&&z>=ramp.z0&&z<=ramp.z1)continue;
      if(rampY(ramp,clamp(x,ramp.x0,ramp.x1),clamp(z,ramp.z0,ramp.z1))>y+STEP)push(ramp.x0,ramp.x1,ramp.z0,ramp.z1);
    }
    return {x,z,changed};
  }
  function canOccupy(x,z,r=.20,h=1.70,y=0){
    return scopeAllowed(x,z,r)&&!obstacles(x,z,y,r,h,false).changed&&ceiling(x,z,y+.05,r)>=y+h-.01;
  }
  function move(actor,dx,dy,dz){
    const r=actor.radius||.20,h=actor.height||1.7;
    const steps=Math.max(1,Math.ceil(Math.max(Math.hypot(dx,dz),Math.abs(dy))/.18));
    const result={onGround:false,ceiling:false,collision:false};
    for(let i=0;i<steps;i++){
      let x=clamp(actor.x+dx/steps,bounds.x0+r,bounds.x1-r),z=clamp(actor.z+dz/steps,bounds.z0+r,bounds.z1-r);
      for(let pass=0;pass<3;pass++){
        const p=obstacles(x,z,actor.y,r,h,true);x=p.x;z=p.z;if(!p.changed)break;result.collision=true;
      }
      const floor=groundHeight(x,z,actor.y,r),beforeHead=actor.y+h;
      let y=actor.y+dy/steps;
      const roof=dy>0?ceiling(x,z,beforeHead,r):Infinity;
      if(y+h>roof){y=roof-h;result.ceiling=true;}
      result.onGround=y<=floor+.001;
      actor.x=x;actor.z=z;actor.y=result.onGround?floor:y;
    }
    actor.onGround=result.onGround;
    return result;
  }
  return {groundHeight,scopeAllowed,canOccupy,move,solids,index,lowerSurface,
    canStand:(actor,h)=>canOccupy(actor.x,actor.z,actor.radius,h,actor.y)};
}

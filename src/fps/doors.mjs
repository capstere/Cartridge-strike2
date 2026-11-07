/** Doors use the reviewed apertures, never inferred wall cuts or a second floorplan.
 * Simulation owns angles, obstruction safety and collision. Rendering only reads them.
 */
import {createStartElevators} from './start-elevators.mjs';
import {circleHitsBox} from './physics.mjs';
export const DOOR_OPEN_ANGLE=Math.PI/2;
export const DOOR_HOLD_SECONDS=2.5;
export function createDoors(data,physics){
 const elevators=createStartElevators(data.doors),skipped=[],doors=[],boxes=[...elevators.boxes];
 for(const source of data.doors){
  if(source.startElevator)continue;
  const reason=source.removed?'removed-by-owner':source.lockedUntilImplemented?'fixed-'+source.doorType:source.blocked?'blocked':source.kind!=='door-aperture'||source.passageOpenConfirmed?'open-passage':null;
  if(reason){skipped.push({id:source.id,reason});continue;}
  const dx=source.b[0]-source.a[0],dz=source.b[1]-source.a[1],width=Math.hypot(dx,dz),ux=dx/width,uz=dz/width;
  const door={id:source.id,doorStyle:source.doorStyle,studioColor:source.studioColor,x:source.center[0],z:source.center[1],width,ux,uz,nx:-uz,nz:ux,angle:0,target:0,sign:1,holdUntil:0,leaves:[],accessCard:source.accessCardConfirmed,type:source.doorType||'ordinary'};
  // Pivot inside the jamb, not 5cm inside the clear aperture: narrow WC doors remain passable.
  const count=width>1.3?2:1,w=(width-.025)/count;
  for(let i=0;i<count;i++){
   const side=i===0?1:-1,p=side===1?source.a:source.b;
   const leaf={door,side,x:p[0]+ux*.0125*side,z:p[1]+uz*.0125*side,w,base:-Math.atan2(dz,dx)+(i?Math.PI:0)};
   leaf.box={id:source.id+'-moving-leaf-'+i,doorId:source.id,x:0,y:1.15,z:0,w,h:2.23,d:.08,material:'metal',angle:0,cos:1,sin:0};
   leaf.box.broadphaseBounds={minX:leaf.x-w-.08,maxX:leaf.x+w+.08,minZ:leaf.z-w-.08,maxZ:leaf.z+w+.08};
   door.leaves.push(leaf);boxes.push(leaf.box);
  }
  doors.push(door);
 }
 function pose(door,angle=door.angle,sign=door.sign){
  for(const leaf of door.leaves){const b=leaf.box,a=leaf.base+angle*sign*leaf.side;b.angle=a;b.cos=Math.cos(a);b.sin=Math.sin(a);b.x=leaf.x+b.cos*leaf.w/2;b.z=leaf.z-b.sin*leaf.w/2;}
 }
 function scoreSwing(d,sign){
  let score=0;
  // Prefer the side with room for the full swing. The existing aperture/furniture
  // still defines the available space; no wall or obstacle is removed.
  for(const angle of [.35,.75,1.2,DOOR_OPEN_ANGLE])for(const leaf of d.leaves){const a=leaf.base+angle*sign*leaf.side;
   for(const u of [.25,.55,.9])if(physics.staticCanOccupy(leaf.x+Math.cos(a)*leaf.w*u,leaf.z-Math.sin(a)*leaf.w*u,.045,1.7,.18))score++;
  }return score;
 }
 for(const d of doors){d.swingScores=[scoreSwing(d,-1),scoreSwing(d,1)];d.sign=d.swingScores[0]>d.swingScores[1]?-1:1;d.defaultSign=d.sign;pose(d);}
 const living=a=>a.alive!==false&&!a.rescued;
 const near=(d,a,range)=>{const x=a.x-d.x,z=a.z-d.z;return Math.abs(x*d.ux+z*d.uz)<d.width/2+(a.radius||.2)+.16&&Math.abs(x*d.nx+z*d.nz)<range;};
 function request(d,time,actor){
  if(d.angle<.02&&actor){
   const away=(actor.x-d.x)*d.nx+(actor.z-d.z)*d.nz>=0?1:-1;
   // Double-action hinges open away from the first approaching body. Choosing
   // the default swing here can trap a runner between the opening leaf and jamb.
   d.sign=away;
  }
  d.target=DOOR_OPEN_ANGLE;d.holdUntil=Math.max(d.holdUntil,time+DOOR_HOLD_SECONDS);
 }
 function update(time,dt,actors=[]){
  let changed=false;
  for(const d of doors){
   // Open early enough for a running player, bots and escorted hostages. Do not
   // close while anyone occupies the sweep or is crossing from either side.
   let occupied=false;
   for(const a of actors){if(!living(a))continue;const dx=a.x-d.x,dz=a.z-d.z,r=d.width+.55+(a.radius||.2);if(dx*dx+dz*dz<r*r)occupied=true;if(near(d,a,2.05))request(d,time,a);}
   if(time>=d.holdUntil&&!occupied)d.target=0;
   const next=d.angle+Math.sign(d.target-d.angle)*Math.min(Math.abs(d.target-d.angle),dt*(d.target?4.8:1.55));
   if(next===d.angle)continue;
   pose(d,next);
   // Opening uses near-contact tolerance so narrow WC approaches do not deadlock.
   // Closing keeps the larger safety margin; exact capsule collision remains unchanged.
   const hit=actors.some(a=>living(a)&&(a.y||0)<2.27&&(a.y||0)+(a.height||1.7)>.035&&d.leaves.some(l=>circleHitsBox(a.x,a.z,(a.radius||.2)+(d.target>d.angle?.001:.035),l.box)));
   if(hit){pose(d);d.holdUntil=time+DOOR_HOLD_SECONDS;d.target=DOOR_OPEN_ANGLE;continue;}
   d.angle=next;changed=true;
  }return changed;
 }
 function reset(){for(const d of doors){d.angle=0;d.target=0;d.holdUntil=0;d.sign=d.defaultSign;pose(d);}}
 function nearest(actor,range=2.2){let found=null,best=range;for(const d of doors){const distance=Math.hypot(d.x-actor.x,d.z-actor.z);if(distance<best){best=distance;found=d;}}return found;}
 return {doors,boxes,elevators,skipped,update,reset,request,nearest,pose,report:{installed:doors.length,leaves:boxes.length,skipped}};
}

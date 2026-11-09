/** Surveyed points on the published, furnished Unit 05 navigation graph. */
export const isZombieFloor = world => world.project?.intent?.floor5Preparation?.integration?.defaultLevel==='floor5-prepared';
export const distanceXZ=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const SITES=[
  ['I25',42.7,25.2], ['C03',-16.02,1.18], ['I26',42.7,4.9], ['I04',-11.2,-7],
  ['I02',-24.455,-9.123], ['C06',-39.98,-4.17], ['I09',2.8,14], ['I20',33.6,16.1],
  ['C12',27.3,18.9], ['I23',43.4,15.4], ['I28',42,-20.3], ['C15',-32.192,16.455], ['C18',-38.5,10.5], ['I24',39.9,21],
  ['C22',-7.7,27.3], ['I17',18.2,14.7],
];
const cache=new WeakMap();
export function zombieSites(world) {
  if(cache.has(world)) return cache.get(world);
  const a=world.anchors, critical=[...a.analysts,...a.counterAnalysts,...a.hostages,a.bomb,a.rescue].filter(Boolean);
  const safe=p=>critical.every(o=>distanceXZ(p,o)>Math.max(4,o.radius||0)+.8);
  const patrol=SITES.map(([room,x,z])=>({room,x,z})).filter(p=>
    world.roomAt(p.x,p.z)?.id===p.room && safe(p) && world.canOccupy(p.x,p.z,.24,1.7) && world.navigation.nearest(p));
  const bed=patrol.find(p=>p.room==='I25' && world.canOccupy(p.x,p.z,1.04,1.7));
  // The chair back is at local +Z. This end chair faces the desk. Its open
  // aisle lies off the front corner, so the occupant sits facing out at an angle.
  let chair=null;
  for(const [id,angle] of [['fps-I16-desk-1-chair',1.06],['fps-I14-desk-0-chair',1.4],['V1-SEAT-1L5',-1.06]]) {
    const item=world.projectScene.items.find(o=>o.id===id && o.assetId==='studio:orange-kitchen-chair');
    if(!item) continue;
    const yaw=item.yaw+angle, p={x:item.x-.62*Math.sin(yaw),z:item.z-.62*Math.cos(yaw)};
    if(safe(p) && world.canOccupy(p.x,p.z,.205,1.7) && world.navigation.nearest(p) &&
       world.segmentClear({...item,y:1},{...p,y:1},{vision:false})) {
      chair={...p,yaw,room:item.roomId,seat:{id,x:item.x-.08*Math.sin(yaw),z:item.z-.08*Math.cos(yaw)}}; break;
    }
  }
  const sites={bed,chair,patrol};cache.set(world,sites);return sites;
}

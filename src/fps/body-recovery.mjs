// A moving door or a neighbouring body can place a capsule just inside the
// graph's conservative door-swing margin. Validate a short physical walk out.
export function physicalRecoveryClear(world,actor,destination,bodies){
  if(!world.navigation.clear(destination,destination,actor.radius))return false;
  const probe={x:actor.x,y:actor.y,z:actor.z,height:actor.height,radius:actor.radius,vy:0};
  const dx=destination.x-actor.x,dz=destination.z-actor.z,steps=Math.ceil(Math.hypot(dx,dz)/.06);
  for(let i=0;i<steps;i++){
    world.move(probe,dx/steps,0,dz/steps);
    if(bodies.some(o=>Math.hypot(o.x-probe.x,o.z-probe.z)<actor.radius+o.radius+.001))return false;
  }
  return Math.hypot(probe.x-destination.x,probe.z-destination.z)<.04;
}

export function rejoinNavigation(game,actor){
  const w=game.world,nav=w.navigation;
  if(!nav?.nodes || nav.clear(actor,actor,actor.radius))return [];
  const bodies=[...game.actors,...game.hostages,...(game.state.zombies||[])].filter(o=>
    o!==actor && o.alive!==false && !o.rescued && Math.hypot(o.x-actor.x,o.z-actor.z)<3);
  const d=p=>Math.hypot(p.x-actor.x,p.z-actor.z);
  const nearby=nav.nodes.filter(p=>Math.abs(p.x-actor.x)<1.65 && Math.abs(p.z-actor.z)<1.65).sort((a,b)=>d(a)-d(b));
  const p=nearby.find(n=>d(n)>.08 && physicalRecoveryClear(w,actor,n,bodies));
  return p?[{x:p.x,z:p.z}]:[];
}

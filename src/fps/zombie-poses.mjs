/** Simulation owns clip selection and time. Both original Mixamo rigs face +Z. */
export const POSES = {
  hollow: {
    walk: 'Walking', run: 'Running', limp: 'Limping_Walk_3_inplace', idle: 'Idle_8',
    sleep: 'Toss_and_Turn', rise: 'Stand_Up4', pain: 'Head_Hold_in_Pain',
    stomp: 'Angry_Ground_Stomp_2', flinch: 'Gunshot_Reaction', strike: 'Hit_Reaction',
    down: 'Knock_Down_1', blast: 'Shot_and_Blown_Back', dead: 'Dead',
    abdominal: 'Fall_Dead_from_Abdominal_Injury', back: 'dying_backwards', front: 'Shot_and_Fall_Forward',
  },
  tattered: {
    walk: 'Walking', run: 'Running', limp: 'Injured_Walk', idle: 'Angry_Ground_Stomp',
    sit: 'Chair_Sit_Idle_M', rise: 'Sit_to_standTransition_Female_2', contortion: 'Burpee_Exercise',
    flare: 'Skill_01', reach: 'mage_soell_cast_2', stomp: 'Angry_Ground_Stomp',
    flinch: 'Gunshot_Reaction', down: 'Knock_Down', blast: 'Shot_and_Blown_Back', dead: 'Dead',
    abdominal: 'Fall_Dead_from_Abdominal_Injury', back: 'Shot_and_Fall_Backward', front: 'Shot_and_Fall_Forward',
  },
};

// One-shot timings are from the GLB samplers (30 fps). The renderer reads the clips themselves.
export const LENGTH = {
  Stand_Up4: 50/30, Sit_to_standTransition_Female_2: 68/30, Head_Hold_in_Pain: 111/30,
  Angry_Ground_Stomp: 41/30, Angry_Ground_Stomp_2: 54/30, Gunshot_Reaction: 3,
  Hit_Reaction: 49/30, Knock_Down: 75/30, Knock_Down_1: 98/30, Shot_and_Blown_Back: 80/30,
  Burpee_Exercise: 95/30, Skill_01: 32/30, mage_soell_cast_2: 3,
  Dead: 89/30, Fall_Dead_from_Abdominal_Injury: 105/30, dying_backwards: 66/30,
  Shot_and_Fall_Backward: 105/30, Shot_and_Fall_Forward: 65/30,
};

export function pose(z, time, state, key, {loop=false, rate=1, offset=0}={}) {
  const clip=POSES[z.model][key];
  z.behavior=state; z.clip=clip; z.poseAt=time; z.rate=rate; z.offset=offset; z.loop=loop;
  z.until=loop || !rate ? Infinity : time+(rate<0?offset:LENGTH[clip]-offset)/Math.abs(rate);
  z.moving=0;
}

export function seatWeight(z, time) {
  if (!z.seat) return 0;
  if (z.behavior==='sitting') return 1;
  if (z.seatExitAt==null) return 0;
  const t=Math.max(0,Math.min(1,(time-z.seatExitAt)/z.seatExitDuration));
  return 1-t*t*(3-2*t);
}

export function zombiePosition(z,time) {
  const w=seatWeight(z,time);
  return {x:z.x+((z.seat?.x??z.x)-z.x)*w, y:z.y, z:z.z+((z.seat?.z??z.z)-z.z)*w};
}

export function bodyHeight(z, time) {
  const progress=Math.max(0,Math.min(1,(time-z.poseAt)/(LENGTH[z.clip]||1)));
  switch(z.behavior){
    case 'sleeping': return .52;
    case 'sitting': return 1.4;
    case 'rising': return z.seat ? 1.4+.3*progress : .52+1.18*progress;
    case 'knockdown': return 1.7-1.18*Math.min(1,progress*2.4);
    case 'recovering': return .52+1.18*progress;
    default: return 1.7;
  }
}

/** A low body occupies length along the local rig axis. Use the same ray/box
 * intersection as soldiers, in model coordinates, including the seat offset. */
export function zombieRay(origin, dir, z, limit, rayBox) {
  const p=zombiePosition(z,z.bodyTime), c=Math.cos(z.yaw), s=Math.sin(z.yaw);
  const x=origin.x-p.x, dz=origin.z-p.z;
  const local={x:c*x-s*dz,y:origin.y-p.y,z:s*x+c*dz};
  const ray={x:c*dir.x-s*dir.z,y:dir.y,z:s*dir.x+c*dir.z};
  const low=Math.max(0,Math.min(1,(1.4-z.height)/.85));
  return rayBox(local,ray,{x:0,y:0,z:.13*low,radius:.265,height:z.height},limit,.26+.67*low);
}

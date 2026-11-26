import {createDoors} from '../../src/fps/doors.mjs';

export const DOOR_FIELDS=['angle','target','sign','holdUntil'];
export const ELEVATOR_OPEN_SECONDS=1.5;
// These are the published spawn cabins, not moving platforms. Their two
// existing shutters open once per room, beginning when the first human is ready.
export function advanceNetworkWorld(doors,state,time,dt,actors){
  doors.update(time,dt,actors);
  const progress=state.elevatorOpenAt<0?0:Math.max(0,Math.min(1,(time-state.elevatorOpenAt)/ELEVATOR_OPEN_SECONDS));
  return doors.elevators.setProgress(progress);
}
export function prepareNetworkWorld(world){
  if(world.project?.mode==='new-level'){
    // Online worlds have already been selected from the published map registry.
    for(const zone of [...world.data.rooms,...world.data.corridors])zone.publicName=zone.name;
    world.tactical.patrolPoints=world.project.navHints.filter(hint=>hint.role==='patrol').map(hint=>{
      const [x,z]=hint.points.at(-1);
      return {x,z};
    });
  }
  world.networkSlice=true;world.enableNetworkGlassThresholds();world.glass.reset();world.doors.reset();
  world.setElevatorProgress?.(0);
  world.networkDynamics={elevatorOpenAt:-1};
  world.advanceNetworkWorld=(time,dt,actors)=>{
    if(advanceNetworkWorld(world.doors,world.networkDynamics,time,dt,actors))world.navigation.invalidate();
  };
  return world;
}
export function applyNetworkWorld(doors,state){
  for(const d of doors.doors){const s=state.doors.get(d.id);if(!s)throw Error('Missing authoritative door '+d.id);
    for(const key of DOOR_FIELDS)d[key]=s[key];doors.pose(d);
  }
  doors.elevators.setProgress(state.elevatorProgress);
}
export function createPredictedWorld(world){
  const doors=createDoors(world.data,world),context=world.createDynamicContext(doors.boxes);
  const state={elevatorOpenAt:-1};
  return {doors,state,
    adopt(snapshot){applyNetworkWorld(doors,snapshot);state.elevatorOpenAt=snapshot.elevatorOpenAt;},
    step(time,dt,actors,move){advanceNetworkWorld(doors,state,time,dt,actors);return world.withDynamicContext(context,move);},
  };
}

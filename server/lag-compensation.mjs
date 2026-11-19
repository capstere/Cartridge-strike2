import {createDoors} from '../src/fps/doors.mjs';
import {INTERPOLATION_MS,REWIND_MS,RTT_FRESH_MS} from '../shared/multiplayer/rules.mjs';

const residentPose=['x','y','z','height','yaw'];

// Echoes are untrusted upper bounds, never proof of network latency. Keep a
// connection's low-water mark: deliberately delaying replies cannot raise it.
export function recordRtt(seat,rtt,now){
  if(!Number.isFinite(rtt)||rtt<0||rtt>1000)return false;
  seat.rtts.push(rtt);if(seat.rtts.length>8)seat.rtts.shift();
  seat.rtt=Math.min(seat.rtt??Infinity,rtt);seat.rttAt=now;return true;
}

/** Read-only Colyseus histories, matching the client's snapshot interpolation.
 * The second door controller is only a ray-query context; it never ticks a world.
 */
export class LagCompensation {
  constructor(room){
    this.room=room;this.tickTimes=new Map();this.shots=new Map();
    this.rewind=room.allowRewindState({maxRewindMs:REWIND_MS});
    this.rewind.attachAll(room.state.actors,{fields:['x','y','z','height']});
    this.rewind.attachAll(room.state.residents,{fields:residentPose});
    this.rewind.attachAll(room.state.doors,{fields:['poseAngle']});
    this.rewind.attach(room.state,{fields:['elevatorProgress']});
    const world=room.sim.game.world;
    this.doors=createDoors(world.data,world);this.context=world.createDynamicContext(this.doors.boxes);
    this.metrics={accepted:0,rejected:0,live:0,ages:[],reasons:{}};
    room.sim.game.hitscanQuery=(...args)=>this.query(...args);
  }
  recordTick(){
    this.tickTimes.set(this.room.sim.tickNumber,this.room.clock.elapsedTime);
    while(this.tickTimes.size>64)this.tickTimes.delete(this.tickTimes.keys().next().value);
  }
  reject(reason){this.metrics.rejected++;this.metrics.reasons[reason]=(this.metrics.reasons[reason]||0)+1;return false;}
  accept(seat,frame,stamp){
    const now=this.room.clock.elapsedTime,anchor=this.tickTimes.get(frame.sampleTick);
    // A never-synced SDK can shoot live; it gets no historic advantage.
    if(stamp===0){this.shots.set(seat.id,0);this.metrics.live++;return true;}
    if(!Number.isFinite(stamp)||stamp>now)return this.reject('future/invalid');
    const age=now-stamp;
    if(age>REWIND_MS)return this.reject('expired');
    if(stamp<seat.lifeStartedAt)return this.reject('previous life');
    if(stamp<(seat.lastShotStamp||0))return this.reject('regressed');
    // Bind the framework's render stamp to the acknowledged simulation tick.
    // Neither a client clock nor a chosen tick alone can select hit history.
    if(anchor===undefined||stamp<anchor-INTERPOLATION_MS-75||stamp>anchor+75)return this.reject('tick/stamp mismatch');
    // Server-originated nonce RTT samples constrain forged render delays too.
    // Allow one patch and scheduler/jitter margin; the absolute cap still wins.
    if(!Number.isFinite(seat.rtt)||!Number.isFinite(seat.rttAt)||now-seat.rttAt>RTT_FRESH_MS){
      // Missing/stale echoes never silently waive the history agreement check.
      // Keep shooting responsive against the live world without rewind credit.
      seat.lastShotStamp=stamp;this.shots.set(seat.id,0);this.metrics.live++;return true;
    }
    if(Math.abs(age-(seat.rtt+INTERPOLATION_MS))>125){
      // A changed real path still permits live fire; delayed echoes buy no history.
      this.metrics.reasons['live RTT mismatch']=(this.metrics.reasons['live RTT mismatch']||0)+1;
      seat.lastShotStamp=stamp;this.shots.set(seat.id,0);this.metrics.live++;return true;
    }
    seat.lastShotStamp=stamp;this.shots.set(seat.id,stamp);this.metrics.accepted++;
    this.metrics.ages.push(age);if(this.metrics.ages.length>512)this.metrics.ages.shift();
    return true;
  }
  query(actor,origin,dir,range){
    const g=this.room.sim.game,stamp=this.shots.get(actor.id);
    if(!stamp)return g.traceHitscan(actor,origin,dir,range);
    const seen=this.rewind.at(stamp),targets=[];
    for(const a of g.actors){
      const s=this.room.state.actors.get(a.id);
      // Discontinuities cannot smear the previous body's pose into a new life.
      // A body killed since the sample still blocks, but cannot be killed twice.
      if(!s?.ready||stamp<s.lifeStartedAt||s.diedAtMs>0&&stamp>=s.diedAtMs)continue;
      targets.push({...seen.read(s,['x','y','z','height']),id:a.id,radius:a.radius,alive:true,entity:a});
    }
    for(const z of g.state.zombies){
      const s=this.room.state.residents.get(z.id);
      if(s?.lifeId!==z.lifeId||stamp<s.lifeStartedAt||s.diedAtMs>0&&stamp>=s.diedAtMs)continue;
      // The projected coordinates already include the seat offset. Rewind
      // the physical body, then apply damage only to this same live generation.
      targets.push({...seen.read(s,residentPose),id:z.id,kind:'zombie',radius:z.radius,alive:true,entity:z});
    }
    for(const d of this.doors.doors){
      const angle=seen.value(this.room.state.doors.get(d.id),'poseAngle');
      this.doors.pose(d,Math.abs(angle),Math.sign(angle)||1);
    }
    this.doors.elevators.setProgress(seen.value(this.room.state,'elevatorProgress'));
    return g.world.withDynamicContext(this.context,()=>g.traceHitscan(actor,origin,dir,range,targets,{glassDisabled:id=>(this.room.state.brokenGlass.get(id)??Infinity)<=stamp}));
  }
  dispose(){this.tickTimes.clear();this.shots.clear();this.room.sim.game.hitscanQuery=null;}
}

// Yuka's StateMachine, MemorySystem and steering are executed here, not merely
// bundled. Collision and paths come only from the accepted floor adapter.
import { MemorySystem, SeekBehavior, State, StateMachine, Vector3, Vehicle } from '../../vendor/yuka/yuka.module.js';
import {physicalRecoveryClear} from './body-recovery.mjs';
import { WEAPONS } from './config.mjs';
import {actionObjective,friendlyLineClear} from './action-rules.mjs';
import {angleDifference} from './riposte-fps-math.mjs';
import { distanceSegment } from './physics.mjs';
import {tacticalPosition} from './bot-tactics.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const eye = a => ({ x: a.x, y: a.y + a.height - .12, z: a.z });
const angleDelta = (a, b) => angleDifference(b,a);
const position = a => ({ x: a.x, y: a.y ?? 0, z: a.z });
const aimAt = (a, b) => ({ yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)), pitch: Math.atan2((b.y ?? 1) - (a.y + a.height - .12), distance(a, b)) });

class ObjectiveState extends State { execute(bot) { bot.planObjective(); } }
class CombatState extends State { execute(bot) { bot.planCombat(); } }
class InvestigateState extends State { execute(bot) { bot.planInvestigation(); } }

export class BotController {
  constructor(game, actor) {
    this.game = game; this.actor = actor; this.vehicle = new Vehicle();
    this.profile = game.difficultyProfileFor(actor); this.aimGoal = null;
    this.burstRemaining = 0; this.burstUntil = 0; this.burstTargetId = null; this.nextBurstAt = 0; this.lastShotAt = -Infinity;
    this.vehicle.maxSpeed = game.config.botSpeed; this.vehicle.updateOrientation = false;
    this.seek = new SeekBehavior(); this.vehicle.steering.add(this.seek);
    this.force = new Vector3(); this.memory = new MemorySystem(this.vehicle); this.memory.memorySpan = game.config.botMemory;
    this.machine = new StateMachine(this);
    this.machine.add('objective', new ObjectiveState()).add('combat', new CombatState()).add('investigate', new InvestigateState()).changeTo('objective');
    this.mode = 'objective'; this.nextDecision = 0; this.nextPath = 0; this.path = []; this.goal = null;
    this.target = null; this.records = []; this.heardSerial = 0; this.nextGrenade = game.state.time + 5;
    this.stuckTime = 0; this.replans = 0; this.lastPosition = position(actor); this.lastProgress = game.state.time; this.lastReplan = game.state.time;
    this.command = {}; this.distanceTravelled = 0;
    this.routePlan = null; this.routeStarted = false; this.lastContactReport = -Infinity;
    this.style={angle:game.random()*Math.PI*2,preference:game.random(),cadence:.9+game.random()*.25,
      pace:.88+game.random()*.12,hold:2.8+game.random()*3.8,inspect:2+game.random()*2.5,pathInterval:1.05+game.random()*.65};
    this.nextCover=0;this.nextRecovery=0;this.nextRouteChoice=0;this.departAt=0;this.routeSearches=0;
    actor.aiRole = 'support';
    actor.aiLane = null;
  }
  shop() {
    const a = this.actor, game = this.game;
    if (!a.inventory.primary) {
      const teamRifle = a.team === 'analysts' ? 'ar47' : 'cr4';
      const primary = a.money >= WEAPONS[teamRifle].cost + 300 ? teamRifle : a.money >= 1800 && a.index === 2 ? 'shotgun' : a.money >= 1250 ? 'smg' : null;
      if (primary) game.buy(primary, a);
    }
    if (a.money >= 1000 && !a.armor) game.buy('armor', a);
    const grenade = a.index % 3 === 0 ? 'smoke' : a.index % 3 === 1 ? 'flash' : 'he';
    if (a.money >= 550 && !a.inventory[grenade]) game.buy(grenade, a);
  }
  perceive() {
    const { game, actor } = this, now = game.state.time, c = game.config;
    const enemies = game.actors.filter(a => a.team !== actor.team && a.alive);
    // A bot can defend either team against a visibly approaching aggressor.
    for(const z of game.state.zombies||[]){
      if(z.alive && ['pursuing','attack'].includes(z.behavior) && distance(actor,z)<5)enemies.push(z);
      else if(this.memory.hasRecord(z))this.memory.deleteRecord(z);
    }
    for (const enemy of enemies) {
      if (!this.memory.hasRecord(enemy)) this.memory.createRecord(enemy);
      const record = this.memory.getRecord(enemy), d = distance(actor, enemy), bearing = Math.atan2(-(enemy.x - actor.x), -(enemy.z - actor.z));
      const visible = actor.flash < .3 && d <= c.botVision && (d < 1.3 || Math.abs(angleDelta(bearing, actor.yaw)) < c.botFov / 2) && game.canSee(eye(actor), eye(enemy));
      if (visible) {
        if (!record.visible) {
          const gap = now - (record.lastSeenAt ?? -Infinity);
          if (!Number.isFinite(record.reactionAt) || gap > this.profile.reacquireGrace) {
            record.detectedAt = now;
            record.reactionAt = now + this.profile.reactionMin + game.random() * (this.profile.reactionMax - this.profile.reactionMin);
            record.focusTime = 0;
            game.emit('detected', actor, { targetId: enemy.id, detectedAt: now, reactionAt: record.reactionAt, distance: d });
          } else record.focusTime *= Math.exp(-gap * 2);
          record.timeBecameVisible = now;
        } else record.focusTime = Math.min(this.profile.settleTime, (record.focusTime ?? 0) + now - record.lastSeenAt);
        record.lastSeenAt = now;
        if (enemy.team&&now>=record.reactionAt&&now - this.lastContactReport > 4) {
          // Team reports only positions actually seen; stale contacts decay. This
          // shared memory never reads enemy positions while choosing a route.
          const contacts = game.tacticalContacts ??= [];
          contacts.push({ team: actor.team, x: enemy.x, z: enemy.z, at: now, reporter:actor.id });
          if (contacts.length > 48) contacts.shift();
          this.lastContactReport = now;
        }
        record.timeLastSensed = now; record.lastSensedPosition.set(enemy.x, enemy.y + enemy.height * .6, enemy.z);
        record.senseKey='seen:'+enemy.id+':'+record.detectedAt;
      }
      if (record.visible && !visible && this.burstTargetId === enemy.id) { this.burstRemaining = 0; this.burstUntil = 0; this.nextBurstAt = Math.max(this.nextBurstAt, now + .15); }
      record.visible = visible;
    }
    // Logical sound exists even when Web Audio is muted. Walls shorten hearing;
    // remembered positions are snapshots, never live coordinates through a wall.
    for (const event of game.soundEvents) {
      const sourceId = event.actorId ?? event.ownerId;
      if (event.serial <= this.heardSerial || !sourceId || event.team === actor.team) continue;
      const enemy = enemies.find(a => a.id === sourceId); if (!enemy || enemy.kind==='zombie') continue;
      const clear = game.world.segmentClear(eye(actor), { x: event.x, y: event.y + 1, z: event.z }, { vision: false });
      let radius = event.type === 'shot' ? 38 : event.type === 'step' ? (event.mode === 'run' ? 12 : event.mode === 'sneak' ? 2.5 : 2) : event.type === 'he' ? 45 : 7;
      if (!clear) radius *= .28;
      if (distance(actor, event) <= radius) {
        const record = this.memory.getRecord(enemy);
        record.timeLastSensed = now;
        if (!record.visible){record.lastSensedPosition.set(event.x, event.y + 1, event.z);record.senseKey='sound:'+event.serial;}
      }
    }
    this.heardSerial = game.eventSerial;
    this.memory.getValidMemoryRecords(now, this.records);
    const visible = this.records.filter(r => r.entity.alive && r.visible).sort((a, b) => distance(actor, a.lastSensedPosition) - distance(actor, b.lastSensedPosition));
    this.target = visible[0] ?? null;
    const remembered = this.records.filter(r => r.entity.alive).sort((a, b) => b.timeLastSensed - a.timeLastSensed);
    this.investigation = remembered[0] ?? null;
  }
  update(dt) {
    const { game, actor } = this, now = game.state.time;
    if (now >= this.nextDecision) {
      this.nextDecision = now + game.config.botDecisionInterval*this.style.cadence;
      game.squadTactics?.refresh();
      this.perceive();
      // Defusing and planting keep priority once in progress; fighting cannot
      // repeatedly reset the last second of a valid objective interaction.
      const readyToPlant = game.bomb.carrierId === actor.id && game.interaction(actor)?.type === 'plant';
      const nextMode = actor.action || readyToPlant ? 'objective' : this.target ? 'combat' : this.shouldInvestigate() ? 'investigate' : 'objective';
      if (nextMode !== this.mode) { this.mode = nextMode; this.machine.changeTo(nextMode); }
      this.command = {}; this.aimGoal = null; this.machine.update();
    }
    const input = { ...this.command };
    const item = game.item(actor);
    if (item && typeof item === 'object' && item.ammo === 0) {
      this.burstRemaining = 0;
      if (item.reserve > 0) game.reload(actor); else if (actor.inventory.pistol?.ammo || actor.inventory.pistol?.reserve) game.select('pistol', actor); else game.select('knife', actor);
    }
    if (!input.interact && (this.goal||this.yieldPoint)) this.follow(dt, input);
    else { this.path = []; this.vehicle.velocity.set(0, 0, 0); }
    if (this.aimGoal && this.target?.visible) {
      const turn = this.profile.turnSpeed * dt;
      input.yaw = actor.yaw + Math.max(-turn, Math.min(turn, angleDelta(this.aimGoal.yaw, actor.yaw)));
      input.pitch = actor.pitch + Math.max(-turn, Math.min(turn, this.aimGoal.pitch - actor.pitch));
    }
    if(input.fire&&!friendlyLineClear(this))input.fire=false;
    if (input.fire && !game.config.botFire) input.fire = false;
    // A cached visual record must not allow a shot after the target crosses a
    // wall/smoke between perception ticks. Recheck physical sight each shot.
    if (input.fire && this.target && !game.canSee(eye(actor), eye(this.target.entity))) input.fire = false;
    if (input.fire && !this.canFireBurst()) input.fire = false;
    const travelled = distance(actor, this.lastPosition);
    this.distanceTravelled += travelled; this.lastPosition = position(actor);
    if (travelled > .006) this.lastProgress = now;
    this.stuckTime=actor.blockedBy?this.stuckTime+dt:Math.max(0,this.stuckTime-dt*2);
    if(!this.goal&&!actor.action&&this.mode==='objective'&&now>=this.nextRecovery){
      const waiting=game.actors.find(a=>a!==actor&&a.alive&&a.team===actor.team&&a.blockedBy===actor.id&&a.bot?.stuckTime>.55);
      if(waiting)this.recoverPosition(waiting);
    }
    if (this.goal && distance(actor,this.goal)>.3 && !input.interact && now>=this.departAt && now>=this.nextRecovery && (this.stuckTime>.55||now-this.lastProgress>1.4))this.recoverPosition();
    if (this.goal && distance(actor,this.goal)>.3 && now - this.lastProgress > 1.2 && now - this.lastReplan > 1.2) {
      this.nextPath = 0; this.path = []; this.replans++; this.lastReplan = now;
      // Retry from the current physical capsule. Never teleport or disable
      // collision when a path is blocked by another agent or furniture.
    }
    return input;
  }
  canFireBurst() {
    const { game, actor, target, profile } = this, now = game.state.time;
    if (!target?.visible || now + 1e-8 < target.reactionAt || actor.reloadUntil || actor.flash >= .6) return false;
    if (this.burstTargetId !== target.entity.id) { this.burstRemaining = 0; this.burstTargetId = target.entity.id; }
    if (this.burstRemaining > 0) return true;
    if (now < this.nextBurstAt) return false;
    // This only budgets independently perceived firing opportunities. It never
    // communicates the human's coordinates or grants sight to another bot.
    if (target.entity.isPlayer) {
      const others = game.actors.filter(a => a !== actor && a.alive && a.team === actor.team && a.bot?.target?.entity === target.entity && a.bot.burstRemaining > 0 && a.bot.burstUntil > now);
      if (others.length >= profile.humanAttackers) return false;
    }
    this.burstRemaining = profile.burstMin + Math.floor(game.random() * (profile.burstMax - profile.burstMin + 1));
    this.burstUntil = now + this.burstRemaining * (WEAPONS[actor.weapon].interval || .3) + .35;
    return true;
  }
  onShot() {
    this.lastShotAt = this.game.state.time;
    if (this.burstRemaining > 0) this.burstRemaining--;
    if (!this.burstRemaining) {
      this.burstUntil = 0;
      this.nextBurstAt = this.game.state.time + this.profile.pauseMin + this.game.random() * (this.profile.pauseMax - this.profile.pauseMin);
    }
  }
  urgentObjective() {
    const { game, actor } = this;
    return game.bomb.status === 'planted' || game.bomb.carrierId === actor.id || game.hostages.some(h => h.escortId === actor.id);
  }
  setGoal(goal) {
    if (!goal) { this.goal = null; this.path = []; return; }
    if (!this.goal || distance(this.goal, goal) > .5){this.nextPath = 0;this.lastProgress=this.game.state.time;}
    this.goal = { x: goal.x, z: goal.z };
  }
  planObjective() {
    if(actionObjective(this))return;
    const { game, actor } = this, b = game.bomb, anchors = game.world.anchors;
    actor.aiState = 'uppdrag';
    if (actor.team === 'analysts') {
      if (b.status === 'planted') {
        const defenders = game.actors.filter(a => a.alive && a.team === 'analysts').sort((a, c) => distance(a, b) - distance(c, b));
        // Player can always take over; nearest living bot attempts defuse.
        const owner = defenders.find(a => a.bot);
        if (owner === actor) {
          if (game.interaction(actor)?.type === 'defuse') { this.command.interact = true; this.setGoal(null); actor.aiState = 'desarmerar'; }
          else this.setGoal(b);
          return;
        }
        this.setGoal(this.guardPoint(b, actor.index)); return;
      }
      const guard=this.task?.focus==='hostages'?(anchors.hostages[0]||anchors.bomb):anchors.bomb;
      this.holdPosition(guard);
      return;
    }
    if (b.status === 'dropped') {
      const owners = game.actors.filter(a => a.alive && a.team === actor.team && a.bot).sort((a, c) => distance(a, b) - distance(c, b));
      if (owners[0] === actor) {
        if (game.interaction(actor)?.type === 'pickupBomb') { this.command.interact = !actor.interactHeld; this.setGoal(null); }
        else this.setGoal(b);
        return;
      }
    }
    if (b.carrierId === actor.id) {
      if (game.interaction(actor)?.type === 'plant') { this.command.interact = true; this.setGoal(null); actor.aiState = 'planterar'; }
      else this.setGoal(anchors.bomb);
      return;
    }
    const escorted = game.hostages.filter(h => h.alive!==false && !h.rescued && h.escortId === actor.id);
    if (escorted.length) {
      this.setGoal(anchors.rescue); actor.aiState = 'eskorterar';
      // Keep pace with the physical follower, including around corners.
      if (escorted.some(h => distance(h, actor) > 3)) this.setGoal(null);
      return;
    }
    const available = game.hostages.filter(h => h.alive!==false && !h.rescued && !h.escortId);
    if (available.length) {
      const hostage=available.find(h=>h.id===this.task?.hostageId);
      if (hostage) {
        if (distance(actor, hostage) < game.config.interactDistance - .15 && game.world.segmentClear(eye(actor), { ...position(hostage), y: .8 }, { vision: false })) {
          this.command.interact = !actor.interactHeld; this.command.interactTarget = hostage.id; this.setGoal(null);
        } else this.setGoal(hostage);
        return;
      }
    }
    const escort = game.actors.find(a => a.alive && game.hostages.some(h => h.escortId === a.id));
    const cover = b.status === 'planted' ? b : escort ?? anchors.bomb;
    this.holdPosition(cover);
  }
  guardPoint(center, index) {
    for (let i = 0; i < 8; i++) {
      const angle = index * 1.3 + i * Math.PI / 4;
      const p = { x: center.x + Math.cos(angle) * 1.15, z: center.z + Math.sin(angle) * 1.15 };
      if (this.game.world.canOccupy(p.x, p.z, this.actor.radius) && this.game.world.segmentClear({ ...position(center), y: .8 }, { ...p, y: .8 }, { vision: false })) return p;
    }
    return center;
  }
  holdPosition(center){
    const now=this.game.state.time;
    if(!this.hold||distance(this.hold.center,center)>1.5||now>this.hold.until){
      this.positionPhase=this.style.angle+(this.game.random()-.5)*1.6;
      const threat=this.game.squadTactics?.contacts(this.actor.team).at(-1);
      const p=tacticalPosition(this,center,{threat,radius:this.actor.aiRole==='flank'?2.6:1.5});
      const door=this.game.world.data.doors.filter(d=>{
        if(d.blocked||d.startElevator)return false;
        const x=d.center[0],z=d.center[1],length=Math.hypot(p.x-x,p.z-z)||1;
        // Look at a visible approach to the door, not an entrance hidden
        // behind a solid partition (nor through the closed leaf itself).
        return this.game.canSee({...p,y:1.5},{x:x+(p.x-x)/length*.35,y:1.5,z:z+(p.z-z)/length*.35});
      }).sort((a,b)=>distance(p,{x:a.center[0],z:a.center[1]})-distance(p,{x:b.center[0],z:b.center[1]}))[0];
      this.hold={center:position(center),point:p,until:Infinity,duration:this.style.hold*(.8+this.game.random()*.4),look:threat|| (door?{x:door.center[0],z:door.center[1]}:center)};
    }
    if(distance(this.actor,this.hold.point)>.35)this.setGoal(this.hold.point);
    else{this.setGoal(null);if(!Number.isFinite(this.hold.until))this.hold.until=now+this.hold.duration;this.lookToward(this.hold.look,.18*Math.sin(now+this.style.angle));}
  }
  lookToward(p,offset=0){const a=this.actor,yaw=aimAt(a,{...p,y:a.y+a.height-.12}).yaw+offset,turn=this.profile.turnSpeed*this.game.config.botDecisionInterval*this.style.cadence;this.command.yaw=a.yaw+Math.max(-turn,Math.min(turn,angleDelta(yaw,a.yaw)));}
  shouldInvestigate(){
    const r=this.investigation,g=this.game,now=g.state.time;
    if(!r||this.urgentObjective()){g.squadTactics?.release(this);return false;}
    const key=r.senseKey||r.timeLastSensed;
    if(this.inquiry?.entityId===r.entity.id&&now<=this.inquiry.until){
      this.inquiry.key=key;this.inquiry.point=position(r.lastSensedPosition);
    }else if(this.inquiry?.key!==key&&now>=(this.inquiry?.cooldown??0)){
      // Sound reports do not grant vision or a firing target. Only a bounded
      // number of actual hearers leave their task to inspect a snapshot.
      const accepted=g.squadTactics?.claim(this,r)??true;
      this.inquiry={key,entityId:r.entity.id,point:position(r.lastSensedPosition),accepted,ready:now+.25+g.random()*.65,until:now+this.style.inspect+1,cooldown:now+this.style.inspect+3};
    }
    if(!this.inquiry?.accepted||now>this.inquiry.until){g.squadTactics?.release(this);return false;}
    return true;
  }
  planInvestigation(){
    const q=this.inquiry,now=this.game.state.time;this.actor.aiState='undersöker ljud';
    if(now<q.ready||distance(this.actor,q.point)<.65){this.setGoal(null);this.lookToward(q.point,.22*Math.sin(now+this.style.angle));}
    else this.setGoal(q.point);
  }
  planCombat() {
    const { game, actor, target } = this, now = game.state.time;
    actor.aiState = 'strid';
    if (!target?.visible) return;
    const point = { x: target.lastSensedPosition.x, y: target.lastSensedPosition.y, z: target.lastSensedPosition.z };
    const profile = this.profile, focus = Math.min(1, (target.focusTime ?? 0) / profile.settleTime);
    const hurt = Math.max(0, 1 - (now - actor.hurtTime) / profile.hurtRecovery);
    const aim = aimAt(actor, point), range = distance(actor, point);
    const error = (profile.initialAimError + (profile.steadyAimError - profile.initialAimError) * focus) *
      (1 + Math.max(0, range - 6) / profile.distanceErrorScale) * (1 + actor.moving * profile.movingAimPenalty + hurt * profile.hurtAimPenalty + actor.flash * 6);
    this.aimError = error;
    this.aimGoal = { yaw: aim.yaw + (game.random() - .5) * error, pitch: aim.pitch + (game.random() - .5) * error };
    this.command.fire = now + 1e-8 >= target.reactionAt && actor.flash < .6;
    const equipped = WEAPONS[actor.weapon], d = distance(actor, point);
    if (!game.world.segmentClear(eye(actor), point, { vision: false })) {
      // Intact clear glazing permits perception but still stops bullets. Follow
      // the floor navigation through its door rather than firing forever at it.
      this.command.fire = false; this.setGoal(point); return;
    }
    if (equipped.slot === 'bomb') game.select(actor.inventory.primary ? 'primary' : 'pistol', actor);
    if (equipped.slot === 'grenade') { this.aimGoal.pitch = .08; this.setGoal(null); return; }
    if (equipped.slot === 'knife' && d > 1.3 || d > 22) this.setGoal(point);
    else this.setGoal(null);
    // The objective carrier/flanker can cross a distant firing angle toward its
    // assigned entrance instead of every bot stopping at the first visible
    // doorway. Ordinary collision, movement inaccuracy and damage still apply.
    while(this.routePlan?.gates.length&&distance(actor,this.routePlan.gates[0])<.22)this.routePlan.gates.shift();
    const flankGoal = this.routePlan?.gates[0] ?? (game.bomb.carrierId === actor.id && distance(actor,game.world.anchors.bomb)<4 ? game.world.anchors.bomb : null);
    if (actor.team === 'counterAnalysts' && ['objective','flank'].includes(actor.aiRole) && flankGoal && actor.hp > 35 && d > 5) this.setGoal(flankGoal);
    if(now>=target.reactionAt&&now>=this.nextCover&&d>3&&!actor.action){
      this.nextCover=now+1.7+game.random()*2;
      if(actor.hp<65||actor.reloadUntil||['flank','support'].includes(actor.aiRole)){
        const p=tacticalPosition(this,actor,{threat:point,cover:true,radius:1.2+this.style.preference});
        this.coverMove=distance(actor,p)>.3?{point:p,until:now+1.5}:null;
      }
    }
    if(this.coverMove?.until>now&&distance(actor,this.coverMove.point)>.25)this.setGoal(this.coverMove.point);
    if (now > this.nextGrenade && d > 4 && d < 14 && now >= target.reactionAt && target.focusTime > .7) {
      const grenade = actor.inventory.he ? 'he' : actor.inventory.flash ? 'flash' : actor.inventory.smoke ? 'smoke' : null;
      if (grenade) {
        // Grenade fire still uses normal equipped-item cooldown and inventory.
        game.select(grenade, actor); this.aimGoal.pitch = .08; this.nextGrenade = now + 12;
      }
    }
  }
  chooseRoute() {
    const { game, actor } = this, tactical = game.world.tactical;
    if(tactical?.kind==='floor5'){this.chooseFloorRoute();return;}
    if (!tactical || this.routeStarted || this.mode !== 'objective' || actor.team !== 'counterAnalysts' || actor.x < -10 || !this.goal || this.goal.x > -15 || game.bomb.status === 'planted' || game.hostages.some(h => h.escortId === actor.id)) return;
    const room = game.world.roomAt(this.goal.x, this.goal.z), lab = ['I01','I02'].includes(room?.id);
    const preferred = actor.index === 4 || actor.index === 2 || actor.index === 0 && (game.state.round + game.seed) % 2 === 0 ? 'flank' : 'direct';
    const contacts = (game.tacticalContacts ?? []).filter(c => c.team === actor.team && game.state.time >= c.at && game.state.time - c.at < 150);
    const candidates = tactical.lanes.map(lane => {
      const plan = tactical.candidate(lane.id, actor, this.goal, { lab });
      if (!plan) return null;
      const assigned = game.actors.filter(a => a !== actor && a.alive && a.team === actor.team && a.bot?.routePlan?.laneId === lane.id).length;
      const congestion = game.actors.filter(a => a !== actor && a.alive && a.team === actor.team && distance(a, plan.gates[0]) < 4).length;
      const risk = contacts.reduce((sum,c) => sum + (plan.path.some((p,i) => distanceSegment(c.x,c.z,[i?plan.path[i-1].x:actor.x,i?plan.path[i-1].z:actor.z],[p.x,p.z]) < 3) ? 1 - (game.state.time-c.at)/150 : 0),0);
      return { ...plan, score: plan.length * .035 + assigned * 2.5 + congestion + Math.min(8,risk*1.5) + (lane.id === preferred ? -6 : 0) + game.random() * .4 };
    }).filter(Boolean).sort((a,b)=>a.score-b.score);
    if (!candidates.length) return;
    const chosen = candidates[0]; this.routeStarted = true;
    this.routePlan = { laneId: chosen.laneId, gates: chosen.gates.map(p=>({...p})), lab };
    actor.aiLane = chosen.laneId;
    game.emit('route', actor, { lane: chosen.laneId, role: actor.aiRole, plannedLength: chosen.length });
    this.nextPath = 0;
  }
  chooseFloorRoute(){
    const {game:g,actor:a}=this,w=g.world,now=g.state.time,tactical=w.tactical,key=this.goal&&tactical.targetKey(this.goal);
    const escort=g.hostages.some(h=>h.escortId===a.id);
    if(this.mode!=='objective')return;
    if(!key||g.bomb.status==='planted'||escort){this.routePlan=null;return;}
    const contacts=g.squadTactics?.contacts(a.team)||[],newRisk=contacts.some(c=>c.at>(this.routePlan?.at??now)&&this.routePlan?.gates.some(p=>distance(c,p)<5));
    const revision=w.navigation.revision;
    if(this.routePlan?.key===key&&this.routePlan.revision===revision&&!this.routeBlocked&&(!newRisk||now<this.nextRouteChoice))return;
    if(!this.routePlan&&!this.routeBlocked&&now<this.nextRouteChoice)return;
    const spawn=w.anchors[a.team][a.index],atSpawn=distance(a,spawn)<4&&!w.glass?.brokenCount&&!this.routeBlocked;
    let choices=atSpawn?tactical.choices(a.team,key):[];
    if(!choices.length){
      const avoid=[...contacts,...(this.routeBlocked?[this.routeBlocked]:[])];
      const path=w.navigation.findPath(a,this.goal,{avoid,blockers:this.localBlockers()});this.routeSearches++;
      choices=path.length?[{id:'adaptive',path,length:path.reduce((s,p,i)=>s+distance(i?path[i-1]:a,p),0)}]:[];
    }
    if(!choices.length){this.nextRouteChoice=now+2;return;}
    const preference=a.aiRole==='flank'?choices.length-1:Math.floor(this.style.preference*choices.length);
    const scored=choices.map((c,i)=>{
      const shared=g.actors.filter(o=>o!==a&&o.alive&&o.team===a.team&&o.bot?.routePlan?.key===key&&o.bot.routePlan.laneId===c.id).length;
      const danger=contacts.reduce((s,r)=>s+(c.path.some(p=>distance(p,r)<r.radius)?r.weight:0),0);
      return {...c,score:c.length*.035+shared*2.5+danger*2+(i===preference?-3:0)+g.random()*.6};
    }).sort((a,b)=>a.score-b.score),chosen=scored[0];
    this.routePlan={key,laneId:chosen.id,gates:chosen.path.slice(0,-1).map(position),at:now,revision};
    this.routeBlocked=null;this.nextRouteChoice=now+4+this.style.preference*2;this.nextPath=0;a.aiLane=key+'/'+chosen.id;
    g.emit('route',a,{lane:a.aiLane,role:a.aiRole,plannedLength:chosen.length,revision});
  }
  recoverPosition(blockerOverride=null){
    const {game:g,actor:a}=this,now=g.state.time,w=g.world;
    if(this.yieldPoint&&now<this.yieldUntil)return;
    this.nextRecovery=now+1.1+this.style.preference*.6;this.stuckTime=0;
    const blocker=blockerOverride||g.actors.concat(g.hostages).find(o=>o.id===a.blockedBy&&o.alive!==false&&(!o.team||o.team===a.team||this.records.some(r=>r.entity===o&&r.visible)));
    if(blocker){
      this.pathBlocker={...position(blocker),radius:a.radius+blocker.radius+.001,until:now+2.5};this.nextPath=0;
      while(this.routePlan?.gates.length&&distance(this.routePlan.gates[0],blocker)<this.pathBlocker.radius+.08)this.routePlan.gates.shift();
      if(this.hold&&distance(this.hold.point,blocker)<.75)this.hold=null;
    }
    const toward=blocker||this.path[0]||this.goal;if(!toward)return;
    const dx=toward.x-a.x,dz=toward.z-a.z,len=Math.hypot(dx,dz)||1;
    const priority=b=>b.bot?.urgentObjective()?-2:(g.squadTactics?.rank(b)??0);
    if(!blockerOverride&&blocker?.bot&&priority(a)<priority(blocker)&&now-this.lastProgress<2.5){this.yieldUntil=now+.25;this.yieldPoint=position(a);this.path=[];this.nextPath=0;return;}
    // One teammate yields sideways/back into a swept free position. A narrow
    // doorway never disables collisions or teleports overlapping capsules.
    const offsets=[[.7,-.15],[-.7,-.15],[.55,-.65],[-.55,-.65],[0,-1.1],[0,-1.8]];
    if(this.style.preference<.5)offsets.reverse();
    const offGraph=!w.navigation.clear(a,a,a.radius);
    if(offGraph)for(const radius of [.45,.8,1.3])for(let i=0;i<8;i++)offsets.push([Math.sin(i*Math.PI/4)*radius,Math.cos(i*Math.PI/4)*radius]);
    for(const [side,back]of offsets){
      const p={x:a.x+dz/len*side+dx/len*back,z:a.z-dx/len*side+dz/len*back};
      if(!(offGraph?this.physicalRecoveryClear(p):w.navigation.clear(a,p))||g.actors.concat(g.hostages).some(o=>o!==a&&o.alive!==false&&!o.rescued&&(o.team===a.team||!o.team||o===blocker)&&distance(o,p)<.55))continue;
      this.yieldPoint=p;this.yieldDirect=offGraph;this.yieldUntil=now+1+this.style.preference*.7;this.path=[];this.nextPath=0;this.replans++;a.aiState='lämnar plats';
      g.emit('bot-yield',a,{blockerId:blocker?.id,...p});return;
    }
    if(now>=this.nextRouteChoice){
      const p=this.path[0]||this.goal;this.routeBlocked={...position(p),radius:1.4,weight:8};this.routePlan=null;this.nextPath=0;this.nextRouteChoice=now+4;this.replans++;
    }
  }
  physicalRecoveryClear(p){
    const {game:g,actor:a}=this;
    const known=g.actors.concat(g.hostages,g.state.zombies||[]).filter(o=>o!==a && o.alive!==false &&
      !o.rescued && (!o.team||o.team===a.team) && distance(a,o)<4);
    return physicalRecoveryClear(g.world,a,p,known);
  }
  localBlockers(){return this.pathBlocker?.until>this.game.state.time?[this.pathBlocker]:[];}
  follow(dt, input) {
    const { game, actor } = this;
    const now=game.state.time;
    if(now<this.departAt&&distance(actor,game.world.anchors[actor.team][actor.index])<3)return;
    this.chooseRoute();
    // Gates survive short combat interruptions, but never pull an escort back
    // toward the lab or prevent an urgent planted-bomb objective.
    const floor5=game.world.tactical?.kind==='floor5';
    const outbound = this.mode === 'objective' && (floor5||this.goal?.x < -15) && game.bomb.status !== 'planted' && !game.hostages.some(h => h.escortId === actor.id);
    if (outbound && this.routePlan) {
      while (this.routePlan.gates.length && distance(actor,this.routePlan.gates[0]) < .22) { this.routePlan.gates.shift(); this.nextPath = 0; }
    }
    let destination = outbound && this.routePlan?.gates.length ? this.routePlan.gates[0] : this.goal;
    if (this.routePlan && (game.bomb.status === 'planted' || game.hostages.some(h => h.escortId === actor.id) || !floor5&&this.mode === 'objective' && this.goal?.x > -15)) this.routePlan.gates = [];
    if(this.yieldPoint){if(now<this.yieldUntil)destination=this.yieldPoint;else{this.yieldPoint=null;this.yieldDirect=false;this.nextPath=0;}}
    if(this.yieldPoint&&this.yieldDirect)this.path=[this.yieldPoint];
    else if (game.state.time >= this.nextPath || this.navigationRevision !== (game.world.navigation?.revision||0)) {
      this.navigationRevision=game.world.navigation?.revision||0;
      this.path = game.world.findPath(actor, destination,{blockers:this.localBlockers()}); this.nextPath = now + this.style.pathInterval;
    }
    while (this.path.length && distance(actor, this.path[0]) < .055) this.path.shift();
    const waypoint = this.path[0]; if (!waypoint) return;
    const d = distance(actor, waypoint); if (!d) return;
    this.vehicle.position.set(actor.x, 0, actor.z); this.vehicle.velocity.set(0, 0, 0);
    this.seek.target.set(waypoint.x, 0, waypoint.z);
    this.vehicle.steering.calculate(dt, this.force);
    const length = Math.hypot(this.force.x, this.force.z), step = Math.min(d, game.config.botSpeed * dt*(this.urgentObjective()?1:this.style.pace));
    if (length) input.moveWorld = { x: this.force.x / length * step, z: this.force.z / length * step };
    if (!this.target) { input.yaw = Math.atan2(-(waypoint.x - actor.x), -(waypoint.z - actor.z)); input.pitch = 0; }
  }
}

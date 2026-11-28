import {BONUSES,activeBonus,bonusTick,bonusOrigin,eligibleBonusKill,earnBonusKill,ordinaryCombatDamage,createBonusState,clearActorBonus,stepActorBonuses,requestActorBonus,visibleUav} from './bonuses.mjs';
import {purchaseReasons} from './game-english.mjs';
import {resetRush,interruptRush,rushReady,queueShot,takeReadyShot} from './rush.mjs';
import {moveActor,moveBody} from './movement.mjs';
import {rejoinNavigation} from './body-recovery.mjs';
import {populateZombies,tickZombies,tickDance,reactZombie} from './zombies.mjs';
import {zombieRay,zombiePosition} from './zombie-poses.mjs';
import {missionRoomName} from './player-names.mjs';
import { CARTRIDGE, grenadeLaunch, advanceGrenade } from './grenade-physics.mjs';
import { advanceAim, canAim, shotSpread } from './tactical-rules.mjs';
import {initializeCombat,tickCombat,combatEvent} from './combat-flow.mjs';
import { CONFIG, TEAMS, WEAPONS, PRIORITY, seededRandom, DIFFICULTIES, DEFAULT_DIFFICULTY, TEAMMATE_DIFFICULTY } from './config.mjs';
import { BotController } from './bots.mjs';
import {SquadTactics} from './bot-tactics.mjs';
import {prepareActionRound,tickActionState,recordActionDeath,sendRadio,launchRocket,updateRockets,isEndless} from './action-rules.mjs';
export { CONFIG, TEAMS, WEAPONS, DIFFICULTIES, DEFAULT_DIFFICULTY };

export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const eye = actor => {
  const p=actor.kind==='zombie'?zombiePosition(actor,actor.bodyTime):actor;
  return {x:p.x,y:p.y+actor.height-.12,z:p.z};
};
export const direction = (yaw, pitch = 0) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });
const point = a => ({ x: a.x, y: a.y ?? 0, z: a.z });
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const EPS = 1e-8;
const inHeadRegion = (body, hitY) => Number.isFinite(hitY) && hitY >= body.y + body.height * .83;

/** One resolver owns the complete hybrid rule table. Candidates carry simulation
 * timestamps; render order cannot change priority at equal timestamps. */
export function resolveRound(state, candidates = []) {
  if (state.mode === 'endless' || state.phase !== 'active' || state.result) return null;
  const list = candidates.filter(e => e.at <= state.time + EPS);
  const planted = state.bomb.status === 'planted';
  if (planted && state.time + EPS >= state.bomb.deadline) list.push({ reason: 'detonation', winner: 'counterAnalysts', at: state.bomb.deadline });
  if (state.hostages.length && state.hostages.every(h => h.alive!==false && h.rescued)) list.push({ reason: 'rescue', winner: 'counterAnalysts', at: Math.max(...state.hostages.map(h => h.rescuedAt ?? state.time)) });
  const analysts = state.actors.filter(a => a.team === 'analysts' && a.alive).length;
  const counters = state.actors.filter(a => a.team === 'counterAnalysts' && a.alive).length;
  if (!analysts && counters) list.push({ reason: 'elimination', winner: 'counterAnalysts', at: state.time });
  if (!counters && analysts && !planted) list.push({ reason: 'elimination', winner: 'analysts', at: state.time });
  if (!counters && !analysts && !planted) list.push({ reason: 'draw', winner: null, at: state.time });
  if (!planted && state.time + EPS >= state.deadline) list.push({ reason: 'timeout', winner: 'analysts', at: state.deadline });
  return list.filter(e => e.reason !== 'defuse' || e.at < state.bomb.deadline - EPS)
    .sort((a, b) => Math.abs(a.at - b.at) < EPS ? PRIORITY[a.reason] - PRIORITY[b.reason] : a.at - b.at)[0] ?? null;
}

function rayActor(origin, dir, actor, limit) {
  if(actor.kind==='zombie')return zombieRay(origin,dir,actor,limit,rayBox);
  return rayBox(origin,dir,actor,limit);
}
function rayBox(origin, dir, actor, limit, depth=actor.radius) {
  const min = { x: actor.x - actor.radius, y: actor.y + .04, z: actor.z - depth };
  const max = { x: actor.x + actor.radius, y: actor.y + actor.height, z: actor.z + depth };
  let near = 0, far = limit;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(dir[axis]) < EPS) { if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null; }
    else {
      let a = (min[axis] - origin[axis]) / dir[axis], b = (max[axis] - origin[axis]) / dir[axis];
      if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return null;
    }
  }
  return near <= limit ? near : null;
}

export class Game {
  constructor(world, { seed = 1, team = 'analysts', config = {}, autoplay = false, difficulty = config.difficulty ?? DEFAULT_DIFFICULTY, controllers = null, localPlayerId } = {}) {
    // Controller assignment is server/local-session configuration, never wire input.
    this.controllers = controllers === null ? null : new Map(Object.entries(controllers));
    for (const [id, type] of this.controllers || []) if (!/^(analysts|counterAnalysts)-[0-4]$/.test(id) || !['human','bot','unoccupied'].includes(type)) throw new Error('Invalid controller assignment');
    if (localPlayerId !== undefined && localPlayerId !== null && !/^(analysts|counterAnalysts)-[0-4]$/.test(localPlayerId)) throw new Error('Invalid local player');
    this.localPlayerId = localPlayerId;
    this.world = world; this.config = { ...CONFIG, ...config }; this.seed = seed;
    this.random = seededRandom(seed); this.team = team; this.autoplay = autoplay;
    this.events = []; this.soundEvents = []; this.eventSerial = 0; this.accumulator = 0;
    this.state = { phase: 'menu', time: 0, round: 0, difficulty: DIFFICULTIES[difficulty] ? difficulty : DEFAULT_DIFFICULTY, pendingDifficulty: null, score: { analysts: 0, counterAnalysts: 0 }, lossStreak: { analysts: 0, counterAnalysts: 0 }, actors: [], hostages: [], zombies: [], bomb: { status: 'none' }, grenades: [], smokes: [], drops: [], result: null, deadline: Infinity, paused: false, history: [] };
    this.config.difficulty = this.state.difficulty;
  }
  get actors() { return this.state.actors; }
  get hostages() { return this.state.hostages; }
  get player() { return this.actors.find(a => a.isPlayer); }
  get phase() { return this.state.phase; }
  get bomb() { return this.state.bomb; }
  get difficulty() { return this.state.difficulty; }
  difficultyProfileFor(actor) { return !this.config.networkSlice && actor.team === this.team ? TEAMMATE_DIFFICULTY : DIFFICULTIES[this.state.difficulty]; }
  setDifficulty(id) {
    if (!DIFFICULTIES[id]) return false;
    if (this.phase === 'menu') { this.state.difficulty = id; this.config.difficulty = id; this.state.pendingDifficulty = null; }
    else this.state.pendingDifficulty = id === this.state.difficulty ? null : id;
    return true;
  }
  setNetworkBotDifficulty(id) {
    if (!this.config.networkSlice || !this.state.paused || typeof id !== 'string' || !Object.hasOwn(DIFFICULTIES, id)) return false;
    this.state.difficulty = this.config.difficulty = id;
    this.state.pendingDifficulty = null;
    for (const actor of this.actors) {
      if (actor.bot) actor.bot.profile = this.difficultyProfileFor(actor);
    }
    return true;
  }
  get spectator() { return this.player?.alive ? this.player : this.actors.find(a => a.alive && a.team === this.team) ?? this.actors.find(a => a.alive) ?? this.player; }
  start(team = this.team) {
    if (!TEAMS[team]) throw new Error('Unknown team');
    this.team = team; this.tacticalContacts = []; this.random = seededRandom(this.seed); this.events = []; this.soundEvents = []; this.accumulator = 0; this.eventSerial = 0;
    Object.assign(this.state, { phase: 'buy', matchId:(this.state.matchId||0)+1, time: 0, round: 0, score: { analysts: 0, counterAnalysts: 0 }, lossStreak: { analysts: 0, counterAnalysts: 0 }, actors: [], history: [], paused: false });
    for (const side of Object.keys(TEAMS)) for (let i = 0; i < 5; i++) {
      const id = `${side}-${i}`, isPlayer = this.localPlayerId === undefined ? side === team && i === 0 : id === this.localPlayerId;
      const controllerType = this.controllers ? this.controllers.get(id) ?? 'unoccupied' : isPlayer && !this.autoplay ? 'human' : 'bot';
      if (this.config.networkSlice && controllerType !== 'human') continue;
      this.actors.push({ id: `${side}-${i}`, name: isPlayer ? 'You' : `${side === 'analysts' ? 'A' : 'C'}-${String(i + 1).padStart(2, '0')}`, team: side, index: i, isPlayer, controllerType,
        bonus:createBonusState(), money: this.config.startMoney, kills: 0, deaths: 0, alive: false, x: 0, y: 0, z: 0, radius: this.config.radius, height: this.config.standingHeight });
    }
    this.warmupRemaining=0;
    this.beginRound();
    this.warmupRemaining=this.config.deploymentSeconds || 0;
    return this;
  }
  beginRound() {
    this.beforeBeginRound?.();
    this.world.glass?.reset();
    const s = this.state;
    if (s.pendingDifficulty) { s.difficulty = s.pendingDifficulty; s.pendingDifficulty = null; }
    this.config.difficulty = s.difficulty;
    s.round++; s.phase = 'buy'; s.result = null; s.buyDeadline = s.time + this.config.buyTime; s.roundStartedAt = s.buyDeadline;
    s.deadline = s.buyDeadline + this.config.roundTime; s.grenades = []; s.smokes = []; s.drops = [];
    this.soundEvents = []; this.tacticalContacts=[]; this.roundCandidates = []; this.pendingDamage = [];
    for (const actor of this.actors) {
      clearActorBonus(actor,!actor.alive);
      if(!this.config.networkSlice && !actor.alive)actor.lifeId=(actor.lifeId||0)+1;
      if (!actor.alive) { actor.inventory = this.startInventory(actor.team); actor.armor = 0; }
      const spawn = this.world.anchors[actor.team][actor.index];
      Object.assign(actor, { ...point(spawn), yaw: spawn.yaw ?? 0, pitch: 0, hp: this.config.health, alive: true,
        height: this.config.standingHeight, vy: 0, onGround: true, crouching: false, reloadUntil: 0, reloadStartedAt:0, reloadDuration:0,
        nextShot: s.time, flashUntil: 0, flash: 0, flashStart: 0, action: null, moving: 0, distanceWalked: 0, recoil: 0,
        lastStep: s.time, fireHeld: false, interactHeld: false, jumpHeld: false, lastWeapon: 'knife', hurtTime: -Infinity, hurtDirection: null, deathAt: null, deathCause: null, deathVariant: '',
        weapon: actor.inventory.primary?.id ?? actor.inventory.pistol?.id ?? 'knife',
      });
      actor.cartridge=null;actor.waitTriggerRelease=false;resetRush(actor);
      actor.bot = actor.controllerType === 'bot' ? new BotController(this, actor) : null;
    }
    s.hostages = (this.config.networkSlice && this.config.mode !== 'classic' ? [] : this.world.anchors.hostages).map((p, i) => ({ ...point(p), id: `hostage-${i}`, name: `Hostage ${i + 1}`, height: 1.6, radius: this.config.radius, vy: 0, onGround: true, rescued: false, escortId: null, path: [], pathAt: 0, distanceWalked: 0 }));
    const carrier = this.actors.find(a => a.team === 'counterAnalysts');
    const bombLocation = carrier ?? this.world.anchors.bomb ?? (this.config.mode === 'endless' ? this.world.anchors.counterAnalysts[0] : null);
    s.bomb = { status: carrier?'carried':'dropped', carrierId: carrier?.id??null, ...point(bombLocation), deadline: Infinity, nextBeep: Infinity };
    for (const actor of this.actors) if (actor.bot) actor.bot.shop();
    prepareActionRound(this);
    this.world.setElevatorProgress?.(s.phase==='buy'?0:1);
    initializeCombat(this);
    if (!this.config.networkSlice || this.config.zombies || this.config.danceman) populateZombies(this);
    else s.zombies=[];
    this.squadTactics=new SquadTactics(this);
    this.afterBeginRound?.();
    this.emit('round', null, { round: s.round });
  }
  requestBonus(slot,actor=this.player,serial=(actor?.bonus?.lastSerial||0)+1) {
    return requestActorBonus(this,actor,slot,serial);
  }
  uavBlips() {
    const actor=this.player,tick=bonusTick(this.state.time);
    return actor?.alive && activeBonus(actor,tick)==='uav' ? visibleUav(actor.uavSamples,tick) : [];
  }
  radio(id, actor=this.player) { if(this.config.networkSlice||this.warmupRemaining)return false; return sendRadio(this,id,actor); }
  startInventory(team) {
    const id = team === 'analysts' ? 'p9' : 'p12';
    return { primary: null, pistol: this.weaponItem(id), knife: { id: 'knife', ammo: Infinity, reserve: 0 }, smoke: 0, flash: 0, he: 0 };
  }
  weaponItem(id) { const w = WEAPONS[id]; return { id, ammo: w.magazine, reserve: w.reserve }; }
  item(actor = this.player) { const w = WEAPONS[actor.weapon]; return actor.inventory[w?.slot] ?? null; }
  pause(value = true) { this.state.paused = Boolean(value); this.accumulator = 0; this.firePress = null; this.crouchEdge=false; for (const a of this.actors) { a.bonusRequest=null;this.interruptCartridge(a);interruptRush(a,this.state.time);a.waitTriggerRelease=false; a.fireHeld = false; a.interactHeld = false; a.jumpHeld = false; a.action = null; } }
  advanceWarmup(dt,input) {
    if(!this.warmupRemaining)return false;
    if(Number.isFinite(input.yaw))this.player.yaw=input.yaw;
    if(Number.isFinite(input.pitch))this.player.pitch=clamp(input.pitch,-1.49,1.49);
    this.warmupRemaining=Math.max(0,this.warmupRemaining-Math.max(0,dt));
    if(this.warmupRemaining<EPS)this.warmupRemaining=0;
    this.firePress=null;this.crouchEdge=false;
    return true;
  }
  update(dt, input = {}) {
    if (this.state.paused || ['menu', 'match'].includes(this.phase)) return;
    if(this.advanceWarmup(dt, input))return;
    if(input.crouchEdge && this.phase==='active')this.crouchEdge=true;
    if (input.firePress && this.phase==='active') this.firePress ??= input.firePress;
    this.accumulator += Math.min(Math.max(0, dt), this.config.maxCatchUp);
    while (this.accumulator + EPS >= this.config.fixedStep) { this.step(this.config.fixedStep, this.firePress || this.crouchEdge ? {...input,firePress:this.firePress,crouchEdge:this.crouchEdge} : input); this.firePress=null;this.crouchEdge=false;
      if(input.firePress || input.crouchEdge)input={...input,firePress:null,crouchEdge:false};
      this.accumulator -= this.config.fixedStep; }
  }
  /** One externally clocked authoritative tick; never enters update's accumulator. */
  stepActors(inputsByActor = new Map()) { this.step(this.config.fixedStep, {}, inputsByActor); }
  step(dt, input = {}, inputsByActor = null) {
    const s = this.state;
    if (s.paused || ['menu', 'match'].includes(s.phase)) return;
    if(this.advanceWarmup(dt,input))return;
    s.time += dt;
    if (s.phase === 'result') { if (s.time + EPS >= s.resultDeadline) this.beginRound(); return; }
    tickDance(this);
    if (s.phase === 'buy') {
      const remaining=s.buyDeadline-s.time;
      this.world.setElevatorProgress?.(remaining<=EPS?1:1-remaining/1.5);
      for (const actor of this.actors) {
        if(inputsByActor?.get(actor.id)?.reload)this.reload(actor);
        if (actor.alive) this.completeReloadIfDue(actor);
        const controls = inputsByActor ? (actor.controllerType === 'human' ? inputsByActor.get(actor.id) : null) : actor.isPlayer ? input : null;
        if (Number.isFinite(controls?.yaw)) actor.yaw = controls.yaw;
        if (Number.isFinite(controls?.pitch)) actor.pitch = clamp(controls.pitch, -1.49, 1.49);
      }
      if (s.time + EPS < s.buyDeadline) return;
      s.phase = 'active'; this.emit('start', null);
    }
    this.roundCandidates = []; this.pendingDamage = [];
    if (this.config.networkSlice) {
      const residents=s.zombies.filter(z=>z.alive).map(z=>z.seat?{...z,...zombiePosition(z,s.time)}:z);
      this.world.advanceNetworkWorld?.(s.time,dt,[...this.actors,...this.hostages,...residents]);
    }
    else this.world.doors?.update(s.time,dt,[...this.actors,...this.hostages,...s.zombies,...(this.config.wanderers?s.wanderers||[]:[])]);
    stepActorBonuses(this);
    tickActionState(this,dt);
    for (const actor of this.actors) {
      if (!actor.alive) continue;
      if(inputsByActor?.get(actor.id)?.reload)this.reload(actor);
      actor.recoil *= Math.exp(-8 * dt);
      actor.flash = actor.flashUntil > s.time ? actor.flashStrength * (actor.flashUntil - s.time) / (actor.flashUntil - actor.flashStart) : 0;
      this.completeReloadIfDue(actor);
      const controls = actor.bot ? actor.bot.update(dt) : actor.controllerType === 'human' ? (inputsByActor?.get(actor.id) ?? (actor.isPlayer && !inputsByActor ? input : {})) : {};
      const held=controls.holdThrow ?? (!!controls.fire && !controls.autoFire);
      if(!held || controls.firePress)actor.waitTriggerRelease=false;
      const press=controls.firePress || (controls.fire && !actor.fireHeld && !controls.autoFire);
      if(!actor.waitTriggerRelease && !this.authorizeShot && press && !actor.reloadUntil && !actor.action && (controls.firePress || !rushReady(actor))) {
        queueShot(actor,{yaw:press.yaw??controls.yaw??actor.yaw,pitch:press.pitch??controls.pitch??actor.pitch},s.time);
      }
      this.moveActor(actor, controls, dt);
      if(this.config.networkSlice && !actor.bot){
        actor.aiming=!!controls.aim && rushReady(actor) && canAim(actor.weapon) && !actor.reloadUntil && !actor.action;
        actor.aimAmount=actor.aiming?advanceAim(actor.aimAmount||0,true,dt):0;
      }
      const shot=takeReadyShot(actor,s.time);
      if(!actor.bot && WEAPONS[actor.weapon]?.slot==='grenade'){
        const admitted=shot && (!this.authorizeShot || this.authorizeShot(actor,shot));
        if(!actor.cartridge && !actor.waitTriggerRelease && !controls.autoFire &&
           (admitted || (!this.authorizeShot && press)) && rushReady(actor) &&
           !actor.action && !actor.reloadUntil && s.time+EPS>=actor.nextShot && actor.inventory[actor.weapon]){
          const actionId=shot?.fireId ? [actor.id,actor.lifeId,actor.controlEpoch,shot.fireId].join(':') : '';
          actor.cartridge={type:actor.weapon,started:s.time,releaseAt:0,deadline:0,actionId};
        }
        this.updateCartridge(actor,held);
      }else if(!actor.waitTriggerRelease){
        if(shot) {
          if(!this.authorizeShot || this.authorizeShot(actor,shot)) this.fire(actor,true,shot);
        } else if(controls.fire && (!this.authorizeShot || actor.bot) && rushReady(actor)) {
          this.fire(actor, this.config.networkSlice || !!controls.autoFire || !actor.fireHeld);
        }
      }
      actor.fireHeld = !!controls.fire;
      this.interact(actor, controls);
      actor.interactHeld = !!controls.interact;
    }
    tickZombies(this,dt);
    this.updateGrenades(dt);
    updateRockets(this,dt,rayActor);
    for (const hit of this.pendingDamage) this.damage(hit.target, hit.amount, hit.source, hit.kind, hit);
    tickCombat(this,dt);
    this.updateHostages(dt);
    this.updateBomb();
    s.smokes = s.smokes.filter(smoke => smoke.until > s.time);
    this.soundEvents = this.soundEvents.filter(event => s.time - event.time < 2);
    const result = resolveRound(s, this.roundCandidates);
    if (result) this.finishRound(result);
  }
  moveActor(actor, input, dt) { return moveActor(this, actor, input, dt); }
  moveBody(actor, dx, dy, dz) { return moveBody(this, actor, dx, dy, dz); }
  inBuyZone(actor = this.player) { return this.world.anchors[actor.team].some(p => distance(actor, p) <= this.config.buyRadius); }
  buy(id, actor = this.player) {
    const reject = reasonId => ({ ok: false, reasonId, reason: purchaseReasons[reasonId] });
    if (this.config.networkSlice && (this.config.mode!=='classic' || !['smg','ar47','cr4','shotgun','sniper','bazooka','armor','he'].includes(id))) return reject('unavailableInMode');
    if(this.warmupRemaining)return reject('buyTime');
    const w = WEAPONS[id];
    if (!w || !w.cost) return reject('unavailable');
    if(this.config.networkSlice&&!actor?.alive)return reject('nextRound');
    if (!actor?.alive || (this.phase !== 'buy' && !(isEndless(this)&&this.phase==='active'))) return reject('buyTime');
    if (!isEndless(this)&&!this.inBuyZone(actor)) return reject('buyZone');
    if (w.team && w.team !== actor.team) return reject('wrongTeam');
    if (!isEndless(this)&&actor.money < w.cost) return reject('credits');
    if (w.slot === 'grenade' && actor.inventory[id] >= w.limit) return reject('grenadeFull');
    if (w.slot === 'armor' && actor.armor >= 100) return reject('armorFull');
    if (w.slot === 'primary' && actor.inventory.primary?.id === id) return reject('alreadyOwned');
    if(!isEndless(this))actor.money -= w.cost;
    if (w.slot === 'grenade') actor.inventory[id]++;
    else if (w.slot === 'armor') actor.armor = 100;
    else { if (actor.inventory.primary) this.dropItem(actor, actor.inventory.primary); actor.inventory.primary = this.weaponItem(id); actor.loadout=id; this.select(id, actor); }
    this.emit('buy', actor, { item: id }); return { ok: true };
  }
  select(slot, actor = this.player) {
    if(this.warmupRemaining)return false;
    if (!actor?.alive) return false;
    const inventory = actor.inventory; let id = slot;
    if (slot === 1 || slot === '1' || slot === 'primary') id = inventory.primary?.id;
    if (slot === 2 || slot === '2' || slot === 'pistol') id = inventory.pistol?.id;
    if (slot === 3 || slot === '3') id = 'knife';
    if (slot === 5 || slot === '5') id = 'bomb';
    if (slot === 'last' || slot === 'q') id = actor.lastWeapon;
    if (slot === 4 || slot === '4' || slot === 'grenade') {
      const ids = ['smoke', 'flash', 'he'].filter(g => inventory[g] > 0);
      id = ids[(ids.indexOf(actor.weapon) + 1) % ids.length];
    }
    const w = WEAPONS[id]; if (!w) return false;
    if (w.slot === 'bomb' && this.bomb.carrierId !== actor.id) return false;
    if (w.slot === 'grenade' && !inventory[id]) return false;
    if (['primary', 'pistol', 'knife'].includes(w.slot) && inventory[w.slot]?.id !== id) return false;
    if (actor.weapon === id) return true;
    this.interruptCartridge(actor,false);
    const spent=WEAPONS[actor.weapon]?.slot==='grenade' && !inventory[actor.weapon];
    actor.pendingShot=null;
    actor.lastWeapon=spent ? [inventory.primary?.id,inventory.pistol?.id,'knife'].find(item=>item && item!==id) : actor.weapon;
    actor.weapon = id; actor.slideBuffer=0; actor.reloadUntil=actor.reloadStartedAt=actor.reloadDuration=0; actor.nextShot = Math.max(actor.nextShot, this.state.time + .22);
    this.emit('switch', actor, { weapon: id }); return true;
  }
  reload(actor = this.player) {
    if(this.warmupRemaining)return false;
    if (!actor?.alive || actor.reloadUntil || !['buy', 'active'].includes(this.phase)) return false;
    const item = this.item(actor), w = WEAPONS[actor.weapon];
    if (!item || !w.reload || item.ammo >= w.magazine || !item.reserve) return false;
    actor.pendingShot=null;actor.slideBuffer=0;
    const duration=w.reload*(activeBonus(actor,bonusTick(this.state.time))==='rage'?BONUSES[1].reloadScale:1);
    actor.reloadStartedAt=this.state.time;
    actor.reloadDuration=duration;
    actor.reloadUntil = actor.reloadStartedAt + duration;
    this.emit('reload', actor, { weapon: actor.weapon, duration });
    return true;
  }
  completeReloadIfDue(actor) {
    if (!actor.reloadUntil || this.state.time + EPS < actor.reloadUntil) return;
    const item = this.item(actor);
    if (item && typeof item === 'object') {
      const amount = Math.min(WEAPONS[actor.weapon].magazine - item.ammo, item.reserve);
      item.ammo += amount;
      item.reserve -= amount;
    }
    actor.reloadUntil=actor.reloadStartedAt=actor.reloadDuration=0;
  }
  dropItem(actor, item) { if(this.config.networkSlice)return; this.state.drops.push({ ...point(actor), id: `drop-${++this.eventSerial}`, type: 'weapon', createdAt:this.state.time, item: { ...item } }); }
  drop(actor = this.player) {
    if(this.warmupRemaining)return false;
    if(this.config.networkSlice && (this.config.mode!=='classic'||this.bomb.carrierId!==actor?.id))return false;
    if (!actor?.alive || !['buy', 'active'].includes(this.phase)) return false;
    if ((actor.weapon === 'bomb'||this.config.networkSlice) && this.bomb.carrierId === actor.id) {
      Object.assign(this.bomb, { status: 'dropped', carrierId: null, ...point(actor) }); this.select(actor.inventory.primary?.id ?? actor.inventory.pistol?.id ?? 'knife', actor); actor.action = null; this.emit('drop', actor, { item: 'bomb' }); return true;
    }
    const w = WEAPONS[actor.weapon];
    if (w.slot !== 'primary' && w.slot !== 'pistol') return false;
    this.dropItem(actor, this.item(actor)); actor.inventory[w.slot] = null;
    this.select(actor.inventory.pistol ? 'pistol' : 'knife', actor); return true;
  }
  /**
   * Mobile auto-trigger uses the EXACT shot ray / bounding-box / solid-world
   * occlusion logic of fire(), not a nearest-enemy cone or a wallhack.
   * It will not auto-fire into a teammate, hostage, smoke, wall or empty space.
   */
  reticleTarget(actor = this.player, yaw = actor?.yaw, pitch = actor?.pitch) {
    if (!actor?.alive || this.phase !== 'active' || this.state.paused ||
        actor.action || actor.reloadUntil || actor.flash >= .8) return null;
    const w = WEAPONS[actor.weapon], item = this.item(actor);
    if (!w || !['primary', 'pistol', 'knife'].includes(w.slot) ||
        w.projectile || (w.slot !== 'knife' && (!item || item.ammo <= 0))) return null;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;

    const from = eye(actor), dir = direction(yaw, pitch);
    const wall = this.world.raycast(from, dir, w.range, { vision: false });
    let nearest = wall?.distance ?? w.range, target = null;
    // Like fire(), allies and neutral bodies occupy the ray even when
    // friendly fire is disabled. We must not shoot *through* them.
    for (const other of [...this.actors,
      ...(this.config.hostageDamage ? this.hostages : []),
      ...(this.state.zombies||[]), ...(this.config.wanderers ? this.state.wanderers || [] : [])]) {
      if (other === actor || !other.alive || other.rescued) continue;
      const hit = rayActor(from, dir, other, nearest);
      if (hit !== null && hit < nearest) { nearest = hit; target = other; }
    }
    if (!target || target.team === actor.team || (!target.team && target.kind!=='zombie')) return null;
    // Residents still block the shot ray. Online, only a pursuing/attacking
    // zombie is an automatic target; never shoot the dancer or a passive NPC.
    if (this.network && target.kind==='zombie' &&
        (target.model==='danceman' || !['pursuing','attack'].includes(target.behavior))) return null;
    const endpoint = {
      x: from.x + dir.x * nearest, y: from.y + dir.y * nearest, z: from.z + dir.z * nearest,
    };
    if (this.smokeBlocks(from, endpoint)) return null;
    return target;
  }

  fire(actor = this.player, pressed = true, shot = actor) {
    if(this.warmupRemaining)return false;
    const w = WEAPONS[actor.weapon];
    if (this.phase !== 'active' || !actor.alive || !rushReady(actor) || actor.reloadUntil || this.state.time + EPS < actor.nextShot || actor.action) return false;
    if (!w || w.slot === 'bomb' || (!w.automatic && !pressed && !actor.bot)) return false;
    actor.nextShot = this.state.time + w.interval;
    if (w.slot === 'grenade') return this.throwGrenade(actor, actor.weapon);
    const item = this.item(actor);
    if (w.slot !== 'knife' && (!item || item.ammo <= 0)) { this.emit('empty', actor); return false; }
    if (w.slot !== 'knife') item.ammo--;
    const origin = eye(actor), spread = shotSpread(actor, w);
    actor.recoil += w.recoil;
    this.emit('shot', actor, { weapon: actor.weapon, yaw: shot.yaw, pitch: shot.pitch, targetId: actor.bot?.target?.entity?.id,
      detectedAt: actor.bot?.target?.detectedAt, reactionAt: actor.bot?.target?.reactionAt });
    actor.spawnProtectedUntil=0;
    if (actor.bot) actor.bot.onShot();
    if(w.projectile){launchRocket(this,actor,direction(shot.yaw,shot.pitch));return true;}
    for (let i = 0; i < w.pellets; i++) {
      const dir = direction(shot.yaw + (this.random() - .5) * spread, shot.pitch + (this.random() - .5) * spread);
      // The room may supply read-only historical hitboxes/collision context.
      // Weapon cadence, RNG, ammunition and deferred damage stay in this Game.
      const {wall,point:hitPoint,victim,head} = this.hitscanQuery
        ? this.hitscanQuery(actor,origin,dir,w.range) : this.traceHitscan(actor,origin,dir,w.range);
      if (victim) {
        if (victim.team !== actor.team || this.config.friendlyFire) {
          this.pendingDamage.push({ target: victim, amount: w.damage, source: actor, kind: actor.weapon, head, point: hitPoint, direction: dir, sourcePosition: origin });
        }
      } else if (wall) {
        this.emit('impact', null, { ...hitPoint, sourceId: actor.id, surface: wall.material ?? 'wall', surfaceId: wall.id, normal: wall.normal, direction: dir });
        const shattered=this.world.glass?.breakAt(wall);if(shattered){this.onGlassBreak?.(shattered.paneId);this.emit('glass-break',null,{...shattered,sourceId:actor.id});}
      }
      this.emit('tracer', actor, { from: origin, to: hitPoint, weapon: actor.weapon });
    }
    return true;
  }
  traceHitscan(actor,origin,dir,range,targets=[...this.actors,...(this.state.zombies||[]),...(this.config.hostageDamage?this.hostages:[]),...(this.config.wanderers?this.state.wanderers||[]:[])],rayOptions={vision:false}) {
    const wall=this.world.raycast(origin,dir,range,rayOptions);
    let nearest=wall?.distance??range,body=null;
    for(const target of targets){
      if(!target.alive||target.rescued||target.id===actor.id)continue;
      const hit=rayActor(origin,dir,target,nearest);
      if(hit!==null&&hit<nearest){nearest=hit;body=target;}
    }
    const point = { x: origin.x + dir.x * nearest, y: origin.y + dir.y * nearest, z: origin.z + dir.z * nearest };
    // A rewind body belongs to the collision instant. Its entity receives the
    // damage later and can already be standing, crouching or on another floor.
    return {wall,nearest,point,victim:body?.entity??body,head:!!body&&inHeadRegion(body,point.y)};
  }
  damage(target, amount, source, kind = 'shot', context = {}) {
    if (this.phase !== 'active' || !target?.alive || !Number.isFinite(amount) || amount <= 0) return false;
    const owner = context.projectileOwner;
    const sourceTeam = owner?.team ?? source?.team, sourceName = owner?.ownerName ?? source?.name;
    if (sourceTeam && sourceTeam === target.team && !this.config.friendlyFire && !(source === target && (kind === 'bazooka' || (kind==='he' && context.inHand)))) return false;
    if(target.spawnProtectedUntil>this.state.time)return false;
    if(kind==='stomp' && (!source?.alive || source.behavior!=='attack'))return false;
    if(target.kind==='hostage'&&!this.config.hostageDamage)return false;
    if(target.kind==='dwarf'&&!this.config.wanderers)return false;
    if (this.config.networkSlice) {
      // A launched rocket or HE keeps its original shooter across seat reuse.
      if (source?.controllerType === 'bot' && target.controllerType === 'human' &&
        Object.hasOwn(TEAMS, sourceTeam) && Object.hasOwn(TEAMS, target.team) && sourceTeam !== target.team) {
        amount *= DIFFICULTIES[this.state.difficulty].humanDamage;
      }
    } else if ((target.isPlayer || target.controllerType === 'human') && source && !source.isPlayer && source.controllerType !== 'human' && sourceTeam !== target.team) amount *= DIFFICULTIES[this.state.difficulty].humanDamage;
    // The room resolves sourceId against the current roster. A projectile can
    // still credit its original owner after that actor's generation changes.
    const sameGeneration = !owner || (source && source.id === owner.ownerId && (source.lifeId ?? 0) === owner.ownerLifeId && (source.controlEpoch ?? 0) === owner.ownerControlEpoch);
    const currentSource = sameGeneration && (!this.config.networkSlice || this.actors.includes(source) || this.state.zombies.includes(source));
    const sourceId = currentSource ? source?.id : undefined;
    if(activeBonus(target,bonusTick(this.state.time))==='immortal' && ordinaryCombatDamage(kind)){
      this.emit('immune',target,{sourceId,weapon:kind});return false;
    }
    const absorbed = Math.min(target.armor || 0, amount * .32); target.armor = Math.max(0, (target.armor || 0) - absorbed);
    const dealt = Math.min(target.hp, amount - absorbed); target.hp = Math.max(0, target.hp - dealt);
    const hitPoint = context.point ?? { x: target.x, y: target.y + target.height * .6, z: target.z };
    const sourcePosition = context.sourcePosition ?? (source ? eye(source) : { ...hitPoint });
    const length = Math.hypot(hitPoint.x - sourcePosition.x, hitPoint.y - sourcePosition.y, hitPoint.z - sourcePosition.z) || 1;
    const incoming = context.direction ?? { x: (hitPoint.x - sourcePosition.x) / length, y: (hitPoint.y - sourcePosition.y) / length, z: (hitPoint.z - sourcePosition.z) / length };
    target.hurtTime = this.state.time; target.hurtDirection = { ...incoming };
    const head = context.head ?? inHeadRegion(target, hitPoint.y);
    const detail = { ...(context.rocketId?{rocketId:context.rocketId}:{}), sourceId, sourceName, targetName: target.name, weapon: kind, amount: dealt, hp: target.hp, head,
      point: { ...hitPoint }, direction: { ...incoming }, sourcePosition: { ...sourcePosition }, ...hitPoint };
    this.emit('damage', target, detail); this.emit('hit', target, detail);
    if(target.kind==='zombie')reactZombie(this,target,kind,detail,owner&&!currentSource?undefined:source);
    if (target.hp > 0) return true;
    if(target.controllerType){
      this.interruptCartridge(target);target.waitTriggerRelease=false;resetRush(target);
      clearActorBonus(target,true);
    }
    target.alive = false; target.deaths++; target.action = null; target.reloadUntil=target.reloadStartedAt=target.reloadDuration=0; target.deathAt = this.state.time;
    target.deathVariant = context.head && canAim(kind) && Object.hasOwn(TEAMS,target.team) ? 'headshot' : '';
    target.deathCause = { sourceId, sourceName, weapon: kind, point: { ...hitPoint }, direction: { ...incoming } };
    if (source && sourceTeam && source!==target && target.team && sourceTeam!==target.team) { source.kills++; source.money = Math.min(this.config.maxMoney, source.money + this.config.killMoney); }
    if(currentSource && source?.bonus && ordinaryCombatDamage(kind) && eligibleBonusKill(this,source,target,context.bonusOrigin))earnBonusKill(source.bonus);
    if (target.inventory?.primary) this.dropItem(target, target.inventory.primary);
    if(target.kind==='hostage'){target.escortId=null;target.path=[];}
    if(target.kind!=='zombie')recordActionDeath(this,target,source,sourceTeam);
    if (this.bomb.carrierId === target.id) Object.assign(this.bomb, { status: 'dropped', carrierId: null, ...point(target) });
    for (const hostage of this.hostages) if (hostage.escortId === target.id) { hostage.escortId = null; hostage.path = []; }
    this.emit('kill', target, { ...detail, deathAt: target.deathAt }); return true;
  }
  canSee(a, b, smoke = true) {
    if (!this.world.segmentClear(a, b, { vision: true })) return false;
    return !smoke || !this.smokeBlocks(a, b);
  }
  smokeBlocks(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length2 = dx * dx + dy * dy + dz * dz;
    for (const smoke of this.state.smokes) {
      const t = clamp(((smoke.x - from.x) * dx + (smoke.y - from.y) * dy + (smoke.z - from.z) * dz) / (length2 || 1), 0, 1);
      const near = { x: from.x + t * dx, y: from.y + t * dy, z: from.z + t * dz };
      if (Math.hypot(near.x - smoke.x, near.y - smoke.y, near.z - smoke.z) < smoke.radius && this.world.segmentClear(smoke, near, { vision: false })) return true;
    }
    return false;
  }
  updateCartridge(actor,held) {
    const c=actor.cartridge;if(!c)return;
    const now=this.state.time,armed=c.started+CARTRIDGE.pull;
    if(!c.latched && now+EPS>=c.started+CARTRIDGE.pin){c.latched=true;this.emit('cartridge-latch',actor,{grenade:c.type,lifeId:actor.lifeId,controlEpoch:actor.controlEpoch,actionId:c.actionId});}
    if(!held && !c.releaseAt)c.releaseAt=Math.max(now,armed)+CARTRIDGE.release;
    if(!c.releaseAt && !c.deadline && c.type==='he' && now+EPS>=armed)c.deadline=armed+this.config.grenadeFuse;
    const expired=c.deadline && now+EPS>=c.deadline;
    if(expired || (c.releaseAt && now+EPS>=c.releaseAt)){
      actor.waitTriggerRelease=!!held;
      this.throwGrenade(actor,c.type,{held:c,drop:!!expired,inHand:!!expired});
    }
  }
  interruptCartridge(actor,restore=true){
    const c=actor.cartridge;if(!c)return;
    actor.cartridge=null;
    if(!c.releaseAt)actor.waitTriggerRelease=true;
    if(c.deadline)this.throwGrenade(actor,c.type,{held:c,drop:true,restore});
  }
  throwGrenade(actor, type, {held=null,drop=false,restore=true,inHand=false}={}) {
    if (this.phase !== 'active' || !actor.alive || !actor.inventory[type]) return false;
    actor.cartridge=null;actor.inventory[type]--;
    if(this.config.networkSlice)actor.spawnProtectedUntil=0;
    const grenade={bonusOrigin:bonusOrigin(this,actor),...grenadeLaunch(actor,this.config,this.state.time,type),
      ...(this.config.networkSlice?{owner:actor,team:actor.team,ownerLifeId:actor.lifeId??0,ownerName:actor.name,ownerControlEpoch:actor.controlEpoch??0}:{}),id:`grenade-${++this.eventSerial}`};
    if(inHand)grenade.inHand=true;
    if(held?.deadline)grenade.deadline=held.deadline;
    if(drop)Object.assign(grenade,{vx:0,vy:0,vz:0,y:actor.y+actor.height*.55});
    this.state.grenades.push(grenade);
    this.emit('throw',actor,{grenade:type,dropped:drop,lifeId:actor.lifeId,controlEpoch:actor.controlEpoch,actionId:held?.actionId||''});
    if(restore){
      const previous=actor.lastWeapon;
      if(!['primary','pistol','knife'].includes(WEAPONS[previous]?.slot) || !this.select(previous,actor))
        this.select(actor.inventory.primary?.id ?? actor.inventory.pistol?.id ?? 'knife',actor);
    }
    actor.nextShot=Math.max(actor.nextShot,this.state.time+CARTRIDGE.return-CARTRIDGE.release);
    return true;
  }
  updateGrenades(dt) {
    const remaining = [];
    for (const grenade of this.state.grenades) {
      const hit = !grenade.inHand && advanceGrenade(grenade, this.world, this.config.gravity, dt);
      if (hit && this.state.time - grenade.lastBounce > .12) {
        this.emit('bounce', null, { ...point(grenade), grenade: grenade.type }); grenade.lastBounce = this.state.time;
      }
      if (this.state.time + EPS >= grenade.deadline) this.detonateGrenade(grenade); else remaining.push(grenade);
    }
    this.state.grenades = remaining;
  }
  detonateGrenade(grenade) {
    const c = this.config; this.emit(grenade.type, null, { ...point(grenade), grenade: grenade.type, ownerId: grenade.ownerId, ...(grenade.owner?{team:grenade.team,ownerLifeId:grenade.ownerLifeId}:{}) });
    if (grenade.type === 'smoke') {
      this.state.smokes.push({ ...point(grenade), y: grenade.y + 1, id: grenade.id, radius: c.smokeRadius, until: this.state.time + c.smokeDuration }); return;
    }
    const owner = c.networkSlice ? grenade.owner : this.actors.find(a => a.id === grenade.ownerId), origin = { ...point(grenade), y: grenade.y + .08 };
    for (const actor of [...this.actors,...(this.state.zombies||[]),...(this.config.hostageDamage?this.hostages:[]),...(this.config.wanderers?this.state.wanderers||[]:[])]) {
      if (!actor.alive||actor.rescued) continue;
      const target = eye(actor), d = Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z);
      if (grenade.type === 'he') {
        // Solid glass is cover for blast; clear glass only permits vision/flash.
        if (d < c.heRadius && ((grenade.inHand && actor===owner) || this.world.segmentClear(origin, { ...target, y: actor.y + actor.height * .55 }, { vision: false }))) this.pendingDamage.push({ target: actor, amount: 105 * (1 - d / c.heRadius), source: owner, bonusOrigin:grenade.bonusOrigin, projectileOwner: c.networkSlice ? grenade : undefined, kind: 'he', inHand:!!grenade.inHand, point: { ...target, y: actor.y + actor.height * .55 }, sourcePosition: origin });
      } else if (d < c.flashRadius && this.world.segmentClear(origin, target, { vision: true })) {
        const view = direction(actor.yaw, actor.pitch), dot = ((origin.x - target.x) * view.x + (origin.y - target.y) * view.y + (origin.z - target.z) * view.z) / (d || 1);
        const strength = (1 - d / c.flashRadius) * (dot > .35 ? 1 : dot > -.25 ? .5 : .16);
        actor.flashStrength = Math.max(actor.flash || 0, strength); actor.flashStart = this.state.time; actor.flashUntil = this.state.time + c.flashDuration * strength; actor.flash = strength;
      }
    }
  }
  interaction(actor = this.player, targetId = null) {
    if (!actor?.alive || this.phase !== 'active') return null;
    if(isEndless(this))return null;
    const b = this.bomb, range = this.config.interactDistance;
    const reaches = target => distance(actor, target) < range && this.world.segmentClear(eye(actor), { ...point(target), y: (target.y ?? 0) + .4 }, { vision: false });
    if (actor.team === 'analysts' && b.status === 'planted' && reaches(b)) return { type: 'defuse', target: b, duration: this.config.defuseTime };
    if (actor.team === 'counterAnalysts') {
      if (b.carrierId === actor.id && distance(actor, this.world.anchors.bomb) <= this.world.anchors.bomb.radius && actor.onGround && (!this.config.networkSlice || this.world.segmentClear(eye(actor),{...point(this.world.anchors.bomb),y:.4},{vision:false}))) return { type: 'plant', target: b, duration: this.config.plantTime };
      if (b.status === 'dropped' && reaches(b)) return { type: 'pickupBomb', target: b };
      const hostage = this.hostages.filter(h => h.alive!==false && !h.rescued && (!h.escortId || h.escortId === actor.id) && (!targetId || h.id === targetId))
        .sort((a, c) => distance(actor, a) - distance(actor, c)).find(reaches);
      if (hostage) return { type: 'escort', target: hostage };
    }
    const drop = this.state.drops.find(reaches);
    return drop ? { type: 'pickupWeapon', target: drop } : null;
  }
  prompt(actor = this.player) {
    if(this.config.networkSlice && this.config.mode!=='classic')return '';
    if (!actor?.alive) return 'Eliminated · spectate a surviving teammate';
    if (this.phase === 'buy') return 'B · Buy equipment';
    const action = this.interaction(actor);
    if (!action) return '';
    return { plant: 'Hold E · Plant in '+missionRoomName(this.world), defuse: 'Hold E · Defuse', pickupBomb: 'E · Pick up bomb', escort: action.target.escortId ? 'E · Stop escort' : 'E · Start escort', pickupWeapon: `E · Pick up ${WEAPONS[action.target.item?.id]?.name ?? 'weapon'}` }[action.type];
  }
  interact(actor, input) {
    if(this.config.networkSlice && this.config.mode!=='classic')return;
    const interaction = input.interact && (!this.config.networkSlice||!actor.reloadUntil) ? this.interaction(actor, input.interactTarget) : null;
    if (!interaction) { actor.action = null;if(input.interact){const door=this.world.doors?.nearest(actor);if(door)this.world.doors.request(door,this.state.time,actor);} return; }
    if (interaction.duration) {
      if (actor.moving > .15 || !actor.onGround) { actor.action = null; return; }
      if (!actor.action || actor.action.type !== interaction.type) {
        actor.action = { type: interaction.type, start: this.state.time, duration: interaction.duration, x: actor.x, z: actor.z };
        this.emit(interaction.type, actor, { duration: interaction.duration });
      }
      if (distance(actor.action, actor) > .12) { actor.action = null; return; }
      const at = actor.action.start + actor.action.duration;
      if (this.state.time + EPS >= at) {
        if (interaction.type === 'plant' && at < this.state.deadline - EPS && this.bomb.status === 'carried' && this.bomb.carrierId === actor.id) {
          Object.assign(this.bomb, { status: 'planted', carrierId: null, ...point(actor), plantedAt: at, deadline: at + this.config.bombTime, nextBeep: at });
          this.emit('planted', actor, { deadline: this.bomb.deadline });
          if (actor.weapon === 'bomb') this.select(actor.inventory.primary?.id ?? actor.inventory.pistol?.id ?? 'knife', actor);
        } else if (interaction.type === 'defuse' && at < this.bomb.deadline - EPS) this.roundCandidates.push({ winner: 'analysts', reason: 'defuse', at });
        actor.action = null;
      }
      return;
    }
    actor.action = null;
    if (actor.interactHeld) return;
    if (interaction.type === 'pickupBomb') { Object.assign(this.bomb, { status: 'carried', carrierId: actor.id }); this.emit('pickup', actor, { item: 'bomb' }); }
    if (interaction.type === 'escort') { interaction.target.escortId = interaction.target.escortId ? null : actor.id; interaction.target.path = []; this.emit('hostage', interaction.target, { escortId: interaction.target.escortId }); }
    if (interaction.type === 'pickupWeapon') {
      const { item } = interaction.target, slot = WEAPONS[item.id].slot;
      if (actor.inventory[slot]) this.dropItem(actor, actor.inventory[slot]);
      actor.inventory[slot] = item; this.state.drops = this.state.drops.filter(d => d !== interaction.target); this.select(item.id, actor); this.emit('pickup', actor, { item: item.id });
    }
  }
  updateHostages(dt) {
    for (const hostage of this.hostages) {
      if (hostage.rescued||hostage.alive===false) continue;
      const escort = this.actors.find(a => a.id === hostage.escortId && a.alive);
      if (!escort) { hostage.escortId = null; hostage.path = []; continue; }
      const rescue = this.world.anchors.rescue;
      const target = distance(escort, rescue) < rescue.radius + 1 ? rescue : escort;
      if (this.state.time >= hostage.pathAt && (distance(hostage, target) > .85 || distance(hostage, rescue) < rescue.radius + 2)) {
        hostage.path = this.world.findPath(hostage, target);
        if(!hostage.path.length)hostage.path=rejoinNavigation(this,hostage);
        hostage.pathAt = this.state.time + .65;
      }
      while (hostage.path.length && distance(hostage, hostage.path[0]) < .07) hostage.path.shift();
      const next = hostage.path[0];
      if (next && (distance(hostage, target) > .85 || target === rescue)) {
        const d = distance(hostage, next), step = Math.min(d, this.config.hostageSpeed * dt), before = point(hostage);
        this.moveBody(hostage, (next.x - hostage.x) / d * step, -.05, (next.z - hostage.z) / d * step);
        hostage.distanceWalked += distance(before, hostage);
        hostage.yaw = Math.atan2(-(next.x - before.x), -(next.z - before.z));
      }
      if (distance(hostage, rescue) <= rescue.radius && this.world.segmentClear({ ...point(hostage), y: .8 }, { ...point(rescue), y: .8 }, { vision: false })) {
        hostage.rescued = true; hostage.rescuedAt = this.state.time; hostage.escortId = null; hostage.path = [];
        this.emit('rescued', hostage);
      }
    }
  }
  updateBomb() {
    if (this.bomb.status === 'carried') {
      const carrier = this.actors.find(a => a.id === this.bomb.carrierId); if (carrier) Object.assign(this.bomb, point(carrier));
    }
    if (this.bomb.status === 'planted' && this.state.time >= this.bomb.nextBeep) {
      const remaining = this.bomb.deadline - this.state.time;
      this.emit('beep', null, { ...point(this.bomb), remaining }); this.bomb.nextBeep = this.state.time + clamp(remaining / 30, .12, 1);
    }
  }
  finishRound(result) {
    const s = this.state; if (isEndless(this)||s.result || s.phase !== 'active') return false;
    s.result = { ...result, round: s.round }; s.history.push(s.result); s.phase = 'result'; s.resultDeadline = s.time + this.config.resultTime;
    if (result.winner) s.score[result.winner]++;
    for (const team of Object.keys(TEAMS)) {
      let reward = this.config.lossMoney;
      if (result.winner === team) { reward = this.config.winMoney; s.lossStreak[team] = 0; }
      else if (result.winner) { reward = Math.min(this.config.maxLossMoney, this.config.lossMoney + this.config.lossIncrement * s.lossStreak[team]); s.lossStreak[team]++; }
      for (const a of this.actors.filter(actor => actor.team === team)) a.money = Math.min(this.config.maxMoney, a.money + reward);
    }
    for (const a of this.actors) { clearActorBonus(a);a.cartridge=null;a.waitTriggerRelease=false;resetRush(a); a.action = null; a.reloadUntil=a.reloadStartedAt=a.reloadDuration=0; a.flash = 0; a.flashUntil = 0; }
    s.grenades = []; s.smokes = []; this.soundEvents = [];
    if (this.config.networkSlice) s.projectiles = [];
    s.bomb.status = result.reason === 'detonation' ? 'detonated' : result.reason === 'defuse' ? 'defused' : 'inactive';
    s.bomb.carrierId = null; s.bomb.deadline = Infinity; s.bomb.nextBeep = Infinity;
    this.emit('result', null, { ...result });
    if (result.winner && s.score[result.winner] >= this.config.matchWins) { s.phase = 'match'; this.emit('match', null, { winner: result.winner }); }
    return true;
  }
  emit(type, actor, extra = {}) {
    const event = { type, time: this.state.time, serial: ++this.eventSerial, ...(actor ? { ...point(actor), actorId: actor.id, team: actor.team } : {}), ...extra };
    this.events.push(event);
    combatEvent(this,event);
    if (['shot', 'step', 'jump', 'land', 'reload', 'throw', 'bounce', 'he', 'plant', 'defuse', 'rustle'].includes(type)) this.soundEvents.push(event);
    if (this.events.length > 2500) this.events.splice(0, this.events.length - 2500);
    return event;
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
}

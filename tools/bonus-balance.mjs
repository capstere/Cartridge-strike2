// Reproducible initial balance evidence. Ordinary bot combat measures threshold
// opportunities; paired human-controller trials measure effect magnitude.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import '../server/register-shared.mjs';
import {loadHeadlessWorld} from '../server/headless.mjs';
import {Game,WEAPONS} from '../src/fps/game.mjs';
import {BONUSES,earnBonusKill,bonusTick} from '../src/fps/bonuses.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';

const mode={mode:'endless',firefight:false,wanderers:false,zombies:false,danceman:false};
const rounds=[];
for(const seed of [42,81]){
  const {world}=await loadHeadlessWorld('compact-arena');
  const game=new Game(world,{seed,autoplay:true,config:mode}).start();
  const awards={uav:0,rage:0,immortal:0};
  let longest=0;
  const damage=game.damage;
  game.damage=function(target,amount,source,...args){
    const before=source?.bonus?.progress;
    const result=damage.call(this,target,amount,source,...args);
    if(result && before!==undefined && source.bonus.progress>before){
      longest=Math.max(longest,source.bonus.progress);
      const item=BONUSES.find(item=>item.threshold===source.bonus.progress);
      if(item)awards[item.id]++;
    }
    return result;
  };
  for(let i=0;i<60*180;i++){game.stepActors();game.drainEvents();}
  assert(game.actors.every(a=>!a.bonus.active));
  rounds.push({seed,simulationSeconds:180,actors:game.actors.length,kills:game.actors.reduce((n,a)=>n+a.kills,0),
    deaths:game.actors.reduce((n,a)=>n+a.deaths,0),longestLifeStreak:longest,thresholdOpportunities:awards});
}
async function movementTrial(slot){
  const {world}=await loadHeadlessWorld('compact-arena');
  const game=new Game(world,{controllers:{'analysts-0':'human','counterAnalysts-0':'human'},localPlayerId:'analysts-0',seed:42,
    config:{...mode,networkSlice:true,spawnProtection:0}}).start();
  const actor=game.player,target=game.actors.find(a=>a!==actor),origin={x:actor.x,z:actor.z};
  if(slot){for(let i=0;i<8;i++)earnBonusKill(actor.bonus);assert(game.requestBonus(slot));}
  const frame=new Map([[actor.id,{forward:1,yaw:actor.yaw}]]);
  for(let i=0;i<15;i++)game.stepActors(frame);
  const distance=Math.hypot(actor.x-origin.x,actor.z-origin.z);
  game.item(actor).ammo-=1;
  assert(game.reload(actor));
  const milliseconds=1000*(actor.reloadUntil-game.state.time);
  const weapon=actor.weapon,hp=actor.hp,armor=actor.armor;
  const damageApplied=game.damage(actor,WEAPONS.smg.damage,target,'smg');
  return {distanceMeters:distance,reloadMilliseconds:milliseconds,weapon,shotDamage:WEAPONS[weapon].damage,
    fireIntervalSeconds:WEAPONS[weapon].interval,receivedSmgDamage:damageApplied,hpLoss:hp-actor.hp,armorLoss:armor-actor.armor,ticks:bonusTick(game.state.time)};
}
const base=await movementTrial(0),rage=await movementTrial(2),immortal=await movementTrial(3);
const moveRatio=rage.distanceMeters/base.distanceMeters,reloadRatio=rage.reloadMilliseconds/base.reloadMilliseconds;
assert(Math.abs(moveRatio-1.2)<.001);assert(Math.abs(reloadRatio-.75)<.001);
assert(base.hpLoss>0&&rage.hpLoss===base.hpLoss&&immortal.hpLoss===0&&!immortal.receivedSmgDamage);
const report={build:CONTRACT.buildHash,map:'compact-arena',normalBotMatches:rounds,pairedInputs:{base,rage,immortal,moveRatio,reloadRatio}};
if(process.env.CS3_BONUS_BALANCE)await writeFile(process.env.CS3_BONUS_BALANCE,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));

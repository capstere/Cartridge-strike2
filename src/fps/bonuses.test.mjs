import test from 'node:test';
import assert from 'node:assert/strict';
import {BONUSES,createBonusState,resetBonusLife,earnBonusKill,activateBonus,activeBonus,snapshotUav,visibleUav,eligibleBonusKill,bonusOrigin} from './bonuses.mjs';

test('three thresholds award once per life, charges cap and survive death',()=>{
 const b=createBonusState();
 for(let count=1;count<=8;count++){
   earnBonusKill(b);assert.equal(b.progress,count);
   for(const item of BONUSES)assert.equal(b.charges[item.id],Number(count>=item.threshold));
 }
 assert(activateBonus(b,1,10,1,'test-1'));assert(!activateBonus(b,2,10,2,'test-2'));assert.equal(b.charges.rage,1);
 assert.equal(activeBonus({bonus:b},909),'uav');assert.equal(activeBonus({bonus:b},910),null);
 earnBonusKill(b);assert.equal(b.charges.uav,0);
 resetBonusLife(b);assert.deepEqual(b.charges,{uav:0,rage:1,immortal:1});assert.equal(b.earnedMask,0);assert.equal(b.progress,0);
 for(let i=0;i<8;i++)earnBonusKill(b);
 assert.equal(b.earnedMask,7);assert.deepEqual(b.charges,{uav:1,rage:1,immortal:1});
 for(const item of BONUSES){
   const c=createBonusState();c.charges[item.id]=1;
   assert(activateBonus(c,item.slot,23,1,'unique'));
   assert.equal(activeBonus({bonus:c},22),null);assert.equal(activeBonus({bonus:c},23+item.durationTicks-1),item.id);
   assert.equal(activeBonus({bonus:c},23+item.durationTicks),null);
 }
});
test('recorded enemy positions arrive with the wave, then expire or fade without following bodies',()=>{
 const target={x:60,z:0},p=snapshotUav({x:0,z:0},[target],17,917);target.x=100;
 assert.deepEqual(visibleUav(p,76),[]);assert.deepEqual(visibleUav(p,77),[{x:60,z:0,alpha:1}]);
 assert.equal(visibleUav(p,185)[0].alpha,.5);assert.deepEqual(visibleUav(p,233),[]);
});
test('bonus progress excludes passive actors, allied bodies and stale launch or impact provenance',()=>{
 const a={id:'a',lifeId:2,controlEpoch:3,team:'analysts',controllerType:'human',alive:true,bonus:createBonusState()};
 const b={id:'b',team:'counterAnalysts',controllerType:'bot'},g={state:{time:1,matchId:4,mode:'classic'},actors:[a,b]};
 const origin=bonusOrigin(g,a);assert(eligibleBonusKill(g,a,b,origin));
 for(const k of ['actorId','matchId','lifeId','controlEpoch','enhanced'])assert(!eligibleBonusKill(g,a,b,{...origin,[k]:999}));
 a.bonus.charges.rage=1;activateBonus(a.bonus,2,60,1,'active');assert(!eligibleBonusKill(g,a,b,origin));
 g.state.time=17;assert(eligibleBonusKill(g,a,b,origin));b.team=a.team;assert(!eligibleBonusKill(g,a,b,origin));
 g.state.mode='ffa';assert(eligibleBonusKill(g,a,b,origin));assert(!eligibleBonusKill(g,a,a,origin));
 b.controllerType='resident';assert(!eligibleBonusKill(g,a,b,origin));
});

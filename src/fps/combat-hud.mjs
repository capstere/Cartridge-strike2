/** Private session feedback. textContent only: names can never inject markup. */
import {combatOpponents} from './bonuses.mjs';
import {WEAPONS} from './config.mjs';
import {activeControl} from './combat-flow.mjs';
export class CombatHUD{
 constructor(settings){
  this.settings=settings;this.lastSerial=0;this.medalUntil=0;this.hitUntil=0;this.warnUntil=0;
  const host=document.getElementById('hud');this.root=document.createElement('div');this.root.id='combat-feedback';
  this.root.innerHTML=`<section id="control-card" hidden><small>CONTROL ZONE · ENDLESS</small><strong id="control-name"></strong><span id="control-state"></span><div class="control-progress"><i></i></div><footer><span id="control-clock"></span><span id="control-score"></span></footer></section><section id="combat-session"><span>SESSION</span><b>0</b><small></small></section><section id="combat-medal" hidden><small></small><strong></strong><span></span></section><div id="combat-hit-label" hidden></div><div id="combat-warning" hidden>FRIENDLY FIRE · TEAMMATE</div><section id="combat-recap" hidden><small>LAST ENCOUNTER</small><strong></strong><span></span></section>`;
  host.append(this.root);this.nodes={};this.root.querySelectorAll('[id]').forEach(e=>this.nodes[e.id]=e);
 }
 text(node,value){if(node.textContent!==String(value))node.textContent=value;}
 events(events,g){
  for(const e of events){
   const local=e.type==='damage'?e.sourceId===g.player.id:
     (e.type==='combat-hit'||e.type==='combat-medal')&&e.actorId===g.player.id;
   // Predicted shots and private reward messages have independent ordering.
   if(!local||!Number.isSafeInteger(e.serial)||e.serial<=this.lastSerial)continue;
   this.lastSerial=e.serial;
   if(e.type==='combat-medal'&&e.actorId===g.player.id){const el=this.nodes['combat-medal'];el.dataset.kind=e.kind;this.text(el.querySelector('small'),`+${e.points} SESSION POINTS`);this.text(el.querySelector('strong'),e.title);this.text(el.querySelector('span'),e.detail);this.medalUntil=e.time+2.5;}
   if(e.type==='combat-hit'&&e.actorId===g.player.id){this.hitUntil=e.time+(e.lethal?.38:.18);this.hitKind=e.lethal?'kill':e.head?'head':'body';this.text(this.nodes['combat-hit-label'],e.lethal?'ELIMINATED':e.head?'HEADSHOT':'HIT');}
   if(e.type==='damage'&&e.sourceId===g.player.id&&e.team===g.team&&e.actorId!==g.player.id&&!combatOpponents(g.player,g.actors.find(a=>a.id===e.actorId),g.state.mode)){this.warnUntil=e.time+1.5;this.text(this.nodes['combat-warning'],'FRIENDLY FIRE · TEAMMATE');}
   if(e.type==='damage'&&e.sourceId===g.player.id&&g.hostages.some(h=>h.id===e.actorId)){this.warnUntil=e.time+1.5;this.text(this.nodes['combat-warning'],'HOSTAGE HIT · NO AWARD');}
  }
 }
 update(g){
  const t=g.state.time,p=g.player;if(!p)return;
  const f=g.state.combatFlow,z=activeControl(g),card=this.nodes['control-card'];card.hidden=!z;
  // Replace the redundant old objective strip, rather than cover it with a panel.
  document.getElementById('objectives').hidden=!!z;
  document.getElementById('spawn-protection').style.top=z?(window.innerWidth<=900?'162px':'180px'):'';
  Object.assign(document.getElementById('spectate').style,{top:'auto',bottom:'230px'});
  Object.assign(this.nodes['combat-recap'].style,{top:'auto',bottom:'128px',transform:'translateX(-50%)'});
  this.nodes['combat-warning'].style.top='calc(50% - 62px)';
  if(z){
   this.text(card.querySelector('small'),`CONTROL ZONE · FF ${g.config.friendlyFire?'ON':'OFF'} · Z RADIO`);
   this.text(this.nodes['control-name'],z.name);
   const inside=f.occupants.includes(p.id),distance=Math.round(Math.hypot(p.x-z.x,p.z-z.z));
   this.text(this.nodes['control-state'],f.contested?'CONTESTED · BOTH TEAMS PRESENT':f.capturing===g.team?`CAPTURING ${Math.round(f.progress*100)} %`:f.owner===g.team?(inside?'HOLD THE ZONE · CONTROL POINTS':'YOUR TEAM CONTROLS THE ZONE'):f.owner?'ENEMY CONTROL':`CAPTURE · ${distance} m`);
   card.dataset.state=f.contested?'contested':f.owner===g.team?'owned':'neutral';card.querySelector('i').style.width=`${f.capturing?f.progress*100:f.owner?100:0}%`;
   const bearing=Math.atan2(-(z.x-p.x),-(z.z-p.z))-p.yaw,relative=Math.atan2(Math.sin(bearing),Math.cos(bearing));
   this.text(this.nodes['control-clock'],`${distance<3?'●':Math.abs(relative)<.55?'↑':relative>0?'←':'→'} ${distance} m · moves in ${Math.max(0,Math.ceil(f.rotateAt-t))} s`);
   this.text(this.nodes['control-score'],`A ${f.scores.analysts} · CA ${f.scores.counterAnalysts}`);
  }
  const c=p.combat,session=this.nodes['combat-session'];session.hidden=!c;
  if(c){this.text(session.querySelector('b'),c.points);this.text(session.querySelector('small'),`${p.kills} K · ${c.assists} A · ${p.deaths} D  /  best streak ${c.bestStreak}`);}
  this.nodes['combat-medal'].hidden=t>=this.medalUntil||!p.alive;
  const hit=this.nodes['combat-hit-label'];hit.hidden=t>=this.hitUntil||!p.alive;hit.dataset.kind=this.hitKind||'body';
  const marker=document.getElementById('hitmarker');marker.dataset.kind=t<this.hitUntil?this.hitKind:'';
  this.nodes['combat-warning'].hidden=t>=this.warnUntil||!p.alive;
  const recap=this.nodes['combat-recap'];recap.hidden=p.alive||!c?.recap;
  if(!recap.hidden){const r=c.recap;this.text(recap.querySelector('strong'),`${r.attacker} · ${WEAPONS[r.weapon]?.name||r.weapon||'Damage'}`);this.text(recap.querySelector('span'),`${r.hits} hits · ${r.damage} health damage${r.distance===null?'':` · ${r.distance} m on hit`} · streak ${r.streak}`);}
 }
 reset(){this.lastSerial=0;this.medalUntil=this.hitUntil=this.warnUntil=0;this.root.querySelectorAll('section, #combat-hit-label, #combat-warning').forEach(e=>e.hidden=true);}
}

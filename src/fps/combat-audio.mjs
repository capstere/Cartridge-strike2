/** Quiet local feedback, never a new AI sound/perception event. */
import {AudioSystem as ActionAudio} from './action-audio.mjs';
export class AudioSystem extends ActionAudio{
 play(e){
  if(e.type==='hit')return; // new hostile-only confirmation replaces the old generic hit ping
  if(['combat-hit','combat-medal'].includes(e.type)){
   if(e.actorId!==this.game?.player?.id||this.settings?.combatSounds===false)return;
   const own={...e,actorId:this.listenerId};
   if(e.type==='combat-hit'){
    if(e.time-(this.lastConfirm??-Infinity)<.065)return;this.lastConfirm=e.time;
    this.tone(own,e.head?1180:760,.035,.035,'triangle',e.head?780:480);return;
   }
   if(e.kind==='kill'){this.tone(own,520,.13,.075,'sine',820);this.tone(own,1040,.12,.045,'sine',1300,.06);}
   else this.tone(own,e.kind==='capture'?660:440,.10,.05,'sine',880);
   return;
  }
  super.play(e);
 }
 reset(){super.reset();this.lastConfirm=-Infinity;}
}

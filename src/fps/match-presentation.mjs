// English player-facing names are shared by the room, menu, scoreboard and results.
export const MODE_NAMES=Object.freeze({tdm:'Team Deathmatch',classic:'Classic',endless:'Endless Action',ffa:'Free-for-All',dom:'Domination'});
export const MODE_GUIDES=Object.freeze({
  classic:'Plant or defuse the bomb, rescue the hostages, or eliminate the opposing team. One life per round.',
  endless:'Respawn in three seconds. Press B for a free loadout. Optional control zones bring teams together. Play as long as you like.',
  ffa:'Every other operator is an opponent. Earn one point per elimination. The highest individual score wins.',
  dom:'Stand inside A, B or C to capture it. Opponents contest the zone. Hold zones to score for your team.'
});
const comparePlayers=(a,b)=>b.kills-a.kills||a.deaths-b.deaths||(b.combat?.points||0)-(a.combat?.points||0)||String(a.id).localeCompare(String(b.id));
export function rankPlayers(actors){
  return Array.from(actors).sort(comparePlayers);
}
export function leadingPlayer(actors){
  let leader;
  for(const actor of actors)if(!leader||comparePlayers(actor,leader)<0)leader=actor;
  return leader;
}
export function matchWinnerName(winner,actors,teams){
  if(!winner||winner==='draw')return '';
  return teams[winner]||Array.from(actors).find(a=>a.id===winner)?.name||'Operator';
}
export function zoneCaption(z,team){
  if(z.contested)return 'Contested';
  if(z.owner)return z.owner===team?'Held':'Enemy';
  return Math.abs(z.progress)>0?'Capturing':'Neutral';
}

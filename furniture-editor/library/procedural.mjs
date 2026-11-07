import {LAB_FURNITURE_LIBRARY} from './lab-furniture.mjs?v=5.8.0';
import {FPS_LIBRARY} from './fps-catalog.mjs?v=5.8.0';
/** Shared low-poly furnishings for the studio and authored FPS levels. */
export const PROCEDURAL_LIBRARY=Object.freeze([
 ...LAB_FURNITURE_LIBRARY,
 ...FPS_LIBRARY.filter(entry=>!entry.url),
 {id:'studio:reuse-barrel',name:'Ståltunna',category:'labb',width:0.59,depth:0.59,height:0.846,shape:'reuse',prefab:'barrel',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-jersey',name:'Betongbarriär',category:'labb',width:2,depth:0.48,height:0.78,shape:'reuse',prefab:'jersey',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-sandbags',name:'Sandsäckar',category:'labb',width:2.1036,depth:0.3804,height:0.6,shape:'reuse',prefab:'sandbags',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-rack',name:'Pallställ',category:'labb',width:2.675,depth:1.12,height:2.8,shape:'reuse',prefab:'rack',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-container',name:'Fraktcontainer',category:'labb',width:2.508,depth:6.1245,height:2.6,shape:'reuse',prefab:'container',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-hvac',name:'Ventilationsaggregat',category:'labb',width:1.26,depth:0.602,height:0.7275,shape:'reuse',prefab:'hvac',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-generator',name:'Generator',category:'labb',width:1.45,depth:0.9,height:1.09,shape:'reuse',prefab:'generator',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-reel',name:'Kabeltrumma',category:'labb',width:0.915,depth:1.1,height:1.1,shape:'reuse',prefab:'reel',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-bollard',name:'Skyddspollare',category:'labb',width:0.34,depth:0.34,height:0.9125,shape:'reuse',prefab:'bollard',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-jerrycan',name:'Dunk',category:'labb',width:0.4,depth:0.17,height:0.56,shape:'reuse',prefab:'jerrycan',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:reuse-worktable',name:'Verkstadsbord',category:'bord',width:1.8,depth:0.86,height:0.8,shape:'reuse',prefab:'worktable',placement:'floor',license:'MIT · Riposte / BenDBSS',source:'Befintlig Cartridge Strike-geometri · inga nya modellkopior'},
 {id:'studio:orange-kitchen-chair',name:'Orange köksstol · vanlig stol',category:'stolar',width:.48,depth:.48,height:.76,shape:'dining-chair',kind:'chair',chairRole:'kitchen',featured:true},
 {id:'studio:desk-120',name:'Skrivbord 120 × 70 · vitt/silver',category:'bord',width:1.2,depth:.7,height:.75,shape:'desk'},
 {id:'studio:desk-160',name:'Skrivbord 160 × 80 · vitt/silver',category:'kontor',width:1.6,depth:.8,height:.75,shape:'desk'},
 {id:'studio:desk-180',name:'Skrivbord 180 × 80 · vitt/silver',category:'kontor',width:1.8,depth:.8,height:.75,shape:'desk'},
 {id:'studio:slim-120',name:'Smalt köksbord 120 × 45 · vitt/silver',category:'kok',width:1.2,depth:.45,height:.75,shape:'table'},
 {id:'studio:slim-180',name:'Smalt köksbord 180 × 45 · vitt/silver',category:'kok',width:1.8,depth:.45,height:.75,shape:'table'},
 {id:'studio:slim-240',name:'Smalt långbord 240 × 50 · vitt/silver',category:'kok',width:2.4,depth:.5,height:.75,shape:'table'},
 {id:'studio:round-80',name:'Runt bord Ø 80 · vitt/silver',category:'bord',width:.8,depth:.8,height:.75,shape:'round'},
 {id:'studio:round-110',name:'Runt bord Ø 110 · vitt/silver',category:'bord',width:1.1,depth:1.1,height:.75,shape:'round'},
 {id:'studio:round-140',name:'Runt bord Ø 140 · vitt/silver',category:'bord',width:1.4,depth:1.4,height:.75,shape:'round'},
 {id:'studio:desk-screen-120',name:'Bordsskärm blå · 120 cm',category:'kontor',width:1.2,depth:.07,height:.48,shape:'screen',placement:'desk-edge'},
 {id:'studio:desk-screen-160',name:'Bordsskärm blå · 160 cm',category:'kontor',width:1.6,depth:.07,height:.48,shape:'screen',placement:'desk-edge'},
 {id:'studio:counter-120',name:'Köksbänk vit · 120 cm',category:'kok',width:1.2,depth:.62,height:.9,shape:'counter',placement:'floor'},
 {id:'studio:counter-180',name:'Köksbänk vit · 180 cm',category:'kok',width:1.8,depth:.62,height:.9,shape:'counter',placement:'floor'},
 {id:'studio:lab-counter-180',name:'Labbänk vit · 180 cm',category:'labb',width:1.8,depth:.75,height:.9,shape:'counter',placement:'floor'},
 {id:'studio:microwave',name:'Mikrovågsugn mörkgrå',category:'kok',width:.5,depth:.42,height:.31,shape:'microwave',placement:'countertop'},
 {id:'studio:coffee-machine',name:'Kaffemaskin',category:'kok',width:.28,depth:.37,height:.39,shape:'machine',placement:'countertop'},
 {id:'studio:lab-instrument',name:'Labbapparat / analysinstrument',category:'labb',width:.52,depth:.48,height:.47,shape:'machine',placement:'countertop'},
 {id:'studio:monitor',name:'Datorskärm svart',category:'kontor',width:.55,depth:.19,height:.39,shape:'monitor',placement:'countertop'},
 {id:'studio:keyboard',name:'Tangentbord svart',category:'kontor',width:.45,depth:.16,height:.035,shape:'keyboard',placement:'countertop'},
 {id:'studio:printer',name:'Skrivare / etikettprinter',category:'kontor',width:.4,depth:.38,height:.26,shape:'printer',placement:'countertop'},
 {id:'studio:storage-cabinet',name:'Förvaringsskåp vitt',category:'labb',width:.8,depth:.52,height:1.8,shape:'cabinet',placement:'floor'},
 {id:'studio:wall-picture',name:'Tavla med ram · blå',category:'dekor',width:.85,depth:.07,height:.62,shape:'wall-picture',placement:'wall'},
 {id:'studio:wall-clock',name:'Väggklocka · rund',category:'dekor',width:.38,depth:.08,height:.38,shape:'wall-clock',placement:'wall'},
 {id:'studio:wall-shelf',name:'Vägghylla · vit',category:'dekor',width:.9,depth:.25,height:.1,shape:'wall-shelf',placement:'wall'}
].map(o=>Object.freeze({...o,kind:o.kind||'prop',license:o.license||'Original · Designstudion, procedurbyggd',source:o.source||'Designstudions procedurmodeller · inga extra filer',model:o.model||o.shape,thumb:o.thumb||(o.prefab?`./library/thumbs/reuse/${o.prefab}.webp`:null)})));
export const PROCEDURAL_MAP=new Map(PROCEDURAL_LIBRARY.map(o=>[o.id,o]));
/** Correct only the mislabeled office-chair preset from editor 3.4 drafts. */
export function upgradeLegacyOrangeChair(project){let count=0;
 for(const item of [...project.furniture.added,...project.furniture.placements]){
  if(item.assetId!=='kenney:furniture-kit:chairdesk'||item.assetName!=='Orange köksstol · silverben'||item.chairRole!=='kitchen')continue;
  item.assetId='studio:orange-kitchen-chair';item.assetName='Orange köksstol · vanlig stol';
  if(item.w===.62&&item.d===.62&&item.height===1.05){item.w=.48;item.d=.48;item.height=.76;}
  if(!project.assets.library.includes(item.assetId))project.assets.library.push(item.assetId);
  count++;
 }
 return count;
}
export function proceduralOf(item){return PROCEDURAL_MAP.get(item?.assetId)||null;}
export function placementRole(item){return proceduralOf(item)?.placement||'floor';}
export function roundTable(item){return proceduralOf(item)?.shape==='round';}

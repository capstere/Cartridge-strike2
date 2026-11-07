/** Player-facing fiction. Keys are stable technical anchors, never renamed game IDs.
 * Source/provenance names remain internal; this module owns presentation only.
 */
export const GAME_NAME='Cartridge-Strike';
export const COMPLEX_NAME='Unit 05';
export const ROOM_NAMES=Object.freeze({
 I01:'North Laboratory',I02:'Analysis Chamber',I03:'Supply Annex',I04:'Isolation Laboratory',
 I05:'Service Bay',I06:'Washroom A',I07:'Washroom B',I08:'Support Unit',
 I09:'Commons',I10:'Breakroom',I11:'South Atrium',I12:'Technical Storage',I13:'Service Atrium',
 I14:'Meeting Room A',I15:'Washroom C',I16:'Meeting Room B',I17:'Meeting Room C',
 I18:'Print Hub A',I19:'East Breakroom',I20:'Workroom A',I21:'Equipment Storage',
 I22:'Meeting Room D',I23:'Meeting Room E',I24:'Meeting Room F',I25:'Lounge',I26:'Operations Office',
 I27:'Print Hub B',I28:'Planning Room',I29:'Utility Room',I30:'Maintenance Room',
 I31:'Main Atrium',I32:'West Atrium',I33:'East Atrium',I34:'Service Room A',I35:'Service Room B',
 I36:'Support Annex',I37:'Workroom B',I38:'Supply Storage',I39:'Workroom C',I40:'Workroom D',I41:'Workroom E',
 'BYGG-G-0001':'Connecting Passage','BYGG-G-41001':'Cargo Lift','BYGG-G-41002':'Transit Lift'
});
export function roomDisplayName(room){
 const id=typeof room==='string'?room:room?.id;
 if(ROOM_NAMES[id])return ROOM_NAMES[id];
 if(/^C\d{2}$/.test(id||''))return 'Sector '+String.fromCharCode(64+Number(id.slice(1)));
 if(/^(X|OPEN-)/.test(id||''))return 'Service Annex '+String(id).replace(/^X/,'').replace(/^OPEN-V1-/, '').toUpperCase().padStart(2,'0');
 // Unknown/custom rooms must not leak imported names into the game view.
 return COMPLEX_NAME;
}
export function missionRoomName(world){const p=world.anchors?.bomb;return roomDisplayName(p&&(world.roomAt?.(p.x,p.z)||p.roomId));}

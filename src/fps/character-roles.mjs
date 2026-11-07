/** Stable cosmetic slots. Counts describe presentation; never change game rules. */
export const ROLE_SCHEMA=1;
export const ROLE_NAMES=Object.freeze({player:'Spelkaraktär / lagbot',hostage:'Gisslan',dwarf:'Bot-dvärg'});
export const ROLE_TARGETS=Object.freeze({
 player:Object.freeze(['analysts-all','counterAnalysts-all',...['analysts','counterAnalysts'].flatMap(t=>Array.from({length:5},(_,i)=>`${t}-${i}`))]),
 hostage:Object.freeze(['hostage-all','hostage-0','hostage-1']),
 dwarf:Object.freeze(['dwarf-all',...Array.from({length:5},(_,i)=>`dwarf-variant-${i}`),...Array.from({length:14},(_,i)=>`dwarf-${i}`)])
});
export function roleOf(project){return project?.runtime?.role||(project?.base?.team==='hostage'?'hostage':'player');}
export function targetOf(project){return project?.runtime?.target||(roleOf(project)==='hostage'?'hostage-0':roleOf(project)==='dwarf'?'dwarf-variant-0':`${project?.base?.team==='counterAnalysts'?'counterAnalysts':'analysts'}-0`);}
export function validateRole(role,target){if(!ROLE_TARGETS[role]?.includes(target))throw Error('Okänd karaktärsroll eller spelplats.');return {role,target};}
export function roleSelection(project){return validateRole(roleOf(project),targetOf(project));}
export function targetLabel(target){
 if(target==='hostage-all')return 'Alla gisslan';if(target==='dwarf-all')return 'Alla dvärgar';
 if(target.endsWith('-all'))return target.startsWith('counter')?'Hela Counter Analysts-laget':'Hela Analysts-laget';
 if(target.startsWith('dwarf-variant-'))return `Dvärgutseende ${Number(target.split('-').at(-1))+1} · återanvänds`;
 if(target.startsWith('dwarf-'))return `Enskild dvärg ${Number(target.slice(6))+1}`;
 if(target.startsWith('hostage-'))return `Gisslan ${Number(target.slice(8))+1}`;
 return `${target.startsWith('counter')?'C':'A'}-${String(Number(target.split('-').at(-1))+1).padStart(2,'0')}`;
}
export function dwarfVariant(project){return Number.isInteger(project?.base?.variant)?project.base.variant:0;}
export function assignmentKeys(role,id,variant=0){
 if(typeof id!=='string'||!id)return []; // Menu camera has no player slot yet.
 if(role==='dwarf')return [id,`dwarf-variant-${variant}`,'dwarf-all'];
 if(role==='hostage')return [id,'hostage-all'];
 return [id,id.startsWith('counterAnalysts-')?'counterAnalysts-all':'analysts-all'];
}

export const DWARF_PALETTES=Object.freeze(Array.from({length:5},(_,i)=>({
 jacket:['#376a73','#754649','#8a6c32','#4d6653','#55486f'][i],
 skin:['#cfa27c','#c68d66','#a67151','#d7b294','#bf936f'][i],
 hair:['#d1c9b7','#593b29','#aca69b','#815f40','#d6d5cf'][i],
 pants:'#263033',vest:'#263033',boots:'#263033',accent:'#b19b6f'
})));

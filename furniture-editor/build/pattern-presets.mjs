/** Authoring-only floor and wall material names. Stable schema-2 values. */
export const FLOOR_FINISHES=Object.freeze(['carpet','office-carpet','vinyl','dark-tile','dark-gloss-laminate','dark-large-stone']);
export const WALL_PATTERNS=Object.freeze(['white-tile-gray-grout']);
export const PATTERN_SPECS=Object.freeze({
 'dark-tile':Object.freeze({label:'Mörkt kakel',color:'#292e32',roughness:.37,metalness:.03}),
 'dark-gloss-laminate':Object.freeze({label:'Mörkgrå blankt laminat',color:'#404548',roughness:.19,metalness:.055}),
 'dark-large-stone':Object.freeze({label:'Stora mörkgrå stenplattor · ljus fog',color:'#414548',roughness:.69,metalness:0}),
 'white-tile-gray-grout':Object.freeze({label:'Vitt kakel · grå fog',color:'#f1f2f0',roughness:.42,metalness:0})
});
export const hasPattern=type=>Object.hasOwn(PATTERN_SPECS,type);
export const floorBaseColor=surface=>PATTERN_SPECS[surface]?.color||
 (['office-carpet','carpet'].includes(surface)?'#42494f':surface==='vinyl'?'#b7d6d0':'#d8cbbb');

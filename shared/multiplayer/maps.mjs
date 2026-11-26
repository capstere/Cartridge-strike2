// Only these reviewed LevelProjects can be selected by an online room.
export const DEFAULT_MAP_ID = 'floor5-prepared';
export const NETWORK_MAPS = Object.freeze([
  {id: DEFAULT_MAP_ID, name: 'Floor 5 Laboratory', modes: ['tdm', 'classic'], residents: true},
  {id: 'compact-arena', name: 'Compact Arena', modes: ['tdm'], residents: false},
].map(map => Object.freeze({...map, modes: Object.freeze(map.modes),
  file: `levels/${map.id}.json`, preview: `assets/fps/maps/${map.id}.jpg`,
})));

export function networkMap(id) {
  return NETWORK_MAPS.find(map => map.id === id);
}

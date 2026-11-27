// English is the built-in language for all browser preferences and stored profiles.
export const UI_EN = Object.freeze({
  modes: {
    classic: {name: 'Classic rounds', detail: 'Bomb and hostage objectives'},
    endless: {name: 'Endless Action', detail: 'Continuous respawns'},
  },
  maps: {
    'floor5-prepared': 'Floor 5 Laboratory',
    'classic-floor5': 'Floor 5 Laboratory',
    'synthetic-demo': 'Training fixture',
    preview: 'Private level preview',
  },
  loading: {
    level: 'Loading the map',
    renderer: 'Preparing the scene',
    assets: 'Loading models and audio',
    ready: 'Ready to deploy',
    waiting: 'Waiting for this tab to become active',
  },
  defaultOperator: 'Default operator',
  musicOn: 'Music on',
  musicOff: 'Music off',
  musicMute: 'Mute menu music',
  musicUnmute: 'Enable menu music',
});

export function selectedMapName(query, displayName) {
  return displayName || UI_EN.maps[query.get('level') || 'floor5-prepared'] || 'Selected map';
}

import {MATCH_CHOICES,MATCH_PREFERENCES,TEAM_CAPACITY} from '../shared/multiplayer/rules.mjs';

export const matchPreferenceKeys=Object.keys(MATCH_CHOICES);

// The legacy boolean is a shorthand for both team caps. Save it alongside
// the exact values so the preceding release can still read the same file.
export function matchPreferences(value, previous=MATCH_PREFERENCES) {
  const preferences={};
  if(Object.hasOwn(value,'fillBots')&&typeof value.fillBots!=='boolean')return null;
  if(Object.hasOwn(value,'fillBots')){
    preferences.analystsBots=preferences.counterAnalystsBots=value.fillBots?TEAM_CAPACITY:0;
  }
  for(const key of matchPreferenceKeys){
    if(Object.hasOwn(value,key)&&!MATCH_CHOICES[key].includes(value[key]))return null;
    preferences[key]=value[key]??preferences[key]??previous[key];
  }
  preferences.fillBots=preferences.analystsBots>0||preferences.counterAnalystsBots>0;
  return preferences;
}

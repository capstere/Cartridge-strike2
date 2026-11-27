// A published map enters the Solo menu only after its manifest declares playable modes.
// Private and historical links retain their separate local loading paths.
const allModes = ['classic', 'endless'];
const floor = {id:'floor5-prepared', name:'Floor 5 Laboratory', modes:allModes, preview:'assets/fps/maps/floor5-prepared.jpg'};
const local = {id:'preview', name:'Private level preview', modes:allModes};
let manifestPromise;

export function loadSoloManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(new URL('../../levels/manifest.json',import.meta.url), {cache:'no-store'})
      .then(response => {
        if (!response.ok) throw Error('The map list could not be loaded. Check your connection and retry.');
        return response.json();
      }).catch(error => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}

export function soloCatalog(manifest, hasPrivatePreview = false) {
  const entries = [];
  for (const row of manifest.levels || []) {
    if (!/^[a-z0-9-]{1,48}$/.test(row.id) || row.file !== 'levels/' + row.id + '.json' || row.multiplayerOnly) continue;
    const known = row.id === floor.id ? floor : {};
    const supported = row.modes ?? known.modes;
    const modes = Array.isArray(supported) ? allModes.filter(mode => supported.includes(mode)) : [];
    if (!modes.length || row.id === 'synthetic-demo') continue;
    const preview = row.preview || known.preview;
    entries.push({
      id:row.id, file:row.file, name:row.name || known.name || row.id, modes,
      preview:/^assets\/fps\/maps\/[a-z0-9-]+\.(jpg|webp|png)$/.test(preview) ? preview : null,
      random:row.randomEligible === true || row.id === floor.id && row.randomEligible !== false,
    });
  }
  if (hasPrivatePreview) entries.push(local);
  return entries;
}

export function resolveSoloSelection(manifest, query, preferredMode = 'classic') {
  const entries = soloCatalog(manifest);
  const requestedId = query.get('level') || manifest.defaultLevel;
  const requestedMode = allModes.includes(query.get('mode')) ? query.get('mode') : null;
  const mode = requestedMode || (allModes.includes(preferredMode) ? preferredMode : 'classic');
  let source = entries.find(entry => entry.id === requestedId);
  if (requestedId === 'preview') source = local;
  if (requestedId === 'classic-floor5') source = {...floor, id:requestedId};
  if (requestedId === 'synthetic-demo') {
    const fixture = manifest.levels?.find(row => row.id === requestedId && row.file === 'levels/synthetic-demo.json' && !row.multiplayerOnly);
    if (fixture) source = {id:fixture.id, file:fixture.file, name:'Training fixture', modes:allModes};
  }
  if (source && (!requestedMode || source.modes.includes(requestedMode))) {
    return {...source, mode:source.modes.includes(mode) ? mode : source.modes[0], notice:''};
  }
  const eligible = entries.filter(entry => entry.modes.includes(mode));
  const fallback = eligible.find(entry => entry.id === manifest.defaultLevel) || eligible[0];
  if (!fallback) throw Error('No published Solo map supports this mode.');
  const notice = source ? source.name + ' does not support this mode. ' + fallback.name + ' is selected.'
    : 'This map is unavailable in Solo. ' + fallback.name + ' is selected.';
  return {...fallback, mode, notice};
}

export function soloMapURL(location, selection, {team,seed}) {
  const url = new URL(location);
  url.searchParams.set('screen','solo');
  url.searchParams.set('level',selection.id);
  url.searchParams.set('mode',selection.mode);
  url.searchParams.set('team',team === 'counterAnalysts' ? team : 'analysts');
  url.searchParams.set('seed',String(Math.min(999999,Math.max(1,Math.floor(Number(seed) || 42)))));
  return url;
}

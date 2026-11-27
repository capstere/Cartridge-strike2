import {accessText as en} from '../../../shared/multiplayer/access-english.mjs';

export function networkEndpoint(endpoint = globalThis.location?.origin, origin = globalThis.location?.origin) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(en.invalidEndpoint);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(en.sameOrigin);
  }
  return url.origin;
}

// Some Colyseus versions send only the server's reason string. Classify that
// transport input here so the UI never derives a recovery action from its label.
export function connectionFailure(error) {
  const reason = String(error?.message || error || '');
  const code = Number(error?.code);
  let id;
  if (/join cancelled/i.test(reason)) id = 'joinCancelled';
  else if (/incorrect family room password/i.test(reason)) id = 'wrongFamilyPassword';
  else if (/family room .*closed/i.test(reason)) id = 'familyClosed';
  else if (/family room .*unavailable/i.test(reason)) id = 'familyUnavailable';
  else if (/incorrect private|AUTH_FAILED/i.test(reason)) id = 'wrongRoomCode';
  else if (code === 401 || /pilot invite|pilot access|invitation required/i.test(reason)) id = 'pilotExpired';
  else if (/team is full/i.test(reason)) id = 'teamFull';
  else if (/full|locked/i.test(reason)) id = 'roomFull';
  else if (/not found|not defined|invalid room id|does not exist/i.test(reason)) id = 'roomMissing';
  else if (/incompatible|mismatch|version/i.test(reason)) id = 'outdated';
  else if (code === 429 || /too many|room limit/i.test(reason)) id = 'busy';
  else if (/private code|invalid room options/i.test(reason)) id = 'invalidOptions';
  else if (code === 403 || /origin|host/i.test(reason)) id = 'originDenied';
  else if (/fetch|network|ECONN|timeout|ready|aborted/i.test(reason)) id = 'unreachable';
  else id = 'failed';
  return {id, message: en[id], recovery: id === 'pilotExpired' ? 'signIn' : 'retry'};
}

export function connectionMessage(error) {
  const failure = connectionFailure(error);
  return failure.id === 'failed' && typeof error === 'string' ? en.disconnected : failure.message;
}

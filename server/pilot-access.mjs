import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {isIP} from 'node:net';
import {FAMILY_ROOM_ALIAS} from '../shared/multiplayer/family-room.mjs';

const COOKIE = '__Host-cs2_pilot';
const SESSION_SECONDS = 8 * 3600;
const digest = value => createHash('sha256').update(value).digest();
const publicLobby = '/fps/?network=internet';

function httpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.origin === value) return value;
  } catch {}
  return null;
}

export function pilotConfig({publicOrigin, publicOriginFile, pilotInvite, lan}) {
  if ([publicOrigin, publicOriginFile, pilotInvite].every(value => value === undefined)) return {};
  if (lan || (publicOrigin !== undefined) === (publicOriginFile !== undefined)) {
    throw Error('Pilot mode needs one exact HTTPS origin or an absolute origin-file path and a loopback bind.');
  }
  if (publicOrigin !== undefined && !httpsOrigin(publicOrigin)) throw Error('Invalid pilot HTTPS origin.');
  if (publicOriginFile !== undefined && !isAbsolute(publicOriginFile)) throw Error('Pilot origin file must be absolute.');
  if (typeof pilotInvite !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(pilotInvite)) {
    throw Error('Pilot mode requires a generated 32–128 character base64url CS2_PILOT_INVITE.');
  }
  return {publicOrigin, publicOriginFile, pilotInvite};
}

// Each connector incarnation publishes its exact HTTPS origin atomically. Read
// the operator-owned file asynchronously. A missing or invalid file closes the gate.
export function pilotAccess(config, limiter) {
  const inviteHash = digest(config.pilotInvite);
  const signingKey = randomBytes(32);
  const sign = (origin, data) => createHmac('sha256', signingKey).update(origin + '\n' + data).digest('base64url');
  return {
    async inspect(req, sensitive) {
      const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (ip !== '127.0.0.1' && ip !== '::1') return {denied: [403, 'Unapproved connector.']};
      let origin = config.publicOrigin;
      if (config.publicOriginFile) {
        try { origin = httpsOrigin((await readFile(config.publicOriginFile, 'utf8')).trim()); }
        catch { origin = null; }
      }
      if (!origin) return {denied: [503, 'Pilot connector is starting.']};
      const headers = req.headers;
      if ('https://' + headers.host !== origin || headers['x-forwarded-proto'] !== 'https') {
        return {denied: [403, 'Unapproved HTTPS address.']};
      }
      if ((sensitive || headers.origin) && headers.origin !== origin ||
          sensitive && headers['sec-fetch-site'] === 'cross-site') {
        return {denied: [403, 'Origin must match the pilot address.']};
      }
      // Only Cloudflare's single stamped address affects a rate bucket. Other
      // connectors share a bounded bucket. Neither value grants access.
      const cfIP = headers['cf-connecting-ip'];
      if (sensitive && !limiter.allow(typeof cfIP === 'string' && isIP(cfIP) ? cfIP : ip)) {
        return {denied: [429, 'Too many connection attempts. Wait a moment and retry.']};
      }
      const cookie = (headers.cookie || '').split(/;\s*/).find(part => part.startsWith(COOKIE + '='));
      const token = cookie?.slice(COOKIE.length + 1);
      const match = token?.match(/^(\d{10})\.([\w-]{16})\.([\w-]{43})$/);
      const authenticated = !!match && Number(match[1]) > Date.now()/1000 &&
        timingSafeEqual(Buffer.from(match[3]), Buffer.from(sign(origin, match[1] + '.' + match[2])));
      return {origin, authenticated};
    },

    async login(req, res, origin, familyEnabled = false) {
      if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '') || req.headers['content-encoding']) {
        return [415, 'Expected a URL-encoded invite form.'];
      }
      if (Number(req.headers['content-length']) > 256) return [413, 'Invite form too large.'];
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 256) return [413, 'Invite form too large.'];
        chunks.push(chunk);
      }
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      // Clipboard selections commonly include a trailing space or line break.
      // Only trim the edges: the generated code remains exact and case-sensitive.
      const invite = form.get('invite')?.trim();
      const family = familyEnabled && form.get('family') === FAMILY_ROOM_ALIAS;
      if (![...form.keys()].every(k=>['invite','room','family'].includes(k)) ||
          form.getAll('invite').length!==1 || form.getAll('room').length>1 || form.getAll('family').length>1 ||
          !invite || !timingSafeEqual(inviteHash, digest(invite))) {
        showInvite(res, true, form.get('room'), family);
        return;
      }
      const data = Math.floor(Date.now()/1000 + SESSION_SECONDS) + '.' + randomBytes(12).toString('base64url');
      res.setHeader('Set-Cookie', COOKIE + '=' + data + '.' + sign(origin, data) +
        '; Path=/; Max-Age=' + SESSION_SECONDS + '; HttpOnly; Secure; SameSite=Strict');
      redirectLobby(res, form.get('room'), family);
    },
  };
}

export function localMonitor(req, port) {
  return ['GET', 'HEAD'].includes(req.method) && req.url === '/health' &&
    req.headers.host === '127.0.0.1:' + port && req.socket.remoteAddress === '127.0.0.1' &&
    !Object.keys(req.headers).some(name => /^(forwarded$|x-forwarded-|cf-|x-real-ip$|x-client-ip$)/.test(name));
}

const safeRoom=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(value)?value:'';
export function redirectLobby(res, room, family = false) {
  const destination = family ? '&family=' + FAMILY_ROOM_ALIAS : safeRoom(room) ? '&room=' + safeRoom(room) : '';
  res.writeHead(303, {Location: publicLobby + destination});
  res.end();
}

export function showInvite(res, wrong = false, room, family = false) {
  const nonce = randomBytes(16).toString('base64');
  const destination = family ? '<input type="hidden" name="family" value="' + FAMILY_ROOM_ALIAS + '">' :
    safeRoom(room) ? '<input type="hidden" name="room" value="' + safeRoom(room) + '">' : '';
  res.writeHead(wrong ? 403 : 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cartridge-Strike 2 · Internetpilot</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:#161b1b;color:#edf2e8;font:1rem system-ui}
main{width:min(100%,26rem);padding:2rem}h1{font-size:2rem}input,button{width:100%;padding:.8rem;font:inherit;margin-top:.5rem}
input{color:inherit;background:#232c2c;border:1px solid #94a6a0}button{background:#efbf64;color:#161b1b;border:0;font-weight:bold;cursor:pointer}
.show-code{display:flex;align-items:center;gap:.5rem;margin-top:.75rem}.show-code input{width:auto;margin:0}small{display:block;margin-top:.75rem}
</style><main><h1>${family ? FAMILY_ROOM_ALIAS : 'Cartridge-Strike 2'}</h1><p>Öppna ${family ? 'familjerummet' : 'Floor 5'} med inbjudningskoden från serverns ägare.</p>
${wrong ? '<p role="alert">Fel inbjudningskod. Försök igen.</p>' : ''}<form method="post" action="/pilot/session">
${destination}<label>Inbjudningskod<input id="pilot-invite" type="password" name="invite" maxlength="160" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" aria-describedby="invite-help" required></label>
<label class="show-code"><input id="show-invite" type="checkbox">Visa kod</label>
<small id="invite-help">${family ? 'Ange serverns inbjudningskod här. Familjerummets lösenord anges i nästa steg.' : 'Klistra in enbart inbjudningskoden. Din privata rumskod väljer du i nästa steg.'}</small>
<button type="submit">Öppna lobbyn</button></form></main>
<script nonce="${nonce}">document.getElementById('show-invite').addEventListener('change',event=>{document.getElementById('pilot-invite').type=event.target.checked?'text':'password';});</script></html>`);
}

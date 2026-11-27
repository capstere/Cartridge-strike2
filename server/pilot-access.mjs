import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {isIP} from 'node:net';
import {accessText as en} from '../shared/multiplayer/access-english.mjs';
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
      return {origin, authenticated, session:authenticated?digest(token).toString('hex'):null};
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
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cartridge-Strike 3 · Private multiplayer</title><style>
*{box-sizing:border-box}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:clamp(16px,4vw,40px);
  background:linear-gradient(125deg,#10181d,#202f33 58%,#182023);color:#edf2ee;font:1rem/1.45 system-ui,sans-serif}
main{width:min(100%,28rem);padding:clamp(20px,5vw,38px);background:#122026;border:1px solid #56696d;border-top:4px solid #e7b560}
h1{margin:0 0 .4em;font-size:clamp(1.8rem,7vw,2.6rem);line-height:1.08;letter-spacing:-.03em}
p{margin:0 0 1.25rem;color:#cedad9}label{display:block;font-weight:600}
input,button{width:100%;min-height:44px;padding:.7rem .85rem;font:inherit;border-radius:3px}
input{margin:.35rem 0;color:#fff;background:#0d181c;border:1px solid #8b9ea0}
button{margin-top:1.15rem;background:#f0bf67;color:#192127;border:1px solid #f7ce89;font-weight:750;cursor:pointer}
:is(input,button):focus-visible{outline:3px solid #a5e4fa;outline-offset:3px}
.show-code{display:flex;align-items:center;gap:.6rem;min-height:44px;font-weight:400}.show-code input{width:1.15rem;height:1.15rem;min-height:0}
small{display:block;color:#bdcccb}p[role=alert]{padding:.65rem .8rem;border-left:3px solid #f0bf67;background:#302c22;color:#ffdfaa}
</style><main aria-labelledby="entry-title"><h1 id="entry-title">${family ? FAMILY_ROOM_ALIAS : en.gameTitle}</h1><p>${en.pilotIntro}</p>
${wrong ? `<p role="alert">${en.wrongInvite}</p>` : ''}<form method="post" action="/pilot/session">
${destination}<label>${en.inviteLabel}<input id="pilot-invite" type="password" name="invite" maxlength="160" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" aria-describedby="invite-help" required></label>
<label class="show-code"><input id="show-invite" type="checkbox">${en.showInvite}</label>
<small id="invite-help">${family ? en.familyInviteHelp : en.pilotInviteHelp}</small>
<button type="submit">${en.enterLobby}</button></form></main>
<script nonce="${nonce}">document.getElementById('show-invite').addEventListener('change',event=>{document.getElementById('pilot-invite').type=event.target.checked?'text':'password';});</script></html>`);
}

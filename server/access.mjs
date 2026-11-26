import {networkMap} from '../shared/multiplayer/maps.mjs';
import {isIP} from 'node:net';
import {pilotConfig} from './pilot-access.mjs';
import {familyRoomConfig} from './family-room.mjs';
import {matchPreferenceKeys,matchPreferences} from './match-preferences.mjs';

export function privateIPv4(address) {
  if(isIP(address)!==4)return false;
  const [a,b]=address.split('.').map(Number);
  return a===10 || a===172&&b>=16&&b<=31 || a===192&&b===168;
}
const loopback=ip=>ip==='::1'||ip==='127.0.0.1';
export function hostingConfig({lan=false,host,port=2567,publicOrigin,publicOriginFile,pilotInvite,familyPassword,familyStateFile}={}) {
  if(typeof lan!=='boolean')throw Error('LAN must be explicitly enabled.');
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT must be an integer between 0 and 65535.');
  host??='127.0.0.1';
  if(lan?!privateIPv4(host):host!=='127.0.0.1')throw Error(lan?
    'CS2_LAN_HOST must be the Pi\'s private IPv4 address (10.x, 172.16–31.x or 192.168.x); wildcard/public binds are disabled.':
    'Local mode binds only 127.0.0.1. Set CS2_LAN=1 and CS2_LAN_HOST explicitly to enable LAN.');
  return {lan,host,port,...pilotConfig({lan,publicOrigin,publicOriginFile,pilotInvite}),
    ...familyRoomConfig({familyPassword,familyStateFile,pilotInvite})};
}
export function configFromEnv(env) {
  if(env.CS2_LAN!==undefined&&!['0','1'].includes(env.CS2_LAN))throw Error('CS2_LAN must be 0 or 1.');
  if(env.PORT!==undefined&&(!/^\d+$/.test(env.PORT)||Number(env.PORT)<1))throw Error('PORT must be between 1 and 65535.');
  return hostingConfig({publicOrigin:env.CS2_PUBLIC_ORIGIN,publicOriginFile:env.CS2_PUBLIC_ORIGIN_FILE,pilotInvite:env.CS2_PILOT_INVITE,
    familyPassword:env.CS2_FAMILY_ROOM_PASSWORD,familyStateFile:env.CS2_FAMILY_ROOM_STATE,
    lan:env.CS2_LAN==='1',host:env.CS2_LAN_HOST||undefined,port:env.PORT===undefined?2567:Number(env.PORT)});
}

// Bounded per-peer and aggregate admission buckets. Asset loading does not spend
// the matchmaking budget. Never trust forwarded IPs on this direct LAN server.
export function admissionLimiter({now=()=>performance.now()}={}) {
  const peers=new Map(),global={tokens:60,at:now()};
  const refill=(bucket,capacity,rate,t)=>{bucket.tokens=Math.min(capacity,bucket.tokens+(t-bucket.at)*rate/1000);bucket.at=t;};
  return {peers,allow(ip){
    const t=now();for(const [key,b] of peers)if(t-b.at>60000)peers.delete(key);
    if(!peers.has(ip)){if(peers.size>=256)return false;peers.set(ip,{tokens:30,at:t});}
    const peer=peers.get(ip);refill(global,60,2,t);refill(peer,30,1,t);
    if(global.tokens<1||peer.tokens<1)return false;
    global.tokens--;peer.tokens--;return true;
  }};
}
export function accessPolicy(config,port) {
  const authorities=new Set((config.lan?[config.host]:['127.0.0.1','localhost']).map(host=>new URL(`http://${host}:${port}`).host));
  const limiter=admissionLimiter();
  return {limiter,check({headers,remoteAddress},sensitive=false){
    const get=key=>headers instanceof Headers?headers.get(key):headers[key];
    const ip=(remoteAddress||'').replace(/^::ffff:/,'');
    if(!(loopback(ip)||config.lan&&privateIPv4(ip)))return [403,'Only local-network peers are allowed.'];
    const host=get('host');
    if(!authorities.has(host))return [403,'Unapproved Host. Open the exact server address.'];
    if(get('x-real-ip')||get('x-client-ip')||get('forwarded')||get('x-forwarded-for')||get('x-forwarded-host')||get('x-forwarded-proto'))return [403,'Forwarded requests are disabled.'];
    const origin=get('origin');
    if((sensitive&&!origin)||origin&&origin!==`http://${host}`||get('sec-fetch-site')==='cross-site')return [403,'Origin must match the server address.'];
    if(sensitive&&!limiter.allow(ip))return [429,'Too many connection attempts. Wait a moment and retry.'];
    return null;
  }};
}

export function rejectHttp(res,status,error) {
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...(status===429?{'Retry-After':'2'}:{}),'Connection':'close'});
  res.end(JSON.stringify({code:status,error}));
}

// Read before Colyseus' router: its Express callback is AFTER matchmaking and
// cannot protect that route. Count actual bytes, including chunked requests.
export async function readAdmission(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['content-encoding'])throw Object.assign(Error('Expected an uncompressed JSON request.'),{status:415});
  if(Number(req.headers['content-length'])>4096)throw Object.assign(Error('Request too large.'),{status:413});
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>4096)throw Object.assign(Error('Request too large.'),{status:413});chunks.push(chunk);}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Malformed JSON.'),{status:400});}
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['name','code','contract','team','fillBots','mapId','mode','zombies','danceman',...matchPreferenceKeys].includes(k))||
    !matchPreferences(body)||['zombies','danceman'].some(key=>body[key]!==undefined&&typeof body[key]!=='boolean')||
    (body.mapId!==undefined&&!networkMap(body.mapId))||
    (body.mode!==undefined&&!['tdm','classic'].includes(body.mode))||
    (body.team!==undefined&&!['auto','analysts','counterAnalysts'].includes(body.team))||
    typeof body.name!=='string'||body.name.length>96||typeof body.code!=='string'||body.code.length>64||
    !body.contract||Array.isArray(body.contract)||typeof body.contract!=='object')throw Object.assign(Error('Invalid room options.'),{status:400});
  return body;
}

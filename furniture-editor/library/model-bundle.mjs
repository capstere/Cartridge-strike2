/** Offline, bounded ZIP reader for user-selected GLB packs. Never fetches or publishes assets. */
import {crc32} from './zip.mjs?v=5.7.2';
import {GLB_MAX_BYTES} from './glb-utils.mjs';
export const MODEL_PACK_MAX_FILES = 20;
export const MODEL_PACK_MAX_BYTES = 96 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', {fatal:true});
const u16 = (v,p) => v.getUint16(p,true), u32 = (v,p) => v.getUint32(p,true);

async function inflateRaw(compressed, expected) {
 if(typeof DecompressionStream !== 'function') throw Error('Webbläsaren kan inte packa upp denna ZIP. Packa upp filerna och välj alla .glb direkt.');
 let stream;
 try {stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}
 catch {throw Error('ZIP-komprimeringen stöds inte. Packa upp filerna och importera .glb direkt.');}
 const reader=stream.getReader(),chunks=[];let length=0;
 try {
  while(true) {
   const {done,value}=await reader.read();if(done)break;
   length+=value.length;
   if(length>expected || length>GLB_MAX_BYTES)throw Error('ZIP innehåller en fil som packas upp till för mycket data.');
   chunks.push(value);
  }
 } catch(e) {await reader.cancel().catch(()=>{});throw e;}
 if(length!==expected)throw Error('ZIP innehåller felaktig filstorlek.');
 const result=new Uint8Array(length);let i=0;
 for(const chunk of chunks) {result.set(chunk,i);i+=chunk.length;}
 return result;
}
function safePath(name) {
 if(!name || name.length>250 || name.startsWith('/') || name.includes('\\') ||
    name.split('/').some(s=>s==='..'||s==='.') || /[\u0000-\u001f\u007f]/.test(name) ||
    /^[A-Za-z]:/.test(name))throw Error('ZIP innehåller ett osäkert filnamn.');
 return name;
}
/** Accepts ordinary Windows/macOS ZIPs with store (0) or deflate (8) members.
 * Returns only vetted GLB bytes; descriptions, scripts and other files are ignored.
 */
export async function readModelBundleZip(input) {
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength<22||bytes.byteLength>MODEL_PACK_MAX_BYTES)throw Error('ZIP-paketet är ogiltigt eller för stort (max 96 MB).');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
  if(u32(v,i)===0x06054b50 && i+22+u16(v,i+20)===bytes.length) {end=i;break;}
 }
 if(end<0)throw Error('Kan inte läsa ZIP-paketets filförteckning.');
 const entries=u16(v,end+10),directorySize=u32(v,end+12),directoryAt=u32(v,end+16);
 if(u16(v,end+4)||u16(v,end+6)||u16(v,end+8)!==entries||
    entries===0||entries>200||entries===65535||
    directoryAt===0xffffffff||directorySize===0xffffffff||
    directoryAt+directorySize>end)throw Error('ZIP-formatet eller antalet filer stöds inte.');
 const result=[],rejected=[],seen=new Set();let offset=directoryAt,total=0,glbCount=0;
 for(let i=0;i<entries;i++) {
  if(offset+46>directoryAt+directorySize||u32(v,offset)!==0x02014b50)throw Error('Felaktig ZIP-filförteckning.');
  const flags=u16(v,offset+8),method=u16(v,offset+10),crc=u32(v,offset+16);
  const packed=u32(v,offset+20),size=u32(v,offset+24);
  const n=u16(v,offset+28),extra=u16(v,offset+30),comment=u16(v,offset+32),localAt=u32(v,offset+42);
  const endEntry=offset+46+n+extra+comment;
  if(endEntry>directoryAt+directorySize||packed===0xffffffff||size===0xffffffff||localAt===0xffffffff)throw Error('ZIP64 eller trasig ZIP stöds inte.');
  const name=safePath(utf8.decode(bytes.subarray(offset+46,offset+46+n)));offset=endEntry;
  if(!/\.glb$/i.test(name))continue;
  glbCount++;
  if(glbCount>MODEL_PACK_MAX_FILES)throw Error('Paketet innehåller fler än 20 GLB-filer. Dela upp det i två paket.');
  const basename=name.split('/').at(-1);
  if(seen.has(basename.toLowerCase())) {rejected.push(basename+': dubbelt filnamn');continue;}
  seen.add(basename.toLowerCase());
  if(flags&1 || ![0,8].includes(method)) {rejected.push(basename+': låst eller okänd komprimering');continue;}
  if(size<28||size>GLB_MAX_BYTES) {rejected.push(basename+': måste vara högst 8 MB');continue;}
  if(size+total>MODEL_PACK_MAX_BYTES)throw Error('ZIP-paketets modeller är för stora tillsammans.');
  if(localAt+30>directoryAt||u32(v,localAt)!==0x04034b50)throw Error('Felaktigt ZIP-innehåll.');
  const localNameSize=u16(v,localAt+26),localExtraSize=u16(v,localAt+28);
  const dataAt=localAt+30+localNameSize+localExtraSize;
  if(dataAt+packed>directoryAt || u16(v,localAt+8)!==method ||
     utf8.decode(bytes.subarray(localAt+30,localAt+30+localNameSize))!==name)throw Error('ZIP-data matchar inte filförteckningen.');
  const compressed=bytes.subarray(dataAt,dataAt+packed);
  if(method===0 && packed!==size)throw Error('Felaktig storlek i ZIP-paket.');
  const contents=method===0?compressed.slice():await inflateRaw(compressed,size);
  if(contents.length!==size || crc32(contents)!==crc)throw Error(basename+': ZIP-filens kontrollsumma stämmer inte.');
  total+=size;result.push({name:basename,bytes:contents});
 }
 if(offset!==directoryAt+directorySize)throw Error('ZIP-paketets filförteckning är felaktig.');
 if(glbCount===0)throw Error('ZIP-paketet innehåller inga .glb-filer.');
 return {files:result,rejected};
}

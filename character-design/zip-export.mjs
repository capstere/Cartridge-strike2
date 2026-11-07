/** Small store-only ZIP writer. No remote service, compression dependency or workflow artifacts. */
const encoder=new TextEncoder();
const CRC_TABLE=Array.from({length:256},(_,i)=>{let x=i;for(let k=0;k<8;k++)x=(x>>>1)^((x&1)?0xedb88320:0);return x>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const x of bytes)n=CRC_TABLE[(n^x)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
const u16=(d,o,n)=>d.setUint16(o,n,true),u32=(d,o,n)=>d.setUint32(o,n>>>0,true);
const goodName=s=>/^[a-zA-Z0-9_-]{1,80}(?:\.[a-zA-Z0-9]{1,8})?$/.test(s)&&!s.startsWith('.');
export function packZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>64)throw Error('Felaktigt antal paketfiler.');
 const locals=[],central=[];let offset=0,bytesTotal=0;
 const names=new Set();
 for(const {name,data} of entries){
  if(!goodName(name)||names.has(name))throw Error('Ogiltigt eller duplicerat filnamn: '+name);
  names.add(name);
  const bytes=typeof data==='string'?encoder.encode(data):data instanceof Uint8Array?data:data instanceof ArrayBuffer?new Uint8Array(data):null;
  if(!bytes)throw Error('Ogiltigt innehåll i paketet.');
  bytesTotal+=bytes.byteLength;if(bytesTotal>96*1024*1024)throw Error('Paketet får inte vara större än 96 MB.');
  const file=encoder.encode(name),crc=crc32(bytes);
  const local=new Uint8Array(30+file.length+bytes.length),v=new DataView(local.buffer);
  u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0);
  u32(v,14,crc);u32(v,18,bytes.length);u32(v,22,bytes.length);u16(v,26,file.length);
  local.set(file,30);local.set(bytes,30+file.length);
  const record=new Uint8Array(46+file.length),d=new DataView(record.buffer);
  u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x0800);u16(d,10,0);
  u32(d,16,crc);u32(d,20,bytes.length);u32(d,24,bytes.length);u16(d,28,file.length);u32(d,42,offset);
  record.set(file,46);
  locals.push(local);central.push(record);offset+=local.length;
 }
 const directoryAt=offset,size=central.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),d=new DataView(end.buffer);
 u32(d,0,0x06054b50);u16(d,8,entries.length);u16(d,10,entries.length);u32(d,12,size);u32(d,16,directoryAt);
 const buffer=new Uint8Array(offset+size+end.length);let pos=0;
 for(const part of [...locals,...central,end]){buffer.set(part,pos);pos+=part.length;}
 return buffer;
}
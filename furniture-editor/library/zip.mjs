/** Tiny ZIP store-only codec for self-contained furniture projects. No dependencies. */
const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true});
// Local ZIP exports may contain many opt-in models; never include unused imported models.
export const PROJECT_ZIP_MAX_BYTES=96*1024*1024;
export const PROJECT_ZIP_MAX_FILES=260;
const TABLE=Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=(n&1)?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const c of bytes)n=TABLE[(n^c)&255]^(n>>>8);return(n^0xffffffff)>>>0;}
const U16=(d,p,v)=>d.setUint16(p,v,true),U32=(d,p,v)=>d.setUint32(p,v,true);
function validateName(name){if(['projekt.json','project.json','RECOVERY.json','AGENT_BRIEF.md','COLLISION_MAP.json','preview/plan.png','preview/view3d.png'].includes(name)||
 /^((assets\/)?models\/[a-f0-9]{64}\.glb|assets\/posters\/[A-Za-z0-9_-]{1,64}\.webp)$/.test(name))return name;
 throw Error('Ogiltigt filnamn i projektpaket.');}
export function makeZip(entries){if(!entries.length||entries.length>PROJECT_ZIP_MAX_FILES||new Set(entries.map(e=>e.name)).size!==entries.length)throw Error('För många eller duplicerade projektfiler.');const locals=[],central=[];let offset=0,total=0;
 for(const {name,data} of entries){validateName(name);const bytes=data instanceof Uint8Array?data:te.encode(data);const filename=te.encode(name);total+=bytes.length;if(total>PROJECT_ZIP_MAX_BYTES)throw Error('Projektet överstiger 96 MiB.');const crc=crc32(bytes);
 const local=new Uint8Array(30+filename.length+bytes.length),a=new DataView(local.buffer);U32(a,0,0x04034b50);U16(a,4,20);U16(a,6,0x0800);U16(a,8,0);U32(a,14,crc);U32(a,18,bytes.length);U32(a,22,bytes.length);U16(a,26,filename.length);local.set(filename,30);local.set(bytes,30+filename.length);locals.push(local);
 const cent=new Uint8Array(46+filename.length),b=new DataView(cent.buffer);U32(b,0,0x02014b50);U16(b,4,20);U16(b,6,20);U16(b,8,0x0800);U16(b,10,0);U32(b,16,crc);U32(b,20,bytes.length);U32(b,24,bytes.length);U16(b,28,filename.length);U32(b,42,offset);cent.set(filename,46);central.push(cent);offset+=local.length;
 }
 const centralOffset=offset,centralSize=central.reduce((s,b)=>s+b.length,0),tail=new Uint8Array(22),v=new DataView(tail.buffer);
 U32(v,0,0x06054b50);U16(v,8,entries.length);U16(v,10,entries.length);U32(v,12,centralSize);U32(v,16,centralOffset);
 const out=new Uint8Array(offset+centralSize+22);let p=0;for(const b of [...locals,...central,tail]){out.set(b,p);p+=b.length;}return out;
}
export function readZip(buffer){const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);if(bytes.length>PROJECT_ZIP_MAX_BYTES)throw Error('Projektpaketet är för stort.');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map(),locals=[];let offset=0,total=0;
 while(offset+4<=bytes.length){const sig=v.getUint32(offset,true);if(sig===0x02014b50)break;if(sig!==0x04034b50||offset+30>bytes.length)throw Error('Ogiltigt ZIP-paket.');
  const flags=v.getUint16(offset+6,true),method=v.getUint16(offset+8,true),crc=v.getUint32(offset+14,true),compressed=v.getUint32(offset+18,true),size=v.getUint32(offset+22,true),nameSize=v.getUint16(offset+26,true),extraSize=v.getUint16(offset+28,true);
  if(method!==0||(flags&~0x0800)||size!==compressed||nameSize>140||!nameSize||extraSize)throw Error('Projektpaketet innehåller ett format som inte stöds.');
  const start=offset+30,name=td.decode(bytes.subarray(start,start+nameSize));validateName(name);if(files.has(name))throw Error('Duplicerat filnamn i projektpaket.');const pos=start+nameSize+extraSize;
  if(pos+size>bytes.length)throw Error('Avbrutet projektpaket.');const content=bytes.slice(pos,pos+size);
  if(crc32(content)!==crc)throw Error('Filen skadades när den sparades.');files.set(name,content);locals.push({name,offset,crc,size});total+=size;if(total>PROJECT_ZIP_MAX_BYTES||files.size>PROJECT_ZIP_MAX_FILES)throw Error('Projektpaketet innehåller för mycket data.');offset=pos+size;
 }
 const directoryStart=offset;for(const local of locals){if(offset+46>bytes.length||v.getUint32(offset,true)!==0x02014b50)throw Error('ZIP-katalogen saknas eller har ändrats.');
  const length=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true);
  if(extra||comment||length>140||offset+46+length>bytes.length||td.decode(bytes.subarray(offset+46,offset+46+length))!==local.name||
   v.getUint32(offset+16,true)!==local.crc||v.getUint32(offset+20,true)!==local.size||v.getUint32(offset+24,true)!==local.size||v.getUint32(offset+42,true)!==local.offset)
   throw Error('ZIP-katalogen stämmer inte med filerna.');
  offset+=46+length;
 }
 if(offset+22!==bytes.length||v.getUint32(offset,true)!==0x06054b50||v.getUint16(offset+8,true)!==locals.length||
  v.getUint16(offset+10,true)!==locals.length||v.getUint32(offset+12,true)!==offset-directoryStart||v.getUint32(offset+16,true)!==directoryStart||v.getUint16(offset+20,true)!==0)
  throw Error('ZIP-katalogens slut är ogiltigt.');
 if(files.has('projekt.json')===files.has('project.json'))throw Error('Projektpaketet måste ha exakt en projektfil.');return files;
}

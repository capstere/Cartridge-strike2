/** Read only the studio's bounded, store-only flat character ZIP format. */
import {crc32} from './zip-export.mjs';
import {validateActorContract,inspectActorGLB,actorHash} from '../src/fps/character-runtime-contract.mjs?v=6.1.2';
const allowed=new Set(['CHARACTER.glb','CHARACTER.json','PROJECT.json','BASE_RIG.glb','COMPATIBILITY.json','README.txt']);
export async function readRuntimePackage(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input),d=new DataView(b.buffer,b.byteOffset,b.length),text=new TextDecoder('utf-8',{fatal:true}),files=new Map(),records=[];
 if(b.length<22||b.length>96*1024*1024)throw Error('Karaktärspaketet är för stort eller avbrutet.');let at=0;
 while(at+4<=b.length&&d.getUint32(at,true)===0x04034b50){
  if(at+30>b.length)throw Error('Avbruten ZIP.');const flag=d.getUint16(at+6,true),method=d.getUint16(at+8,true),crc=d.getUint32(at+14,true),size=d.getUint32(at+18,true),unpacked=d.getUint32(at+22,true),n=d.getUint16(at+26,true),extra=d.getUint16(at+28,true),start=at+30+n;
  if(flag!==0x800||method!==0||size!==unpacked||extra||n>80||!n||start+size>b.length)throw Error('Exportera paketet direkt från Character Design Studio.');
  const name=text.decode(b.subarray(at+30,start));if(!allowed.has(name)||files.has(name))throw Error('Okänd eller duplicerad paketfil.');
  const data=b.slice(start,start+size);if(crc32(data)!==crc)throw Error('Paketets kontrollsumma stämmer inte.');files.set(name,data);records.push({name,at,crc,size});at=start+size;
 }
 const directory=at;
 for(const row of records){
  if(at+46>b.length||d.getUint32(at,true)!==0x02014b50)throw Error('ZIP-katalog saknas.');const n=d.getUint16(at+28,true);
  if(n>80||at+46+n>b.length||d.getUint16(at+30,true)||d.getUint16(at+32,true)||text.decode(b.subarray(at+46,at+46+n))!==row.name||d.getUint32(at+16,true)!==row.crc||d.getUint32(at+20,true)!==row.size||d.getUint32(at+24,true)!==row.size||d.getUint32(at+42,true)!==row.at)throw Error('Ändrad ZIP-katalog.');at+=46+n;
 }
 if(at+22!==b.length||d.getUint32(at,true)!==0x06054b50||d.getUint16(at+4,true)||d.getUint16(at+6,true)||d.getUint16(at+8,true)!==records.length||d.getUint16(at+10,true)!==records.length||d.getUint32(at+12,true)!==at-directory||d.getUint32(at+16,true)!==directory||d.getUint16(at+20,true))throw Error('Ogiltigt ZIP-slut.');
 for(const name of ['CHARACTER.glb','CHARACTER.json','PROJECT.json','BASE_RIG.glb'])if(!files.has(name))throw Error('Paketfil saknas: '+name);
 if(files.get('CHARACTER.json').length>65536)throw Error('För stort karaktärskontrakt.');
 const contract=validateActorContract(JSON.parse(text.decode(files.get('CHARACTER.json')))),bytes=files.get('CHARACTER.glb');
 if(bytes.length!==contract.bytes||await actorHash(bytes)!==contract.sha256)throw Error('Karaktärens identitet stämmer inte.');inspectActorGLB(bytes);inspectActorGLB(files.get('BASE_RIG.glb'));
 return {contract,bytes,files};
}

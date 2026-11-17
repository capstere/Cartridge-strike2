// Test-only, reliable ordered WebSocket proxy. Delays actual binary transport
// messages in BOTH directions; no fake snapshot dropping or packet-loss claim.
import http from 'node:http';
import {WebSocket,WebSocketServer} from '../server/node_modules/ws/wrapper.mjs';
import {orderedDelay} from './network-delay.mjs';
export async function latencyProxy(target,{oneWayMs=50,jitterMs=20}={}){
 const origin=new URL(target),queues=new Set(),sockets=new Set();let seed=42;
 const metrics={upBytes:0,downBytes:0,messages:0,delays:[],deliveredDelays:[]};
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const server=http.createServer((req,res)=>{
  const upstream=http.request({hostname:origin.hostname,port:origin.port,path:req.url,method:req.method,headers:{...req.headers,host:origin.host}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
  upstream.on('error',()=>{res.statusCode=502;res.end();});req.pipe(upstream);
 });
 const wss=new WebSocketServer({noServer:true});
 server.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,down=>{
  const up=new WebSocket(`ws://${origin.host}${req.url}`);sockets.add(up);sockets.add(down);
  let buffered=[];
  const relay=(src,dst,key)=>{
   let last=0;
   const queue=orderedDelay(({bytes,binary,receivedAt})=>{
    if(dst.readyState===WebSocket.OPEN){
     if(metrics.deliveredDelays.length<4096)metrics.deliveredDelays.push(performance.now()-receivedAt);
     dst.send(bytes,{binary});
    }
   });
   queues.add(queue);src.once('close',()=>{queue.close();queues.delete(queue);});
   return (bytes,binary)=>{
    metrics[key]+=bytes.length;metrics.messages++;
    const now=performance.now(),at=Math.max(last+1,now+oneWayMs+(random()*2-1)*jitterMs);last=at;
    if(metrics.delays.length<4096)metrics.delays.push(at-now);
    queue.push({bytes,binary,receivedAt:now},at-now);
   };
  };
  const upward=relay(down,up,'upBytes');down.on('message',(b,isBinary)=>{if(up.readyState===WebSocket.OPEN)upward(b,isBinary);else buffered.push([b,isBinary]);});
  up.on('open',()=>{for(const args of buffered)upward(...args);buffered=[];});
  up.on('message',relay(up,down,'downBytes'));
  for(const [s,other] of [[up,down],[down,up]]){s.on('error',()=>other.close());s.on('close',()=>{sockets.delete(s);other.close();});}
 }));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}`,metrics,close:async()=>{
  for(const queue of queues)queue.close();queues.clear();for(const s of sockets)s.terminate();sockets.clear();
  await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));
 }};
}

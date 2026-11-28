// Isolated benchmark preload for the CS2/CS3 control experiment. All observations
// stay in the SDK client or server process. No extra bytes are sent over the socket.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

function insert(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw Error('Unexpected source at ' + marker);
  return source.replace(marker, replacement);
}

const clock = 'Number(process.hrtime.bigint()) / 1e6';
registerHooks({load(url, context, nextLoad) {
  const room = url.endsWith('/server/network-room.mjs');
  const sampler = url.endsWith('/tools/network-load-server.mjs');
  const client = url.endsWith('/tools/network-load.mjs');
  if (!room && !sampler && !client) return nextLoad(url, context);
  let source = readFileSync(fileURLToPath(url), 'utf8');
  if (room) {
    const before = source.includes('shot=latest;');
    const global = `
      const perfBatches = new Map();
      const perfFlushing = [];
      globalThis.cs3PerfShots = [];
      function perfObserve(seat, frame, batch) {
        const id = [seat.id, seat.actor.lifeId, seat.epoch, frame.fireId].join(':');
        const edge = !seat.trigger || !!frame.fireEdge;
        const data = {id, yaw: frame.fireEdge ? frame.shotYaw : frame.yaw,
          pitch: frame.fireEdge ? frame.shotPitch : frame.pitch, edge, at: ${clock}};
        batch.first ??= data;
        batch.last = data;
        batch.count = (batch.count || 0) + 1;
        batch.hasEdge ||= edge;
        perfBatches.set(id, batch);
      }
    `;
    source = global + source;
    source = insert(source, 'consumed=0;', 'consumed=0; const perfBatch={};');
    if (before) {
      source = insert(source, '))shot=latest;', ')){perfObserve(seat,f,perfBatch);shot=latest;}');
    } else {
      source = insert(source, 'shot ??= {yaw:', 'perfObserve(seat,f,perfBatch);shot ??= {yaw:');
    }
    const enqueue = 'this.metrics.events+=wire.length;';
    source = insert(source, enqueue, `
      for (const event of wire) {
        if(event.type!=='shot' || !perfBatches.has(event.actionId)) continue;
        const batch=perfBatches.get(event.actionId);
        const shot={id:event.actionId,weapon:event.weapon,tick:event.tick,
          first:batch.first,last:batch.last,count:batch.count,hasEdge:!!batch.hasEdge,queuedAt:${clock}};
        globalThis.cs3PerfShots.push(shot);
        perfFlushing.push(shot);
      }
      ${enqueue}`);
    const patch = 'const patched=super.broadcastPatch();';
    source = insert(source, patch, `${patch} if (perfFlushing.length) {
      const flush=${clock};
      for(const shot of perfFlushing)shot.flushedAt=flush;
      perfFlushing.length=0;
    }`);
  } else if (sampler) {
    const marker = "result=snapshot();}\n  else if(action==='drop')";
    const sample = "}else if(action==='sample'){";
    const start = source.indexOf(sample);
    if (start < 0) throw Error('Missing server sample handler');
    source = source.slice(0, start) + insert(source.slice(start), marker,
      "result=snapshot();if(options?.perfFinal)result.perfShots=globalThis.cs3PerfShots;}\n  else if(action==='drop')");
  } else {
    source = insert(source, 'const pending=new Map();', `
      const perfSent=new Map(),perfReceived=new Map();
      let perfStart=Infinity;
      const pending=new Map();`);
    const events = "room.onMessage('events',events=>{p.shots+=";
    source = insert(source, events, `
      room.onMessage('events',events=>{
        for(const e of events) if(e.type==='shot' && e.actorId===own(p)?.id && e.actionId) {
          perfReceived.set(e.actionId,${clock});
        }
        p.shots+=`);
    const send = 'input.send();maxPending=Math.max';
    source = insert(source, send, `
      if(input.data.fire)perfSent.set([a.id,a.lifeId,a.controlEpoch,input.data.fireId].join(':'),${clock});
      ${send}`);
    const start = 'const start=performance.now(),end=';
    source = insert(source, start, `perfStart=${clock};${start}`);
    const measured = "const measured=await rpc('sample');";
    source = insert(source, measured, `
      const measured=await rpc('sample',{perfFinal:true});
      const perfShots=measured.perfShots.map(shot=>({...shot,firstSent:perfSent.get(shot.first.id),
        lastSent:perfSent.get(shot.last.id),actualSent:perfSent.get(shot.id),received:perfReceived.get(shot.id)}));
      delete measured.perfShots;`);
    source = insert(source, "results.push({status:'PASS'", "results.push({perfStart,perfShots,status:'PASS'");
  }
  return {format:'module', shortCircuit:true, source};
}});

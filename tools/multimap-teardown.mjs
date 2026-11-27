// Test runner only. Start before importing the pilot and its transport so an
// event-loop leak can be traced even after the browser and TLS fixtures close.
import {createHook} from 'node:async_hooks';

const tracked = new Set(['Timeout','Immediate','TCPWRAP','TCPSERVERWRAP','PIPEWRAP',
  'PROCESSWRAP','MESSAGEPORT','FSEVENTWRAP','STATWATCHER','UDPWRAP','SIGNALWRAP','TTYWRAP']);
const live = new Map();
const creation = createHook({
  init(id,type,trigger,resource) {
    if (!tracked.has(type)) return;
    const stack = new Error().stack.split('\n').slice(2).map(line=>line.trim().replaceAll(process.cwd()+'/', ''));
    live.set(id,{type,trigger,resource:new WeakRef(resource),stack});
  },
  destroy(id) { live.delete(id); }
});
creation.enable();

function inspect() {
  const handles = [];
  for (const entry of live.values()) {
    const resource = entry.resource.deref();
    if (!resource || resource._destroyed || !resource.hasRef?.()) continue;
    handles.push({type:entry.type, intervalMs:resource._repeat || undefined,
      delayMs:resource._idleTimeout || undefined, stack:entry.stack});
  }
  return {activeResources:process.getActiveResourcesInfo(), liveReferenced:handles};
}

// An unreferenced deadline observes the loop without keeping it alive. Only
// Node's own beforeExit event establishes successful cleanup.
export function verifyMapProcessExit(onReport, deadlineMs=3000) {
  const started = performance.now();
  function finish(naturalExit) {
    clearTimeout(deadline);
    creation.disable();
    onReport({naturalExit, elapsedMs:Math.round(performance.now()-started), ...inspect()});
  }
  function drained() { finish(true); }
  const deadline = setTimeout(()=>{
    process.off('beforeExit', drained);
    finish(false);
    // A failed cleanup assertion has already been recorded. Bound a genuinely
    // leaked test process so CI keeps its report and can run the next job.
    process.exit(1);
  }, deadlineMs).unref();
  process.once('beforeExit', drained);
}

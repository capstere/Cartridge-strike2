// Observe the two normal game instances; playback still runs through the installed
// audio class, the room session and real AudioBufferSourceNodes.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

async function observeVoices(page) {
  await page.evaluate(async () => {
    const {AudioSystem} = await import('/src/fps/riposte-audio.mjs');
    const proto = AudioSystem.prototype;
    const play = proto.play, track = proto.track, update = proto.updateListener;
    const probe = window.roomAudioProbe = {voices:[]};
    proto.updateListener = function(listener) {
      probe.system = this;
      return update.call(this,listener);
    };
    proto.play = function(event) {
      probe.event = event;
      try { return play.call(this,event); }
      finally { probe.event = null; }
    };
    proto.track = function(source, channel, duration, offset) {
      const event = probe.event;
      const take = event?.type === 'shot' && [...this.reuseBuffers].find(([,buffer]) => buffer === source.buffer)?.[0];
      const now = this.context.currentTime;
      const result = track.call(this,source,channel,duration,offset);
      if (take && event.weapon === 'p9' && event.actionId) {
        const distance = Math.hypot(event.x-this.listener.x,event.y-this.listener.y,event.z-this.listener.z);
        const row = {id:event.actionId,actor:event.actorId,take,distance,delay:channel.when-now,
          predicted:!!event.predicted,tick:event.tick??null,contextTime:now,scheduled:channel.when,
          eventTime:event.time,dispatch:performance.now(),frame:null};
        probe.voices.push(row);
        requestAnimationFrame(() => { row.frame = performance.now(); });
      }
      return result;
    };
    probe.restore = () => {
      proto.play = play; delete proto.track; delete proto.updateListener;
      delete window.roomAudioProbe;
    };
  });
  await page.waitForFunction(() => {
    const audio = window.roomAudioProbe.system;
    return audio?.context?.state === 'running' && audio.volume > 0 &&
      ['armes/g_glock_pov-1.mp3','armes/g_glock_near-1.mp3','armes/g_far_pistol-1.mp3']
        .every(take=>audio.reuseBuffers.has(take));
  });
}

export async function verifyRoomAudio({desktop,mobile,room,host,guest,until}) {
  const game = room.sim.game;
  const botFire = game.config.botFire;
  game.config.botFire = false;
  const peers = [desktop,mobile];
  try {
    await Promise.all(peers.map(observeVoices));
    await until(() => host.alive && guest.alive, 'two living audio observers');
    if (await desktop.locator('#resume').isVisible()) {
      const {resumeDesktop} = await import('./network-browser-resume.mjs');
      await resumeDesktop(desktop);
    }
    await desktop.keyboard.press('2');
    await until(() => host.weapon === 'p9', 'normal pistol selection for acoustic comparison');
    await desktop.waitForFunction(() => reviewSession.view.player.weapon === 'p9');
    const results = [];
    for (const [label,nominal,bank] of [['near',8,'g_glock_near'],['far',48,'g_far_pistol']]) {
      // Park the registered listener on a real walkable Floor 5 node. Neither
      // input, firing, propagation nor audio buffers are synthesized here.
      const nodes = game.world.navigation.nodes;
      const point = nodes.reduce((best,node) => {
        const error = Math.abs(Math.hypot(host.x-node.x,host.z-node.z)-nominal);
        return error < best.error ? {node,error} : best;
      },{error:Infinity});
      assert(point.error < 2, 'map supports the requested observer distance');
      Object.assign(guest,{x:point.node.x,y:point.node.y??0,z:point.node.z});
      await mobile.waitForFunction(({x,z}) => Math.hypot(reviewSession.view.player.x-x,reviewSession.view.player.z-z)<.15,{x:guest.x,z:guest.z});
      const ammo = host.inventory.pistol.ammo;
      await desktop.mouse.down();
      try { await until(() => host.inventory.pistol.ammo === ammo-1, 'one authoritative manual pistol shot'); }
      finally { await desktop.mouse.up(); }
      const seat = [...room.seats.values()].find(s=>s.actor===host);
      const id = [host.id,host.lifeId,seat.epoch,seat.lastFire].join(':');
      await desktop.waitForFunction(id=>reviewSession.confirmedLocalShots?.has(id),id);
      const samples = await Promise.all(peers.map(async page => {
        await page.waitForFunction(id=>roomAudioProbe.voices.some(row=>row.id===id && row.frame!==null),id);
        return page.evaluate(id=>roomAudioProbe.voices.filter(row=>row.id===id),id);
      }));
      for (const rows of samples) assert.equal(rows.length,1,'one started firearm voice for this action per seat');
      const [[own],[remote]] = samples;
      assert.match(own.take,/^armes\/g_glock_pov-[12]\.mp3$/);
      assert(remote.take.startsWith('armes/'+bank+'-'));
      assert(own.predicted && !remote.predicted && Number.isSafeInteger(remote.tick));
      assert(Math.abs(own.delay)<.01);
      assert(Math.abs(remote.delay - remote.distance/343)<.01,'distance to this observer sets the audio clock');
      for (const row of [own,remote]) assert(row.frame>=row.dispatch);
      results.push({label,id,own,remote,ammoBefore:ammo,ammoAfter:host.inventory.pistol.ammo});
    }
    if (process.env.CS3_LIVE_AUDIO_EVIDENCE) {
      const {CONTRACT} = await import('../shared/multiplayer/build.mjs');
      await writeFile(process.env.CS3_LIVE_AUDIO_EVIDENCE,JSON.stringify({build:CONTRACT.buildHash,results},null,2)+'\n');
    }
    console.log('PASS matched authoritative action, first-person and distance-selected recorded voices on both seats',JSON.stringify(results));
  } finally {
    game.config.botFire=botFire;
    for(const page of peers)await page.evaluate(()=>window.roomAudioProbe?.restore()).catch(()=>{});
  }
}

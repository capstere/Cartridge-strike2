// Reduce an unpacked Actions artifact without retaining random session and room IDs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const [directory, expectedRevision, expectedBuild] = process.argv.slice(2);
assert(directory && /^[0-9a-f]{40}$/.test(expectedRevision) && /^[0-9a-f]{64}$/.test(expectedBuild),
  'Usage: node tools/release-perf-soak.mjs ARTIFACT_DIRECTORY EXPECTED_HEAD_SHA EXPECTED_BUILD_HASH');
const raw = await readFile(join(directory, 'soak-30m.json'));
const checksum = createHash('sha256').update(raw).digest('hex');
const revision = (await readFile(join(directory, 'revision.txt'), 'utf8')).trim();
assert.equal(revision, expectedRevision, 'artifact must belong to the reviewed head');
assert.equal((await readFile(join(directory, 'SHA256SUMS'), 'utf8')).trim(), checksum + '  soak-30m.json');
const {results} = JSON.parse(raw);
assert.equal(results.length, 1);
const [run] = results;
assert.equal(run.contract.buildHash, expectedBuild, 'both server and clients must use the candidate build');
assert.equal(run.contract.mapId, 'floor5-prepared');
assert.equal(run.count, 10);
assert.equal(run.rttMs, 0);
assert.equal(run.status, 'PASS');
const {baseline, measured, samples, cleanup} = run;
assert.equal(measured.rooms.length, 1);
const [room] = measured.rooms;
assert(measured.elapsedSeconds >= 1800);
assert.equal(run.joins, 20, 'completed seat replacements');
assert.equal(run.reconnects, 30, 'one verified reconnect each minute');
assert(room.matchId >= 3 && measured.combatRespawns >= 20);
assert.equal(run.shots.length, 10);
assert(run.shots.every(count => count > 0) && run.hits.some(count => count > 0));
assert.equal(cleanup.rooms.length, 0);
assert(samples.length > 0);

const seen = new Set();
let previousElapsed = -1;
let maxObservedInput = 0;
let maxHistory = 0;
for (const sample of [baseline, ...samples, measured]) {
  assert(sample.elapsedSeconds >= previousElapsed);
  previousElapsed = sample.elapsedSeconds;
  assert.equal(sample.rooms.length, 1);
  const [current] = sample.rooms;
  assert.equal(current.id, room.id);
  assert.equal(current.clients, 10);
  assert.equal(current.seats, 10);
  assert.equal(current.actors, 10);
  assert.equal(current.ai, 0);
  assert.equal(current.residents, 0);
  assert.equal(current.listenerDetails.length, 10);
  assert.deepEqual(current.listeners, baseline.rooms[0].listeners, 'stable listener counts');
  for (const client of current.listenerDetails) seen.add(client.sid);
  maxObservedInput = Math.max(maxObservedInput, current.inputMax);
  maxHistory = Math.max(maxHistory, current.histories);
}
assert.equal(seen.size, 30, 'ten initial session IDs and twenty new ones');
assert(maxObservedInput <= 12 && maxHistory <= 64);
const warm = samples.filter(sample => sample.elapsedSeconds >= 120);
assert(warm.length >= 12);
const peakHeap = window => Math.max(...window.map(sample => sample.memory.heapUsed));
const firstPeak = peakHeap(warm.slice(0, 6));
const lastPeak = peakHeap(warm.slice(-6));
assert(lastPeak < firstPeak + 16 * 1024 * 1024);
const {tick, interval} = measured.wholeRun;
assert.equal(tick.n, measured.updates);
assert(interval.n > 0);
const receipt = {
  revision, sourceSha256: checksum, contract: run.contract, environment: run.environment,
  hardware: run.physicalPi, transport: {configuredRttMs: run.rttMs, jitterMs: run.jitterMs, loss: run.loss},
  elapsedSeconds: measured.elapsedSeconds, sampleCount: samples.length, updates: measured.updates,
  joins: run.joins, reconnects: run.reconnects, distinctSessionIds: seen.size,
  matchIdAtEnd: room.matchId, combatRespawns: measured.combatRespawns,
  finalClientsShots: run.shots, finalClientsHits: run.hits, emptyRoomsAfterLastLeave: cleanup.rooms.length,
  maxObservedInput, maxHistory, maxClientPending: run.maxPending, serverMetrics: room.metrics,
  wholeRunExecutionMs: tick, wholeRunIntervalMs: interval, eventLoopMs: measured.eventLoopMs,
  serverCpuPercentOfOneCore: measured.serverCpuPercent, retainedHeapBytes: {firstSixPeak: firstPeak, lastSixPeak: lastPeak},
  finalMemoryBytes: measured.memory, perPlayerOutboundBytesPerSecond: run.perPlayerOutboundBytesPerSecond,
  perPlayerInboundBytesPerSecond: measured.inBytes / measured.elapsedSeconds / run.count,
};
console.log(JSON.stringify(receipt, null, 2));

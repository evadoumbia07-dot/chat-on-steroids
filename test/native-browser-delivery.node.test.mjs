import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeBrowserDelivery, nativeBrowserLaunchPending, nativeReconnectNeedsDelivery } from '../src/main/native-browser-delivery.ts';
const worker = { id: 'worker-1', state: 'invited' };
const base = { runId: 'run-a', workers: [worker], bridgeRunning: true,
  recentBrowser: false, wakeConnected: false, commands: [] };
const cmd = { runId: 'run-a', workerId: 'worker-1', kind: 'worker', claimed: false, held: false, hasError: false };
test('no browser or command is not a delivered worker', () => {
  const x = nativeBrowserDelivery(base);
  assert.equal(x.reachability, 'browser_unseen');
  assert.deepEqual(x.workers, [{workerId: 'worker-1', delivery: 'not_observed', hasError: false}]);
  assert.equal(x.missionAck, false);
});
test('distinguishes an HTTP sighting from an authenticated wake connection', () => {
  assert.equal(nativeBrowserDelivery({...base, recentBrowser: true}).reachability, 'recent_http_only');
  assert.equal(nativeBrowserDelivery({...base, wakeConnected: true}).reachability, 'wake_connected');
  assert.equal(nativeBrowserDelivery({...base, bridgeRunning: false, wakeConnected: true}).reachability, 'bridge_stopped');
});
test('does not mistake another incarnation or wake for this bootstrap', () => {
  const x = nativeBrowserDelivery({...base, commands: [{...cmd, runId: 'run-b'}, {...cmd, kind: 'revive'}]});
  assert.equal(x.workers[0].delivery, 'not_observed');
});
test('distinguishes queued, claimed, held and ambiguous work without claiming delivery', () => {
  for (const [patch, expected] of [[{}, 'queued'], [{claimed:true}, 'claimed'], [{held:true, claimed:true}, 'send_held']]) {
    const x = nativeBrowserDelivery({...base, commands: [{...cmd, ...patch, hasError:true}]});
    assert.equal(x.workers[0].delivery, expected);
    assert.equal(x.workers[0].hasError, true);
    assert.equal(x.missionAck, false);
  }
  assert.equal(nativeBrowserDelivery({...base, commands:[cmd, cmd]}).workers[0].delivery, 'ambiguous');
});
test('only pending workers are projected and parked runs never adopt a command', () => {
  const x = nativeBrowserDelivery({...base, workers: [{id:'worker-1',state:'waking'}, {id:'worker-2',state:'active'}],
    runId: null, commands: [{...cmd, kind:'revive'}]});
  assert.deepEqual(x.workers, [{workerId:'worker-1',delivery:'not_observed',hasError:false}]);
});

test('authenticated wake ends cold launch wait without a ChatGPT HTTP sighting', () => {
  const launch = { recentBrowser: false, wakeConnected: false, lastLaunchAt: 1000, now: 2000, graceMs: 60000 };
  assert.equal(nativeBrowserLaunchPending(launch), true);
  assert.equal(nativeBrowserLaunchPending({...launch,wakeConnected:true}), false);
  assert.equal(nativeBrowserLaunchPending({...launch,recentBrowser:true}), false);
  assert.equal(nativeBrowserLaunchPending({...launch,now:61000}), false);
  assert.equal(nativeBrowserLaunchPending({...launch,lastLaunchAt:0}), false);
});
test('reconnect wakes only unleased fresh work and respects stopped/recovering bridge', () => {
  const pending = {running:true,recovering:false,wakeConnected:true,commands:[{kind:'worker',claimedAt:null}]};
  assert.equal(nativeReconnectNeedsDelivery(pending), true);
  assert.equal(nativeReconnectNeedsDelivery({...pending,commands:[{kind:'resume',claimedAt:null}]}), true);
  for (const change of [{running:false},{recovering:true},{wakeConnected:false},
    {commands:[]},{commands:[{kind:'worker',claimedAt:123}]},{commands:[{kind:'revive',claimedAt:null}]}]) {
    assert.equal(nativeReconnectNeedsDelivery({...pending,...change}), false);
  }
});

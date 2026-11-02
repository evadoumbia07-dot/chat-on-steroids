import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeNativeWorkerHealth } from '../src/shared/native-worker-health.ts';

test('native sub-agent status reports all real broker states and unacknowledged messages', () => {
  const workers = [
    { id: 'worker-1', state: 'invited', pending: 1, awaitingAck: 0 },
    { id: 'worker-2', state: 'active', pending: 2, awaitingAck: 1 },
    { id: 'worker-3', state: 'detached', pending: 1, awaitingAck: 0 },
    { id: 'worker-4', state: 'waking', pending: 0, awaitingAck: 0 },
    { id: 'worker-5', state: 'sleeping', pending: 0, awaitingAck: 0 },
    { id: 'worker-6', state: 'finished', pending: 0, awaitingAck: 0 },
    { id: 'worker-7', state: 'failed', pending: 0, awaitingAck: 0 }
  ];
  const health = summarizeNativeWorkerHealth(workers);
  assert.equal(health.total, 7);
  for (const state of ['invited','active','detached','waking','sleeping','finished','failed'])
    assert.equal(health[state], 1);
  assert.equal(health.pendingMessages, 4);
  assert.equal(health.awaitingAckMessages, 1);
  assert.deepEqual(health.attention, [
    { workerId: 'worker-2', reason: 'unacknowledged_messages' },
    { workerId: 'worker-3', reason: 'detached' },
    { workerId: 'worker-7', reason: 'failed' }
  ]);
});

test('no workers means no implied completion or nonlocal worker attribution', () => {
  const health = summarizeNativeWorkerHealth([]);
  assert.equal(health.total, 0);
  assert.equal(health.pendingMessages, 0);
  assert.deepEqual(health.attention, []);
});

test('invalid or negative message counts do not corrupt the health summary', () => {
  const health = summarizeNativeWorkerHealth([
    { id: 'worker-1', state: 'active', pending: -1, awaitingAck: Number.NaN }
  ]);
  assert.equal(health.total, 1);
  assert.equal(health.pendingMessages, 0);
  assert.equal(health.awaitingAckMessages, 0);
  assert.deepEqual(health.attention, []);
});

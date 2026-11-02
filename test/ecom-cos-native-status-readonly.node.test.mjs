import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { readNativeCosOwnerStatus } from '../scripts/ecom-cos-native-status-readonly.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const run = '22222222-2222-4222-8222-222222222222';
const token = 'safe-test-token-with-at-least-twenty-chars';
function options(result = {
  runId: run, retainedHistory: false, freeWorkerSlots: 1,
  workers: [{
    id: 'worker-1', state: 'active', runId: run,
    sessionId: 'session_123', revivable: true,
    pending: 2, awaitingAck: 1,
    conversationId: 'PRIVATE-CONVERSATION-DO-NOT-OUTPUT',
    task: 'PRIVATE-PROMPT-DO-NOT-OUTPUT'
  }]
}) {
  const calls = [];
  return {
    calls,
    options: {
      localOwnerId: owner, expectedRunId: run,
      userDataPath: path.resolve('test-fixture-profile'),
      readFile(file) {
        if (file.endsWith('endpoint.json'))
          return JSON.stringify({ protocol: 1, port: 41234, pid: 1234 });
        if (file.endsWith('token')) return token + '\n';
        throw Error('Unexpected file read');
      },
      async request(url, opts) {
        calls.push({ url, opts });
        return { status: 200, json: async () => result };
      }
    }
  };
}

test('reads exact native owner through loopback with token never in output', async () => {
  const { calls, options: o } = options();
  const result = await readNativeCosOwnerStatus(o);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:41234/v1/workers/' + owner);
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(calls[0].opts.redirect, 'error');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer ' + token);
  assert.equal(result.schema, 'ECOM_COS_NATIVE_OWNER_STATUS_READONLY_V1');
  assert.equal(result.runId, run);
  assert.equal(result.canonicalMissionAck, false);
  assert.deepEqual(result.workers, [{
    id: 'worker-1', state: 'active', runId: run, sessionId: 'session_123',
    revivable: true, pending: 2, awaitingAck: 1
  }]);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes('PRIVATE-CONVERSATION'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE-PROMPT'));
});

test('no owner identity or mismatched native run makes no request or fails closed', async () => {
  const { calls, options: o } = options();
  await assert.rejects(readNativeCosOwnerStatus({ ...o, localOwnerId: 'invented' }),
    /COS_NATIVE_OWNER_ID_REQUIRED/);
  await assert.rejects(readNativeCosOwnerStatus({ ...o, expectedRunId: 'other' }),
    /COS_NATIVE_RUN_ID_INVALID/);
  assert.equal(calls.length, 0);
  await assert.rejects(readNativeCosOwnerStatus({ ...o, expectedRunId:
    '33333333-3333-4333-8333-333333333333' }), /COS_NATIVE_RUN_MISMATCH/);
});

test('cannot claim another owner, leak arbitrary worker state, or accept HTTP redirects', async () => {
  const wrongOwner = options({ runId: run, nativeBroker: {
    localOwnerId: '44444444-4444-4444-8444-444444444444'
  }, workers: [] });
  await assert.rejects(readNativeCosOwnerStatus(wrongOwner.options),
    /COS_NATIVE_OWNER_MISMATCH/);
  const badWorker = options({ runId: run, workers: [{ id: 'fake', state: 'RUNNING' }] });
  await assert.rejects(readNativeCosOwnerStatus(badWorker.options),
    /COS_NATIVE_WORKER_STATUS_INVALID/);
  const redirect = options();
  redirect.options.request = async () => ({ status: 302 });
  await assert.rejects(readNativeCosOwnerStatus(redirect.options),
    /COS_NATIVE_CONTROL_API_NOT_AUTHORIZED_OR_DISABLED/);
});

test('unsupported control protocol or missing auth fails before networking', async () => {
  const { calls, options: o } = options();
  o.readFile = file => file.endsWith('endpoint.json')
    ? JSON.stringify({ protocol: 99, port: 41234, pid: 1234 }) : token;
  await assert.rejects(readNativeCosOwnerStatus(o), /COS_NATIVE_CONTROL_API_INVALID/);
  o.readFile = () => { throw Error('No credentials'); };
  await assert.rejects(readNativeCosOwnerStatus(o), /COS_NATIVE_CONTROL_API_UNAVAILABLE/);
  assert.equal(calls.length, 0);
});

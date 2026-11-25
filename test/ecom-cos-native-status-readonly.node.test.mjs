import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { readNativeCosOwnerStatus } from '../scripts/ecom-cos-native-status-readonly.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const run = '22222222-2222-4222-8222-222222222222';
const token = 'safe-test-token-with-at-least-twenty-chars';
const proof = { source: 'chat-on-steroids-native-broker', localOwnerId: owner, runId: run, missionAck: false };
function options(result = {
  nativeBroker: proof,
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
  assert.equal(calls[0].url, 'http://127.0.0.1:41234/v1/workers/' + owner + '?runId=' + run);
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
  const badWorker = options({ runId: run, nativeBroker: proof, workers: [{ id: 'fake', state: 'RUNNING' }] });
  await assert.rejects(readNativeCosOwnerStatus(badWorker.options),
    /COS_NATIVE_WORKER_STATUS_INVALID/);
  const badBroker = options({ runId: run, nativeBroker: {
    source: 'chat-on-steroids-native-broker', localOwnerId: owner,
    runId: '33333333-3333-4333-8333-333333333333', missionAck: false
  }, workers: [] });
  await assert.rejects(readNativeCosOwnerStatus(badBroker.options),
    /COS_NATIVE_BROKER_PROOF_INVALID/);
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

test('requires broker proof, not merely a caller-supplied owner ID', async () => {
  const { options: o } = options({ runId: run, workers: [] });
  await assert.rejects(readNativeCosOwnerStatus(o), /COS_NATIVE_BROKER_PROOF_REQUIRED/);
});

test('retains the verified parked identity without inventing an active run', async () => {
  const { options: o } = options({ runId: null, retainedHistory: true, nativeBroker: proof, workers: [] });
  const receipt = await readNativeCosOwnerStatus(o);
  assert.equal(receipt.runId, run);
  assert.equal(receipt.activeRunId, null);
  assert.equal(receipt.canonicalMissionAck, false);
  const invalid = options({ runId: null, retainedHistory: false, nativeBroker: proof, workers: [] });
  await assert.rejects(readNativeCosOwnerStatus(invalid.options), /COS_NATIVE_BROKER_PROOF_INVALID/);
});

test('follows the original stable family address when an incarnation rotates', async () => {
  const active = '33333333-3333-4333-8333-333333333333';
  const { options: o } = options({runId: active, retainedHistory: false,
    nativeBroker: {...proof, runId: active}, workers: [],
    familyDirectory: {selectedFamilyId: run, selectionRequired: false,
      families: [{familyId: run, runId: active, running: true}]}});
  const receipt = await readNativeCosOwnerStatus(o);
  assert.equal(receipt.activeRunId, active);
  assert.equal(receipt.familyDirectory.selectedFamilyId, run);
  assert.equal(receipt.canonicalMissionAck, false);
});

test('returns owner-scoped discovery instead of claiming an ambiguous family', async () => {
  const another = '33333333-3333-4333-8333-333333333333';
  const { options: o } = options({runId: null, nativeBroker: {...proof, runId: null}, workers: [],
    familyDirectory: {selectedFamilyId: null, selectionRequired: true,
      families: [{familyId: run, runId: run, running: true},
        {familyId: another, runId: another, running: false}]}});
  delete o.expectedRunId;
  const receipt = await readNativeCosOwnerStatus(o);
  assert.equal(receipt.familyDirectory.selectionRequired, true);
  assert.equal(receipt.familyDirectory.families.length, 2);
  assert.equal(receipt.runId, null);
});

test('rejects contradictory family proof and a different stable address', async () => {
  const another = '33333333-3333-4333-8333-333333333333';
  const { options: o } = options({runId: another, nativeBroker: {...proof, runId: another}, workers: [],
    familyDirectory: {selectedFamilyId: run, selectionRequired: false,
      families: [{familyId: run, runId: another, running: false}]}});
  await assert.rejects(readNativeCosOwnerStatus(o), /COS_NATIVE_FAMILY_DIRECTORY_INVALID/);
  const wrong = options({runId: another, nativeBroker: {...proof, runId: another}, workers: [],
    familyDirectory: {selectedFamilyId: another, selectionRequired: false,
      families: [{familyId: another, runId: another, running: true}]}});
  await assert.rejects(readNativeCosOwnerStatus(wrong.options), /COS_NATIVE_RUN_MISMATCH/);
});

test('retains only owner-scoped queue diagnostics and rejects a stale or foreign command', async () => {
  const raw = {nativeBroker: proof, runId: run, workers: [{id:'worker-1',state:'invited',runId:run}],
    browserDelivery:{source:'native-bridge-queue',runId:run,reachability:'wake_connected',
      workers:[{workerId:'worker-1',delivery:'claimed',hasError:false, rawError:'PRIVATE'}],missionAck:false}};
  const result = await readNativeCosOwnerStatus(options(raw).options);
  assert.equal(result.browserDelivery.workers[0].delivery,'claimed');
  assert.equal(result.browserDelivery.missionAck,false);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  await assert.rejects(readNativeCosOwnerStatus(options({...raw,browserDelivery:{...raw.browserDelivery,
    workers:[{workerId:'worker-2',delivery:'queued',hasError:false}]}}).options),/COS_NATIVE_BROWSER_DELIVERY_INVALID/);
  await assert.rejects(readNativeCosOwnerStatus(options({...raw,browserDelivery:{...raw.browserDelivery,
    runId:'33333333-3333-4333-8333-333333333333'}}).options),/COS_NATIVE_BROWSER_DELIVERY_INVALID/);
});

test('reports actual broker admission headroom rather than only family capacity', async () => {
  const raw = {nativeBroker:proof,runId:run,workers:[],freeWorkerSlots:4,admissibleWorkerSlots:0};
  const r = await readNativeCosOwnerStatus(options(raw).options);
  assert.equal(r.freeWorkerSlots,4);
  assert.equal(r.admissibleWorkerSlots,0);
  await assert.rejects(readNativeCosOwnerStatus(options({...raw,admissibleWorkerSlots:5}).options),/COS_NATIVE_ADMISSION_CAPACITY_INVALID/);
});

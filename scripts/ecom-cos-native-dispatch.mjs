import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readNativeCosOwnerStatus } from './ecom-cos-native-status-readonly.mjs';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const WORKER = /^worker-[1-9][0-9]{0,5}$/;
const fail = code => { throw Error(code); };

/** Trusted local controller adapter, NOT an MCP tool or a public endpoint.
 * The host supplies the approved dispatch and a canonical lease assertion
 * bound to that exact immutable operation. No implicit auth or retry.
 * Native admission is not task delivery or canonical acknowledgement.
 */
export async function dispatchNativeCosWorker({
  localOwnerId, familyId, userDataPath, action, payload, assertCanonical,
  readFile = readFileSync, request = fetch
}) {
  if (!UUID.test(localOwnerId ?? '') || (familyId !== null && !UUID.test(familyId ?? '')) ||
      typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath) ||
      !['spawn','message'].includes(action) || typeof assertCanonical !== 'function')
    fail('COS_NATIVE_DISPATCH_SCOPE_REQUIRED');
  if (familyId === null && action !== 'spawn') fail('COS_NATIVE_FAMILY_REQUIRED');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Object.hasOwn(payload,'runId') || Object.hasOwn(payload,'ownerId'))
    fail('COS_NATIVE_DISPATCH_PAYLOAD_INVALID');
  // Clone once. The host's assertion must bind the exact payload, action and owner,
  // including any projectId; never derive approval from model-provided fields.
  const body = JSON.parse(JSON.stringify(payload));
  const scope = Object.freeze({ localOwnerId, familyId, action, body: JSON.stringify(body) });
  const assertLease = async () => {
    if (await assertCanonical(scope) !== true) fail('ECOM_CANONICAL_DISPATCH_DENIED');
  };
  await assertLease();
  const options = {localOwnerId, userDataPath, readFile, request};
  const before = await readNativeCosOwnerStatus({...options, expectedRunId: familyId ?? undefined});
  const directory = before.familyDirectory;
  if (!directory || directory.selectionRequired ||
      (familyId === null ? directory.families.length !== 0 : directory.selectedFamilyId !== familyId))
    fail('COS_NATIVE_FAMILY_RECONCILIATION_REQUIRED');
  if (action === 'spawn' && (!Array.isArray(body.workers) || body.workers.length < 1 ||
      body.workers.length > 8 || !Number.isSafeInteger(before.admissibleWorkerSlots) ||
      body.workers.length > before.admissibleWorkerSlots))
    fail('COS_NATIVE_ADMISSION_CAPACITY_REQUIRED');
  if (action === 'message' && (!Array.isArray(body.messages) || body.messages.length < 1 ||
      body.messages.length > 16 || body.messages.some(m => !before.workers.some(w =>
        w.id === m?.to && (w.state === 'active' || w.state === 'sleeping')))))
    fail('COS_NATIVE_WORKER_SELECTION_REQUIRED');
  const directoryPath = path.join(userDataPath,'control-api');
  let endpoint, token;
  try {
    endpoint = JSON.parse(readFile(path.join(directoryPath,'endpoint.json'),'utf8'));
    token = readFile(path.join(directoryPath,'token'),'utf8').trim();
  } catch { fail('COS_NATIVE_CONTROL_API_UNAVAILABLE'); }
  if (endpoint?.protocol !== 1 || !Number.isInteger(endpoint.port) ||
      endpoint.port < 1 || endpoint.port > 65535 || !Number.isInteger(endpoint.pid) ||
      endpoint.pid < 1 || !/^[A-Za-z0-9_-]{20,256}$/.test(token))
    fail('COS_NATIVE_CONTROL_API_INVALID');
  await assertLease();
  // Once a POST is attempted, even a timeout or malformed response is an
  // UNKNOWN_EFFECT until the canonical owner reconciles. Never replay here.
  try {
    const response = await request('http://127.0.0.1:'+endpoint.port+'/v1/workers/'+localOwnerId+'/'+action,{
      method:'POST', redirect:'error', signal:AbortSignal.timeout(25000),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({...body,...(familyId === null ? {} : {runId:familyId})})
    });
    if (response?.status !== 202) fail('COS_NATIVE_DISPATCH_UNKNOWN_EFFECT');
    const receipt = await response.json();
    if (!UUID.test(receipt?.runId ?? '')) fail('COS_NATIVE_DISPATCH_UNKNOWN_EFFECT');
    const after = await readNativeCosOwnerStatus({...options,expectedRunId:familyId ?? receipt.runId});
    if (!after.familyDirectory || after.activeRunId !== receipt.runId ||
        after.familyDirectory.selectedFamilyId !== (familyId ?? receipt.runId))
      fail('COS_NATIVE_DISPATCH_UNKNOWN_EFFECT');
    const ids = action === 'spawn' ? receipt.workers?.map(w => w.id) : receipt.queued?.map(m => m.to);
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !WORKER.test(id) ||
      !after.workers.some(w => w.id === id))) fail('COS_NATIVE_DISPATCH_UNKNOWN_EFFECT');
    await assertLease();
    return {state:'DISPATCHED',localOwnerId,familyId:after.familyDirectory.selectedFamilyId,
      runId:receipt.runId,workerIds:[...new Set(ids)],canonicalMissionAck:false};
  } catch { fail('COS_NATIVE_DISPATCH_UNKNOWN_EFFECT'); }
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const WORKER_ID = /^worker-[1-9][0-9]{0,5}$/;
const STATES = new Set(['invited', 'active', 'detached', 'waking', 'sleeping', 'finished', 'failed']);

const safeCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const optionalId = value => typeof value === 'string' && value.length <= 128
  && /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;

/** Validate the existing broker's family projection; never infer a family from a chat. */
function familyDirectory(raw, selectedRun, expectedRunId) {
  if (raw.familyDirectory === undefined) return null;
  const d = raw.familyDirectory;
  const invalid = () => { throw Error('COS_NATIVE_FAMILY_DIRECTORY_INVALID'); };
  if (!d || !Array.isArray(d.families) || d.families.length > 200 ||
      typeof d.selectionRequired !== 'boolean' ||
      (d.selectedFamilyId !== null && !UUID.test(d.selectedFamilyId ?? ''))) invalid();
  const seen = new Set(), runs = new Set();
  const families = d.families.map(f => {
    if (!f || !UUID.test(f.familyId ?? '') || !UUID.test(f.runId ?? '') ||
        typeof f.running !== 'boolean' || seen.has(f.familyId) || runs.has(f.runId)) invalid();
    seen.add(f.familyId); runs.add(f.runId);
    return { familyId: f.familyId, runId: f.runId, running: f.running };
  });
  const selected = families.find(f => f.familyId === d.selectedFamilyId);
  if (d.selectedFamilyId !== null && !selected) invalid();
  if (d.selectionRequired !== (!expectedRunId && families.length > 1) ||
      (d.selectionRequired && selected) ||
      (!d.selectionRequired && families.length > 0 && !selected) ||
      (!selected && (selectedRun !== null || raw.runId !== null || raw.workers.length > 0))) invalid();
  if (selected && (selected.running !== (raw.runId !== null) ||
      (selected.running && selected.runId !== raw.runId) ||
      (!selected.running && selectedRun !== selected.runId && selectedRun !== expectedRunId))) invalid();
  if (expectedRunId && !selected) invalid();
  return { selectedFamilyId: d.selectedFamilyId, selectionRequired: d.selectionRequired, families };
}

/**
 * One authenticated, owner-scoped READ from the existing CoS Control API.
 * This adapter is a short-lived client, not a scheduler, worker or broker.
 * No credentials/whole chat messages are included in its returned receipt.
 */
export async function readNativeCosOwnerStatus({
  localOwnerId,
  expectedRunId,
  userDataPath,
  readFile = readFileSync,
  request = fetch,
  timeoutMs = 5_000
}) {
  if (!UUID.test(localOwnerId ?? '')) throw Error('COS_NATIVE_OWNER_ID_REQUIRED');
  if (expectedRunId !== undefined && !UUID.test(expectedRunId))
    throw Error('COS_NATIVE_RUN_ID_INVALID');
  if (typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath))
    throw Error('COS_NATIVE_PROFILE_REQUIRED');
  const controlDir = path.join(userDataPath, 'control-api');
  let endpoint, token;
  try {
    endpoint = JSON.parse(readFile(path.join(controlDir, 'endpoint.json'), 'utf8'));
    token = readFile(path.join(controlDir, 'token'), 'utf8').trim();
  } catch {
    throw Error('COS_NATIVE_CONTROL_API_UNAVAILABLE');
  }
  if (endpoint?.protocol !== 1 || !Number.isInteger(endpoint.port)
    || endpoint.port < 1 || endpoint.port > 65535
    || !Number.isInteger(endpoint.pid) || endpoint.pid < 1
    || !/^[A-Za-z0-9_-]{20,256}$/.test(token))
    throw Error('COS_NATIVE_CONTROL_API_INVALID');
  let response;
  try {
    response = await request(
      `http://127.0.0.1:${endpoint.port}/v1/workers/${localOwnerId}` +
        (expectedRunId ? `?runId=${expectedRunId}` : ''),
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(Math.max(500, timeoutMs), 10_000))
      }
    );
  } catch {
    throw Error('COS_NATIVE_CONTROL_API_UNREACHABLE');
  }
  if (!response || response.status !== 200)
    throw Error('COS_NATIVE_CONTROL_API_NOT_AUTHORIZED_OR_DISABLED');
  let raw;
  try {
    raw = await response.json();
  } catch {
    throw Error('COS_NATIVE_CONTROL_API_MALFORMED');
  }
  if (!raw || !Array.isArray(raw.workers) || raw.workers.length > 200
      || (raw.runId !== null && !UUID.test(raw.runId ?? '')))
    throw Error('COS_NATIVE_STATUS_INVALID');
  // Never derive owner proof from the requested URL alone. An older CoS
  // without authenticated broker provenance is not an ECOM identity receipt.
  if (!raw.nativeBroker || typeof raw.nativeBroker !== 'object')
    throw Error('COS_NATIVE_BROKER_PROOF_REQUIRED');
  if (raw.nativeBroker.localOwnerId !== localOwnerId)
    throw Error('COS_NATIVE_OWNER_MISMATCH');
  const selectedRun = raw.nativeBroker.runId;
  if (raw.nativeBroker.source !== 'chat-on-steroids-native-broker'
    || raw.nativeBroker.missionAck !== false
    || (selectedRun !== null && !UUID.test(selectedRun ?? ''))
    || (raw.runId !== null && selectedRun !== raw.runId)
    || (raw.runId === null && selectedRun !== null && raw.retainedHistory !== true))
    throw Error('COS_NATIVE_BROKER_PROOF_INVALID');
  const directory = familyDirectory(raw, selectedRun, expectedRunId);
  if (expectedRunId !== undefined && selectedRun !== expectedRunId &&
      directory?.selectedFamilyId !== expectedRunId)
    throw Error('COS_NATIVE_RUN_MISMATCH');
  const workers = raw.workers.map(worker => {
    if (!WORKER_ID.test(worker?.id ?? '') || !STATES.has(worker?.state))
      throw Error('COS_NATIVE_WORKER_STATUS_INVALID');
    return {
      id: worker.id,
      state: worker.state,
      runId: UUID.test(worker.runId ?? '') ? worker.runId : null,
      sessionId: optionalId(worker.sessionId),
      revivable: worker.revivable === true,
      pending: safeCount(worker.pending),
      awaitingAck: safeCount(worker.awaitingAck)
    };
  });
  return {
    schema: 'ECOM_COS_NATIVE_OWNER_STATUS_READONLY_V1',
    source: 'authenticated-original-cos-control-api',
    localOwnerId,
    runId: selectedRun,
    activeRunId: raw.runId,
    ...(directory ? { familyDirectory: directory } : {}),
    retainedHistory: raw.retainedHistory === true,
    freeWorkerSlots: safeCount(raw.freeWorkerSlots),
    workers,
    // A CoS status is never a provider result or independent ECOM OS ACK.
    canonicalMissionAck: false
  };
}

function profileFromEnvironment(env = process.env) {
  if (process.platform === 'win32') {
    if (!env.APPDATA) throw Error('COS_NATIVE_PROFILE_REQUIRED');
    return path.join(env.APPDATA, 'chat-on-steroids');
  }
  const base = env.XDG_CONFIG_HOME || (env.HOME && path.join(env.HOME, '.config'));
  if (!base) throw Error('COS_NATIVE_PROFILE_REQUIRED');
  return path.join(base, 'chat-on-steroids');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = args[0] === '--owner-id' && (args.length === 2 ||
    (args.length === 4 && args[2] === '--run-id'));
  const localOwnerId = valid ? args[1] : null;
  const expectedRunId = valid && args.length === 4 ? args[3] : undefined;
  Promise.resolve().then(() => readNativeCosOwnerStatus({ localOwnerId, expectedRunId,
    userDataPath: profileFromEnvironment() }))
    .then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => {
      const safe = /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'COS_NATIVE_READ_FAILED';
      process.stderr.write(safe + '\n');
      process.exitCode = 1;
    });
}

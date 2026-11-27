import { createHash } from 'node:crypto';
import { dispatchNativeCosWorker } from './ecom-cos-native-dispatch.mjs';

const UMI = /^umi-[0-9a-f]{24}$/;
const ID = /^[A-Za-z0-9._:-]{1,160}$/;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const WORKER = /^worker-[1-9][0-9]{0,5}$/;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = code => { throw Error(code); };
const matches = (obj, expected) => Object.entries(expected).every(([key,value]) => obj?.[key] === value);

/**
 * One host-owned continuation of an already assigned mission, using the existing
 * durable controller ledger and native CoS inbox. No new queue, timer, task or
 * owner credential. The host must provide verified canonical checkpoint/lease
 * reads and atomic reservation, and record the queue receipt in that same ledger.
 * Callbacks must not be exposed as model-supplied flags or MCP arguments.
 *
 * The checkpoint carries the exact NEXT action, not the action whose external
 * outcome is still uncertain. A receiver must separately acknowledge the queued
 * message and the final provider result must be independently verified.
 */
export async function resumeNativeCosCheckpoint({
  originalMissionId, readCanonicalCheckpoint, reserveCanonical,
  assertCanonical, recordCanonicalDispatch, userDataPath, readFile, request
}) {
  if (!UMI.test(originalMissionId ?? '') ||
      [readCanonicalCheckpoint,reserveCanonical,assertCanonical,recordCanonicalDispatch].some(f=>typeof f!=='function'))
    fail('ECOM_RESUME_SCOPE_REQUIRED');
  const c = await readCanonicalCheckpoint(originalMissionId);
  if (!c || c.originalMissionId!==originalMissionId || c.checkpointMissionId!==originalMissionId ||
      c.canonicalCheckpointDurable!==true || c.leaseFresh!==true ||
      c.ownerApproved!==true || c.writerFenced!==true ||
      !ID.test(c.leaseId??'') || !ID.test(c.decisionRevision??'') ||
      !ID.test(c.checkpointId??'') || !ID.test(c.nextActionId??'') ||
      !UUID.test(c.localOwnerId??'') || !UUID.test(c.familyId??'') ||
      !WORKER.test(c.workerId??'') || typeof c.nextInstruction!=='string' ||
      !c.nextInstruction.trim() || c.nextInstruction.length>10000 ||
      !Number.isSafeInteger(c.identicalFailureCount) || c.identicalFailureCount<0)
    fail('ECOM_RESUME_CHECKPOINT_UNVERIFIED');
  if (c.identicalFailureCount>=2) fail('ECOM_RESUME_INCIDENT_CIRCUIT_OPEN');
  if (!(c.externalEffect==='none' && c.providerReadback==='not_required' ||
        c.externalEffect==='confirmed' && c.providerReadback==='matched'))
    fail('ECOM_RESUME_PROVIDER_RECONCILIATION_REQUIRED');
  // No restarting an already completed action or a mission whose acceptance is finished.
  if (c.missionComplete!==false || !ID.test(c.previousActionId??'') ||
      c.previousActionId===c.nextActionId)
    fail('ECOM_RESUME_NEXT_ACTION_REQUIRED');
  // Stable across lease rotation, revision refresh and a new chat. The canonical
  // ledger must reject replay, even after a crash or a lost transport response.
  const key='cos-resume-v1-'+digest([originalMissionId,c.nextActionId]);
  const payload={messages:[{to:c.workerId,text:c.nextInstruction}]};
  const body=JSON.stringify(payload);
  const scope=Object.freeze({
    originalMissionId,checkpointId:c.checkpointId,nextActionId:c.nextActionId,
    decisionRevision:c.decisionRevision,leaseId:c.leaseId,
    localOwnerId:c.localOwnerId,familyId:c.familyId,workerId:c.workerId,
    idempotencyKey:key,instructionDigest:digest(c.nextInstruction)
  });
  let reserved;
  try { reserved=await reserveCanonical(scope); }
  catch { fail('ECOM_RESUME_RESERVATION_UNKNOWN_EFFECT'); }
  if (reserved?.state!=='RESERVED' || !ID.test(reserved.reservationId??'') ||
      !matches(reserved,{idempotencyKey:key,instructionDigest:scope.instructionDigest,
        originalMissionId,checkpointId:scope.checkpointId,nextActionId:scope.nextActionId}))
    fail('ECOM_RESUME_RESERVATION_REQUIRED_OR_ALREADY_USED');
  const authority=Object.freeze({...scope,reservationId:reserved.reservationId});
  try {
    const result=await dispatchNativeCosWorker({
      localOwnerId:scope.localOwnerId,familyId:scope.familyId,userDataPath,
      action:'message',payload,readFile,request,
      async assertCanonical(operation) {
        return matches(operation,{localOwnerId:scope.localOwnerId,familyId:scope.familyId,
          action:'message',body}) && await assertCanonical(authority)===true;
      }
    });
    const m=result.messageReceipts?.[0];
    if (result.familyId!==scope.familyId || result.localOwnerId!==scope.localOwnerId ||
        result.workerIds.length!==1 || result.workerIds[0]!==scope.workerId ||
        result.messageReceipts.length!==1 || m?.to!==scope.workerId)
      fail('ECOM_RESUME_NATIVE_RECEIPT_INVALID');
    const receipt=Object.freeze({...authority,runId:result.runId,nativeMessageId:m.id,
      state:'DISPATCHED',receiverAcknowledged:false,canonicalMissionAck:false});
    if (await recordCanonicalDispatch(receipt)!==true) fail('ECOM_RESUME_RECEIPT_UNVERIFIED');
    return receipt;
  } catch {
    // Keep reservation. No automatic release, retry, fake receiver ACK or new task.
    fail('ECOM_RESUME_RECONCILIATION_REQUIRED');
  }
}

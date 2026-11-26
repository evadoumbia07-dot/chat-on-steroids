import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readNativeCosDelegationRequests } from './ecom-cos-native-delegation.mjs';
import { dispatchNativeCosWorker } from './ecom-cos-native-dispatch.mjs';

const UMI=/^umi-[0-9a-f]{24}$/;
const HEX=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9._:-]{1,160}$/;
const WORKER=/^worker-[1-9][0-9]{0,5}$/;
const fail=code=>{throw Error(code);};

/**
 * Host-only delegation adapter. The existing ECOM OS controller owns all
 * authorization, depth/capacity policy, locking and durable idempotency.
 * reserveCanonical MUST atomically reserve the idempotency key and exclusive
 * family dispatch ownership in its EXISTING ledger. Returning RESERVED on
 * a replay or an uncertain transaction violates the contract.
 * assertCanonical MUST recheck the same reservation, mission revision, lease,
 * approved scope and current capacity before every native dispatch boundary.
 * recordCanonicalDispatch persists the exact child/parent receipt, NOT a
 * mission-completion ACK. No autonomous scheduler or second ledger here.
 */
export async function dispatchApprovedNativeCosDelegation({
  localOwnerId, familyId, userDataPath, originalMissionId, leaseId,
  canonicalRevision, reportId, proposalDigest, reserveCanonical,
  assertCanonical, recordCanonicalDispatch, readFile=readFileSync, request=fetch
}) {
  if(!UMI.test(originalMissionId??'') || !ID.test(leaseId??'') ||
     !ID.test(canonicalRevision??'') || !ID.test(reportId??'') ||
     !HEX.test(proposalDigest??'') || typeof reserveCanonical!=='function' ||
     typeof assertCanonical!=='function' || typeof recordCanonicalDispatch!=='function')
    fail('ECOM_DELEGATION_CANONICAL_SCOPE_REQUIRED');
  const native={localOwnerId,familyId,userDataPath,readFile,request};
  // Derive parent and child from authenticated report, not a model argument.
  const readProposal=async()=>{
    const report=await readNativeCosDelegationRequests(native);
    const p=report.proposals.find(p=>p.reportId===reportId);
    if(!p || p.proposalDigest!==proposalDigest) fail('ECOM_DELEGATION_PROPOSAL_UNVERIFIED');
    return p;
  };
  const proposal=await readProposal();
  const idempotencyKey='cos-delegation-v1-'+createHash('sha256')
    .update(JSON.stringify([originalMissionId,localOwnerId,familyId,reportId])).digest('hex');
  const child=Object.freeze({...proposal.child});
  const scope=Object.freeze({originalMissionId,leaseId,canonicalRevision,localOwnerId,
    familyId,parentWorkerId:proposal.parentWorkerId,reportId,proposalDigest,idempotencyKey,child});
  // No POST unless a fresh durable reservation was returned. Unknown reserve
  // outcomes must be reconciled in the existing controller before any retry.
  let reserved;
  try { reserved=await reserveCanonical(scope); }
  catch { fail('ECOM_DELEGATION_RESERVATION_UNKNOWN_EFFECT'); }
  if(reserved?.state!=='RESERVED' || !ID.test(reserved.reservationId??'') ||
     reserved.idempotencyKey!==idempotencyKey || reserved.proposalDigest!==proposalDigest)
    fail('ECOM_DELEGATION_RESERVATION_REQUIRED_OR_ALREADY_USED');
  const reservationId=reserved.reservationId;
  const authorization=Object.freeze({...scope,reservationId});
  const payload={workers:[child]};
  const expectedBody=JSON.stringify(payload);
  let dispatch;
  try {
    dispatch=await dispatchNativeCosWorker({...native,action:'spawn',payload,
      async assertCanonical(operation){
        if(operation.localOwnerId!==localOwnerId || operation.familyId!==familyId ||
           operation.action!=='spawn' || operation.body!==expectedBody) return false;
        // A report must still be readable and exactly match, not just carry
        // an old approval. Do not acknowledge it before durable receipt.
        await readProposal();
        return await assertCanonical(authorization)===true;
      }});
    if(dispatch.familyId!==familyId || dispatch.localOwnerId!==localOwnerId ||
       dispatch.workerIds.length!==1 || !WORKER.test(dispatch.workerIds[0]) ||
       dispatch.workerIds[0]===proposal.parentWorkerId)
      fail('ECOM_DELEGATION_NATIVE_RECEIPT_INVALID');
    const receipt=Object.freeze({...authorization,runId:dispatch.runId,
      childWorkerId:dispatch.workerIds[0],state:'DISPATCHED',canonicalMissionAck:false});
    if(await recordCanonicalDispatch(receipt)!==true)
      fail('ECOM_DELEGATION_CANONICAL_RECEIPT_UNVERIFIED');
    return receipt;
  } catch {
    // Includes a rejected admission after reservation, lost POST reply or
    // lost canonical receipt. Keep reservation; never release/replay blindly.
    fail('ECOM_DELEGATION_RECONCILIATION_REQUIRED');
  }
}

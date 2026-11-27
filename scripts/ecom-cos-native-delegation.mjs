import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readNativeCosOwnerStatus } from './ecom-cos-native-status-readonly.mjs';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const WORKER = /^worker-[1-9][0-9]{0,5}$/;
const MESSAGE = /^[A-Za-z0-9_-]{1,100}$/;
const PREFIX = 'ECOM_DELEGATION_V1\n';
const fail = code => { throw Error(code); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/**
 * Trusted host-only discovery over the existing authenticated owner report inbox.
 * A worker may PROPOSE a child task using a normal message to prime. The existing
 * controller must bind the proposal digest, parent identity, original UMI and
 * its lease/idempotency receipt before calling dispatchNativeCosWorker.
 * This module never spawns, ACKs, creates a queue, or grants new permissions.
 */
export async function readNativeCosDelegationRequests({
  localOwnerId, familyId, userDataPath, readFile=readFileSync, request=fetch
}) {
  if (!UUID.test(localOwnerId ?? '') || !UUID.test(familyId ?? '') ||
      typeof userDataPath !== 'string' || !path.isAbsolute(userDataPath))
    fail('COS_DELEGATION_SCOPE_REQUIRED');
  const dir=path.join(userDataPath,'control-api');
  const epPath=path.join(dir,'endpoint.json'), tokenPath=path.join(dir,'token');
  function incarnation() {
    try {
      const endpoint=JSON.parse(readFile(epPath,'utf8'));
      const token=readFile(tokenPath,'utf8').trim();
      if(endpoint?.protocol!==1 || !Number.isInteger(endpoint.pid) || endpoint.pid<1 ||
         !Number.isInteger(endpoint.port) || endpoint.port<1 || endpoint.port>65535 ||
         !/^[A-Za-z0-9_-]{20,256}$/.test(token)) fail('COS_DELEGATION_ENDPOINT_INVALID');
      return {endpoint,token};
    } catch { fail('COS_DELEGATION_ENDPOINT_UNAVAILABLE'); }
  }
  const {endpoint,token}=incarnation();
  const pinnedRead=file=>{
    if(file===epPath) return JSON.stringify(endpoint);
    if(file===tokenPath) return token;
    fail('COS_DELEGATION_ENDPOINT_INVALID');
  };
  const status=await readNativeCosOwnerStatus({localOwnerId,userDataPath,
    expectedRunId:familyId,readFile:pinnedRead,request});
  if(status.familyDirectory?.selectedFamilyId!==familyId ||
     status.familyDirectory?.selectionRequired) fail('COS_DELEGATION_FAMILY_UNVERIFIED');
  const r=await request('http://127.0.0.1:'+endpoint.port+'/v1/workers/'+localOwnerId+'/reports?runId='+familyId,
    {method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token}});
  if(r?.status!==200) fail('COS_DELEGATION_REPORTS_UNAVAILABLE');
  const reports=await r.json();
  const current=incarnation();
  if(current.endpoint.pid!==endpoint.pid || current.endpoint.port!==endpoint.port || current.token!==token)
    fail('COS_DELEGATION_INCARNATION_CHANGED');
  const b=reports?.nativeBroker;
  if(b?.source!=='chat-on-steroids-native-broker' || b.localOwnerId!==localOwnerId ||
     b.missionAck!==false || ![familyId,status.runId].includes(b.runId) ||
     !Array.isArray(reports.messages) || reports.messages.length>200)
    fail('COS_DELEGATION_REPORT_PROVENANCE_INVALID');
  const seen=new Set(), proposals=[];
  for(const row of reports.messages) {
    if(typeof row?.text!=='string' || !row.text.startsWith(PREFIX)) continue;
    if(!MESSAGE.test(row.id??'') || seen.has(row.id) || row.runId!==familyId ||
       !WORKER.test(row.from??'') || !status.workers.some(w=>w.id===row.from &&
          ['active','sleeping'].includes(w.state))) continue;
    seen.add(row.id);
    if(row.text.length>4000) continue;
    let data;
    try{data=JSON.parse(row.text.slice(PREFIX.length));}catch{continue;}
    if(!data || typeof data!=='object' || Array.isArray(data) ||
       Object.keys(data).sort().join(',')!=='label,task' ||
       typeof data.label!=='string' || !data.label.trim() || data.label.length>60 ||
       typeof data.task!=='string' || !data.task.trim() || data.task.length>3500) continue;
    const proposal={localOwnerId,familyId,parentWorkerId:row.from,reportId:row.id,
      child:{label:data.label.trim(),task:data.task.trim()}};
    proposals.push({...proposal,proposalDigest:digest(proposal),state:'PROPOSED',
      requiresCanonicalApproval:true,dispatched:false,canonicalMissionAck:false});
  }
  return {source:'authenticated-native-owner-report-inbox',localOwnerId,familyId,
    proposals,canonicalMissionAck:false,dispatched:false};
}

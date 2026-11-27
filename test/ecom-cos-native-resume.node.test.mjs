import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resumeNativeCosCheckpoint } from '../scripts/ecom-cos-native-resume.mjs';

const mission='umi-1dad2d3f3ec2246cdc39daa7', owner='11111111-1111-4111-8111-111111111111',
  family='22222222-2222-4222-8222-222222222222';
function fixture(change={}) {
  const calls=[],keys=new Set(),receipts=[];
  const checkpoint={originalMissionId:mission,checkpointMissionId:mission,
    canonicalCheckpointDurable:true,leaseFresh:true,ownerApproved:true,writerFenced:true,
    leaseId:'lease-a',decisionRevision:'decision-1',checkpointId:'cp-1',
    previousActionId:'action-1',nextActionId:'action-2',localOwnerId:owner,
    familyId:family,workerId:'worker-1',nextInstruction:'Continue only the verified next action.',
    identicalFailureCount:0,externalEffect:'confirmed',providerReadback:'matched',missionComplete:false,...change};
  const opts={originalMissionId:mission,userDataPath:path.resolve('fixture-profile'),
    readCanonicalCheckpoint:async()=>({...checkpoint}),
    async reserveCanonical(s) {
      if(keys.has(s.idempotencyKey))return {state:'ALREADY_RESERVED'};
      keys.add(s.idempotencyKey);
      return {...s,state:'RESERVED',reservationId:'reserve-1'};
    },
    assertCanonical:async()=>true,
    async recordCanonicalDispatch(r){receipts.push(r);return true;},
    readFile:p=>p.endsWith('endpoint.json')?JSON.stringify({protocol:1,port:41234,pid:123}):'fixture-token-longer-than-twenty',
    async request(url,req) {
      calls.push(req.method);
      if(req.method==='POST') {
        assert.deepEqual(JSON.parse(req.body),{messages:[{to:'worker-1',text:checkpoint.nextInstruction}],runId:family});
        return {status:202,json:async()=>({runId:family,queued:[{id:'aabbccdd',to:'worker-1'}]})};
      }
      return {status:200,json:async()=>({nativeBroker:{source:'chat-on-steroids-native-broker',
        localOwnerId:owner,runId:family,missionAck:false},runId:family,
        workers:[{id:'worker-1',state:'active',runId:family}],freeWorkerSlots:1,admissibleWorkerSlots:1,
        familyDirectory:{selectedFamilyId:family,selectionRequired:false,families:[{familyId:family,runId:family,running:true}]}})};
    }};
  return {opts,checkpoint,calls,keys,receipts};
}
test('resumes one exact checkpoint through native message, not a new worker or completion',async()=>{
  const x=fixture();const r=await resumeNativeCosCheckpoint(x.opts);
  assert.deepEqual(x.calls,['GET','POST','GET']);assert.equal(r.nativeMessageId,'aabbccdd');
  assert.equal(r.originalMissionId,mission);assert.equal(r.nextActionId,'action-2');
  assert.equal(r.receiverAcknowledged,false);assert.equal(r.canonicalMissionAck,false);
  assert.equal(x.receipts.length,1);assert.ok(!JSON.stringify(r).includes(x.checkpoint.nextInstruction));
});
test('lease, checkpoint or decision rotation does not change action deduplication',async()=>{
  const x=fixture();await resumeNativeCosCheckpoint(x.opts);
  Object.assign(x.checkpoint,{leaseId:'lease-b',checkpointId:'cp-2',decisionRevision:'decision-2'});
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/ALREADY_USED/);
  assert.equal(x.calls.filter(c=>c==='POST').length,1);assert.equal(x.keys.size,1);
});
for (const [label,change,code] of [
  ['foreign checkpoint',{checkpointMissionId:'umi-000000000000000000000000'},'CHECKPOINT_UNVERIFIED'],
  ['missing durable checkpoint',{canonicalCheckpointDurable:false},'CHECKPOINT_UNVERIFIED'],
  ['expired lease',{leaseFresh:false},'CHECKPOINT_UNVERIFIED'],
  ['unknown effect',{externalEffect:'unknown'},'PROVIDER_RECONCILIATION_REQUIRED'],
  ['provider conflict',{providerReadback:'conflict'},'PROVIDER_RECONCILIATION_REQUIRED'],
  ['repeat failure',{identicalFailureCount:2},'INCIDENT_CIRCUIT_OPEN'],
  ['same action',{nextActionId:'action-1'},'NEXT_ACTION_REQUIRED'],
  ['already complete',{missionComplete:true},'NEXT_ACTION_REQUIRED']
]) test(label+' holds without reservation or native write',async()=>{
  const x=fixture(change);await assert.rejects(resumeNativeCosCheckpoint(x.opts),new RegExp(code));
  assert.deepEqual(x.calls,[]);assert.equal(x.keys.size,0);
});
test('lost canonical reservation is not retried',async()=>{
  const x=fixture();x.opts.reserveCanonical=async()=>{throw Error('timeout')};
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/RESERVATION_UNKNOWN_EFFECT/);assert.deepEqual(x.calls,[]);
});
test('revoked canonical authority after reservation holds without native write',async()=>{
  const x=fixture();x.opts.assertCanonical=async()=>false;
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/RECONCILIATION_REQUIRED/);
  assert.deepEqual(x.calls,[]);assert.equal(x.keys.size,1);
});
test('lost native response remains reserved; no replay',async()=>{
  const x=fixture(),request=x.opts.request;
  x.opts.request=async(url,o)=>{if(o.method==='POST'){x.calls.push('POST');throw Error('timeout')}return request(url,o)};
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/RECONCILIATION_REQUIRED/);
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/ALREADY_USED/);
  assert.equal(x.calls.filter(c=>c==='POST').length,1);assert.equal(x.receipts.length,0);
});
test('missing or wrong message receipt never becomes a handoff',async()=>{
  const x=fixture(),request=x.opts.request;
  x.opts.request=async(url,o)=>{if(o.method==='POST'){x.calls.push('POST');return {status:202,json:async()=>({runId:family,queued:[{id:'wrong',to:'worker-1'}]})}}return request(url,o)};
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/RECONCILIATION_REQUIRED/);assert.equal(x.receipts.length,0);
});
test('uncertain canonical receipt keeps reservation and cannot resend',async()=>{
  const x=fixture();x.opts.recordCanonicalDispatch=async()=>false;
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/RECONCILIATION_REQUIRED/);
  await assert.rejects(resumeNativeCosCheckpoint(x.opts),/ALREADY_USED/);
  assert.equal(x.calls.filter(c=>c==='POST').length,1);
});

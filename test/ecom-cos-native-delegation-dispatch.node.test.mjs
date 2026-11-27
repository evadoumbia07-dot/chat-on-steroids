import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readNativeCosDelegationRequests} from '../scripts/ecom-cos-native-delegation.mjs';
import {dispatchApprovedNativeCosDelegation} from '../scripts/ecom-cos-native-delegation-dispatch.mjs';
const owner='11111111-1111-4111-8111-111111111111', family='22222222-2222-4222-8222-222222222222';
const token='fixture-token-for-delegation-only';
const row={id:'message-1',from:'worker-1',runId:family,text:'ECOM_DELEGATION_V1\n'+JSON.stringify({label:'Verifier',task:'Check evidence independently.'})};
async function fixture({allow=true,losePost=false,loseReceipt=false,denyReserve=false}={}){
 const b={source:'chat-on-steroids-native-broker',localOwnerId:owner,runId:family,missionAck:false};
 const calls=[], receipts=[], reservations=new Set();
 let spawned=false;
 const native={localOwnerId:owner,familyId:family,userDataPath:path.resolve('fixture'),
   readFile:file=>file.endsWith('endpoint.json')?JSON.stringify({protocol:1,pid:42,port:4242}):token,
   async request(url,opts){
     calls.push({url,method:opts.method});
     if(opts.method==='POST'){
       assert.deepEqual(JSON.parse(opts.body),{workers:[{label:'Verifier',task:'Check evidence independently.'}],runId:family});
       spawned=true;
       if(losePost)throw Error('unknown');
       return {status:202,json:async()=>({runId:family,workers:[{id:'worker-2'}]})};
     }
     if(url.includes('/reports?')) return {status:200,json:async()=>({nativeBroker:b,messages:[row]})};
     return {status:200,json:async()=>({nativeBroker:b,runId:family,retainedHistory:false,freeWorkerSlots:2,admissibleWorkerSlots:1,
       familyDirectory:{selectedFamilyId:family,selectionRequired:false,families:[{familyId:family,runId:family,running:true}]},
       workers:[{id:'worker-1',state:'active',runId:family},...(spawned?[{id:'worker-2',state:'invited',runId:family}]:[])]})};
   }};
 const proposal=(await readNativeCosDelegationRequests(native)).proposals[0];
 return {calls,receipts,options:{...native,originalMissionId:'umi-'+'a'.repeat(24),leaseId:'fixture-lease',canonicalRevision:'fixture-revision',
   reportId:proposal.reportId,proposalDigest:proposal.proposalDigest,
   async reserveCanonical(scope){
     if(denyReserve||reservations.has(scope.idempotencyKey))return {state:'DENIED'};
     reservations.add(scope.idempotencyKey);
     return {state:'RESERVED',reservationId:'fixture-reservation',idempotencyKey:scope.idempotencyKey,proposalDigest:scope.proposalDigest};
   },
   async assertCanonical(scope){assert.equal(scope.parentWorkerId,'worker-1');return allow;},
   async recordCanonicalDispatch(receipt){receipts.push(receipt);return !loseReceipt;}
 }};
}
test('only one approved child is dispatched and durable receipt retains parent identity',async()=>{
 const x=await fixture(); const receipt=await dispatchApprovedNativeCosDelegation(x.options);
 assert.equal(receipt.parentWorkerId,'worker-1');
 assert.equal(receipt.childWorkerId,'worker-2');
 assert.equal(receipt.canonicalMissionAck,false);
 assert.equal(x.receipts.length,1);
 await assert.rejects(dispatchApprovedNativeCosDelegation(x.options),/RESERVATION_REQUIRED_OR_ALREADY_USED/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
});
test('unapproved, tampered or revoked proposals cannot dispatch',async()=>{
 for(const kind of ['denyReserve','allow','tamper']){
   const x=await fixture(kind==='allow'?{allow:false}:kind==='denyReserve'?{denyReserve:true}:{});
   if(kind==='tamper')x.options.proposalDigest='0'.repeat(64);
   await assert.rejects(dispatchApprovedNativeCosDelegation(x.options));
   assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 }
});
test('unknown native effect or missing canonical receipt holds reservation, no replay',async()=>{
 for(const opts of [{losePost:true},{loseReceipt:true}]){
   const x=await fixture(opts);
   await assert.rejects(dispatchApprovedNativeCosDelegation(x.options),/RECONCILIATION_REQUIRED/);
   await assert.rejects(dispatchApprovedNativeCosDelegation(x.options),/RESERVATION_REQUIRED_OR_ALREADY_USED/);
   assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 }
});

test('broker rotation after proposal approval cannot dispatch on the new incarnation',async()=>{
 const x=await fixture();
 let rotated=false;
 const read=x.options.readFile, reserve=x.options.reserveCanonical;
 x.options.readFile=file=>rotated&&file.endsWith('endpoint.json')
   ?JSON.stringify({protocol:1,pid:43,port:4243}):read(file);
 x.options.reserveCanonical=async scope=>{const r=await reserve(scope);rotated=true;return r;};
 await assert.rejects(dispatchApprovedNativeCosDelegation(x.options),/RECONCILIATION_REQUIRED/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,0);
 assert.equal(x.receipts.length,0);
});
test('broker rotation after native POST holds reservation and does not record an unverified receipt',async()=>{
 const x=await fixture();
 let rotated=false;
 const read=x.options.readFile, request=x.options.request;
 x.options.readFile=file=>rotated&&file.endsWith('endpoint.json')
   ?JSON.stringify({protocol:1,pid:43,port:4243}):read(file);
 x.options.request=async(url,opts)=>{const r=await request(url,opts);if(opts.method==='POST')rotated=true;return r;};
 await assert.rejects(dispatchApprovedNativeCosDelegation(x.options),/RECONCILIATION_REQUIRED/);
 assert.equal(x.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(x.receipts.length,0);
});

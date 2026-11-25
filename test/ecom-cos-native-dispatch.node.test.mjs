import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { dispatchNativeCosWorker } from '../scripts/ecom-cos-native-dispatch.mjs';
const owner='11111111-1111-4111-8111-111111111111', run='22222222-2222-4222-8222-222222222222';
const token='safe-test-token-with-at-least-twenty-chars';
const worker={id:'worker-1',state:'invited',runId:run};
function fixture({existing=false,failPost=false,denyAt=0}={}) {
  let launched=existing, checks=0;
  const calls=[];
  const options={localOwnerId:owner,familyId:existing?run:null,userDataPath:path.resolve('test-profile'),
    action:'spawn',payload:{workers:[{task:'Approved test'}]},
    async assertCanonical(scope) { assert.equal(scope.localOwnerId,owner); return ++checks!==denyAt; },
    readFile(p){return p.endsWith('endpoint.json')?JSON.stringify({protocol:1,port:41234,pid:123}):token;},
    async request(url,opts){
      calls.push({url,method:opts.method});
      if(opts.method==='POST'){
        if(failPost) throw Error('network');
        launched=true;
        assert.equal(JSON.parse(opts.body).runId,existing?run:undefined);
        return {status:202,json:async()=>({runId:run,workers:[worker]})};
      }
      return {status:200,json:async()=>({nativeBroker:{source:'chat-on-steroids-native-broker',localOwnerId:owner,
        runId:launched?run:null,missionAck:false},runId:launched?run:null,workers:launched?[worker]:[],
        retainedHistory:false,freeWorkerSlots:2,admissibleWorkerSlots:1,
        familyDirectory:{selectedFamilyId:launched?run:null,selectionRequired:false,
          families:launched?[{familyId:run,runId:run,running:true}]:[]}})};
    }
  };
  return {calls,options};
}
test('trusted controller can dispatch without a conversation and verify native family',async()=>{
  const {calls,options}=fixture();
  const r=await dispatchNativeCosWorker(options);
  assert.equal(r.state,'DISPATCHED');
  assert.equal(r.familyId,run);
  assert.deepEqual(calls.map(c=>c.method),['GET','POST','GET']);
  assert.equal(r.canonicalMissionAck,false);
  assert.ok(!JSON.stringify(r).includes(token));
});
test('same stable family can receive approved additional work',async()=>{
  const {calls,options}=fixture({existing:true});
  const r=await dispatchNativeCosWorker(options);
  assert.equal(r.familyId,run);
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
});
test('no canonical lease or existing family ambiguity means no POST',async()=>{
  const x=fixture({denyAt:2});
  await assert.rejects(dispatchNativeCosWorker(x.options),/ECOM_CANONICAL_DISPATCH_DENIED/);
  assert.ok(x.calls.every(c=>c.method==='GET'));
  const y=fixture({existing:true});y.options.familyId=null;
  await assert.rejects(dispatchNativeCosWorker(y.options),/COS_NATIVE_FAMILY_RECONCILIATION_REQUIRED/);
  assert.ok(y.calls.every(c=>c.method==='GET'));
});
test('lost POST is unknown effect, never a retry',async()=>{
  const {calls,options}=fixture({failPost:true});
  await assert.rejects(dispatchNativeCosWorker(options),/COS_NATIVE_DISPATCH_UNKNOWN_EFFECT/);
  assert.equal(calls.filter(c=>c.method==='POST').length,1);
});

import { describe, expect, it, vi } from 'vitest';
import { ecomWorkerAdmission } from '../src/main/ecom-os-admission-adapter.js';
import type { EcomAdmission } from '../src/shared/ecom-os-admission.js';
const approved: EcomAdmission = {originalMissionId:'umi-abc',requestedMissionId:'umi-abc',leaseMissionId:'umi-abc',leaseFresh:true,canonicalRevisionMatches:true,ownerApproved:true,capacityAllowed:true,writerFenced:true,externalEffect:'none'};
describe('CoS canonical admission adapter',()=>{
  it('accepts a fresh controller snapshot at both barriers',async()=>{
    const readCurrent=vi.fn(async()=>approved);const assertCurrent=vi.fn(()=>approved);
    const gate=ecomWorkerAdmission({readCurrent,assertCurrent});
    await gate.validate();gate.assertCurrent();expect(readCurrent).toHaveBeenCalledOnce();expect(assertCurrent).toHaveBeenCalledOnce();
  });
  it('denies saturated capacity at asynchronous barrier',async()=>{
    const gate=ecomWorkerAdmission({readCurrent:async()=>({...approved,capacityAllowed:false}),assertCurrent:()=>approved});
    await expect(gate.validate()).rejects.toThrow('RESOURCE_ADMISSION_DENIED');
  });
  it('denies revoked fencing at synchronous commit barrier',()=>{
    const gate=ecomWorkerAdmission({readCurrent:async()=>approved,assertCurrent:()=>({...approved,writerFenced:false})});
    expect(()=>gate.assertCurrent()).toThrow('WRITER_FENCING_UNVERIFIED');
  });
  it('fails closed when the canonical controller is unreachable', async()=>{
    const gate=ecomWorkerAdmission({readCurrent:async()=>{throw new Error('CONTROLLER_OFFLINE');},assertCurrent:()=>{throw new Error('CONTROLLER_OFFLINE');}});
    await expect(gate.validate()).rejects.toThrow('CONTROLLER_OFFLINE');
    expect(()=>gate.assertCurrent()).toThrow('CONTROLLER_OFFLINE');
  });
  it('rejects a revision that changed between the two barriers',async()=>{
    const gate=ecomWorkerAdmission({readCurrent:async()=>approved,assertCurrent:()=>({...approved,canonicalRevisionMatches:false})});
    await gate.validate();
    expect(()=>gate.assertCurrent()).toThrow('STALE_CANONICAL_REVISION');
  });
  it('denies lost canonical lease at synchronous commit barrier',()=>{
    const gate=ecomWorkerAdmission({readCurrent:async()=>approved,assertCurrent:()=>({...approved,leaseFresh:false})});
    expect(()=>gate.assertCurrent()).toThrow('NO_FRESH_CANONICAL_LEASE');
  });
});

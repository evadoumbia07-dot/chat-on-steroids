import { describe, expect, it } from 'vitest'
import { decideRecovery, type RecoveryEvidence } from '../src/shared/ecom-os-recovery'
const base: RecoveryEvidence = {originalMissionId:'umi-1dad2d3f3ec2246cdc39daa7',checkpointMissionId:'umi-1dad2d3f3ec2246cdc39daa7',idempotencyKey:'action-1',leaseFresh:true,canonicalCheckpointDurable:true,externalEffect:'none',providerReadback:'not_required',identicalFailureCount:0}
describe('canonical ECOM OS incident recovery',()=>{
  it('resumes only with safe evidence',()=>expect(decideRecovery(base)).toBe('RESUME_FROM_CHECKPOINT'))
  it.each([
    [{checkpointMissionId:'umi-other'},'INVALID_CHECKPOINT'],
    [{idempotencyKey:''},'INVALID_CHECKPOINT'],
    [{canonicalCheckpointDurable:false},'INVALID_CHECKPOINT'],
    [{leaseFresh:false},'WAIT_FOR_CANONICAL_LEASE'],
    [{identicalFailureCount:2},'OPEN_INCIDENT_CIRCUIT'],
    [{externalEffect:'unknown'},'RECONCILE_PROVIDER'],
    [{externalEffect:'confirmed'},'RECONCILE_PROVIDER'],
    [{externalEffect:'confirmed',providerReadback:'matched'},'RESUME_FROM_CHECKPOINT'],
    [{providerReadback:'conflict'},'RECONCILE_PROVIDER']
  ] as const)('decides %o', (change,expected)=>expect(decideRecovery({...base,...change})).toBe(expected))
})

import { describe, expect, it } from 'vitest'
import { evaluateEcomAdmission, type EcomAdmission } from '../src/shared/ecom-os-admission'
const safe: EcomAdmission = {
  originalMissionId: 'umi-1dad2d3f3ec2246cdc39daa7', requestedMissionId: 'umi-1dad2d3f3ec2246cdc39daa7',
  leaseMissionId: 'umi-1dad2d3f3ec2246cdc39daa7', leaseFresh: true,
  canonicalRevisionMatches: true, ownerApproved: true, capacityAllowed: true,
  writerFenced: true, externalEffect: 'none'
}
describe('ECOM OS canonical admission', () => {
  it('admits only the fully proven state', () => expect(evaluateEcomAdmission(safe).allowed).toBe(true))
  it.each([
    [{requestedMissionId:'umi-other'}, 'MISSION_IDENTITY_MISMATCH'],
    [{leaseFresh:false}, 'NO_FRESH_CANONICAL_LEASE'],
    [{leaseMissionId:'umi-other'}, 'NO_FRESH_CANONICAL_LEASE'],
    [{canonicalRevisionMatches:false}, 'STALE_CANONICAL_REVISION'],
    [{ownerApproved:false}, 'OWNER_AUTHORIZATION_REQUIRED'],
    [{writerFenced:false}, 'WRITER_FENCING_UNVERIFIED'],
    [{externalEffect:'unknown'}, 'EXTERNAL_READBACK_REQUIRED'],
    [{capacityAllowed:false}, 'RESOURCE_ADMISSION_DENIED']
  ] as const)('denies %o', (change, reason) => {
    expect(evaluateEcomAdmission({...safe,...change})).toEqual({allowed:false,reason})
  })
})

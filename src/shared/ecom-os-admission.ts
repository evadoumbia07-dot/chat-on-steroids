/** Fail-closed admission for CoS workers leased by the canonical ECOM OS controller.
 * This module is pure: it never creates a second scheduler, lease or database.
 */
export type EcomAdmission = {
  originalMissionId: string
  requestedMissionId: string
  leaseMissionId: string | null
  leaseFresh: boolean
  canonicalRevisionMatches: boolean
  ownerApproved: boolean
  capacityAllowed: boolean
  writerFenced: boolean
  externalEffect: 'none' | 'known' | 'unknown'
}
export type EcomAdmissionDecision = { allowed: boolean; reason: string }
export function evaluateEcomAdmission(a: EcomAdmission): EcomAdmissionDecision {
  if (!/^umi-[a-z0-9]+$/.test(a.originalMissionId) || a.requestedMissionId !== a.originalMissionId)
    return { allowed: false, reason: 'MISSION_IDENTITY_MISMATCH' }
  if (a.leaseMissionId !== a.originalMissionId || !a.leaseFresh)
    return { allowed: false, reason: 'NO_FRESH_CANONICAL_LEASE' }
  if (!a.canonicalRevisionMatches) return { allowed: false, reason: 'STALE_CANONICAL_REVISION' }
  if (!a.ownerApproved) return { allowed: false, reason: 'OWNER_AUTHORIZATION_REQUIRED' }
  if (!a.writerFenced) return { allowed: false, reason: 'WRITER_FENCING_UNVERIFIED' }
  if (a.externalEffect === 'unknown') return { allowed: false, reason: 'EXTERNAL_READBACK_REQUIRED' }
  if (!a.capacityAllowed) return { allowed: false, reason: 'RESOURCE_ADMISSION_DENIED' }
  return { allowed: true, reason: 'CANONICAL_ADMISSION_OK' }
}

/** Pure decision gate for resuming an ECOM OS-owned action after CoS interruption.
 * No provider mutation occurs here; the canonical controller owns the lease and journal.
 */
export interface RecoveryEvidence {
  originalMissionId: string
  checkpointMissionId: string
  idempotencyKey: string
  leaseFresh: boolean
  canonicalCheckpointDurable: boolean
  externalEffect: 'none' | 'confirmed' | 'unknown'
  providerReadback: 'not_required' | 'matched' | 'missing' | 'conflict'
  identicalFailureCount: number
}
export type RecoveryDecision = 'RESUME_FROM_CHECKPOINT' | 'RECONCILE_PROVIDER' | 'OPEN_INCIDENT_CIRCUIT' | 'WAIT_FOR_CANONICAL_LEASE' | 'INVALID_CHECKPOINT'
export function decideRecovery(e: RecoveryEvidence): RecoveryDecision {
  if (!/^umi-[a-z0-9]+$/.test(e.originalMissionId) || e.originalMissionId !== e.checkpointMissionId || !e.idempotencyKey.trim() || !e.canonicalCheckpointDurable) return 'INVALID_CHECKPOINT'
  if (!e.leaseFresh) return 'WAIT_FOR_CANONICAL_LEASE'
  if (e.identicalFailureCount >= 2) return 'OPEN_INCIDENT_CIRCUIT'
  if (e.externalEffect === 'unknown' || e.providerReadback === 'missing' || e.providerReadback === 'conflict') return 'RECONCILE_PROVIDER'
  if (e.externalEffect === 'confirmed' && e.providerReadback !== 'matched') return 'RECONCILE_PROVIDER'
  return 'RESUME_FROM_CHECKPOINT'
}

import { evaluateEcomAdmission, type EcomAdmission } from '../shared/ecom-os-admission.js';
import { decideRecovery, type RecoveryEvidence } from '../shared/ecom-os-recovery.js';

/** Opaque identity tokens supplied by the authenticated canonical host, not by model text.
 * The host must normalize its actual lease and revision identifiers into these strings.
 */
export type EcomAdmissionSnapshot = EcomAdmission & { leaseId: string; canonicalRevision: string };

/** A canonical controller provides a fresh snapshot for each admission barrier.
 * This adapter never synthesizes a lease or permits an offline fallback.
 */
export interface EcomAdmissionSource {
  readCurrent(): Promise<EcomAdmissionSnapshot>;
  assertCurrent(): EcomAdmissionSnapshot;
}

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

export function ecomWorkerAdmission(source: EcomAdmissionSource) {
  // Scope this pin to ONE admission transaction, never a global mission registry.
  let pinned: readonly [string, string, string] | undefined;
  const enforce = (evidence: EcomAdmissionSnapshot): void => {
    const result = evaluateEcomAdmission(evidence);
    if (!result.allowed) throw new Error(`ECOM_OS_ADMISSION_DENIED:${result.reason}`);
    if (!validIdentity(evidence.leaseId) || !validIdentity(evidence.canonicalRevision)) {
      throw new Error('ECOM_OS_ADMISSION_DENIED:CANONICAL_IDENTITY_REQUIRED');
    }
    const current = [evidence.originalMissionId, evidence.leaseId, evidence.canonicalRevision] as const;
    if (pinned && (pinned[0] !== current[0] || pinned[1] !== current[1] || pinned[2] !== current[2])) {
      throw new Error('ECOM_OS_ADMISSION_DENIED:CANONICAL_IDENTITY_CHANGED');
    }
    // Store scalar copies: a mutable source object cannot rewrite the original pin.
    pinned ??= current;
  };
  return {
    async validate(): Promise<void> { enforce(await source.readCurrent()); },
    assertCurrent(): void { enforce(source.assertCurrent()); }
  };
}
/** Return a decision, never a mutation; the controller must reconcile before dispatch. */
export function ecomRecoveryDecision(evidence: RecoveryEvidence) {
  return decideRecovery(evidence);
}

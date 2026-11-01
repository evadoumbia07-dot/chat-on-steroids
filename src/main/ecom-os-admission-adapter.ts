import { evaluateEcomAdmission, type EcomAdmission } from '../shared/ecom-os-admission.js';
import { decideRecovery, type RecoveryEvidence } from '../shared/ecom-os-recovery.js';

/** A canonical controller provides a fresh snapshot for each admission barrier.
 * This adapter never synthesizes a lease or permits an offline fallback.
 */
export interface EcomAdmissionSource {
  readCurrent(): Promise<EcomAdmission>;
  assertCurrent(): EcomAdmission;
}
export function ecomWorkerAdmission(source: EcomAdmissionSource) {
  const enforce = (evidence: EcomAdmission): void => {
    const result = evaluateEcomAdmission(evidence);
    if (!result.allowed) throw new Error(`ECOM_OS_ADMISSION_DENIED:${result.reason}`);
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

import type { AgentState } from './session.js';

/** Facts from exactly one authorized CoS broker family. No mission ACK. */
export interface NativeWorkerHealthInput {
  id: string;
  state: AgentState;
  pending: number;
  awaitingAck: number;
}

type WorkerAttentionReason = 'failed' | 'detached' | 'unacknowledged_messages';

/**
 * Summarize ONLY the workers returned by statusForCaller(). The CoS broker
 * owns these states. ECOM OS may observe them over the existing authenticated
 * local Control API but cannot use this telemetry to assert a lease, a model
 * result, an independent QA receipt or a canonical PostgreSQL mission ACK.
 */
export function summarizeNativeWorkerHealth(workers: readonly NativeWorkerHealthInput[]) {
  const health = {
    total: 0,
    invited: 0,
    active: 0,
    detached: 0,
    waking: 0,
    sleeping: 0,
    finished: 0,
    failed: 0,
    pendingMessages: 0,
    awaitingAckMessages: 0,
    attention: [] as Array<{ workerId: string; reason: WorkerAttentionReason }>
  };
  for (const worker of workers) {
    health.total += 1;
    health[worker.state] += 1;
    health.pendingMessages += Number.isSafeInteger(worker.pending) && worker.pending > 0 ? worker.pending : 0;
    health.awaitingAckMessages += Number.isSafeInteger(worker.awaitingAck) && worker.awaitingAck > 0 ? worker.awaitingAck : 0;
    if (worker.state === 'failed' || worker.state === 'detached') {
      health.attention.push({ workerId: worker.id, reason: worker.state });
    }
    if (worker.awaitingAck > 0) {
      health.attention.push({ workerId: worker.id, reason: 'unacknowledged_messages' });
    }
  }
  return health;
}

import { describe, expect, it } from 'vitest';
import { summarizeNativeWorkers } from '../src/main/control-workers.js';

describe('native owner-scoped worker attention', () => {
  it('points to genuine failed, detached and unacknowledged native worker IDs only', () => {
    const view = summarizeNativeWorkers([
      { id: 'worker-1', state: 'failed', pending: 0, awaitingAck: 2, revivable: false },
      { id: 'worker-2', state: 'detached', pending: 0, awaitingAck: 0, revivable: false },
      { id: 'worker-3', state: 'sleeping', pending: 1, awaitingAck: 1, revivable: true },
      { id: 'worker-4', state: 'waking', pending: 0, awaitingAck: 0, revivable: false }
    ], 7);
    expect(view.attention).toEqual([
      { workerId: 'worker-1', reasons: ['failed', 'unacknowledged_reports'] },
      { workerId: 'worker-2', reasons: ['detached'] },
      { workerId: 'worker-3', reasons: ['unacknowledged_reports'] }
    ]);
    expect(view.pendingMessages).toBe(1);
    expect(view.unacknowledgedReports).toBe(3);
    expect(view.revivableWorkers).toBe(1);
    expect(view.freeWorkerSlots).toBe(7);
    expect(view.missionAck).toBe(false);
    expect(view).not.toHaveProperty('umi');
  });

  it('does not invent attention for the broker owner with no current workers', () => {
    const view = summarizeNativeWorkers([], 8);
    expect(view.attention).toEqual([]);
    expect(view.workersTotal).toBe(0);
    expect(view.pendingMessages).toBe(0);
    expect(view.missionAck).toBe(false);
  });

  it('drops a native unacknowledged alert only when the broker reports zero outstanding receipts', () => {
    const previous = [{ id: 'worker-1', state: 'sleeping', pending: 0,
      awaitingAck: 1, revivable: true }];
    expect(summarizeNativeWorkers(previous, 7).attention).toHaveLength(1);
    expect(summarizeNativeWorkers([{ ...previous[0]!, awaitingAck: 0 }], 7).attention).toEqual([]);
  });
});

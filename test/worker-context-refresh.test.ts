import { describe, expect, it } from 'vitest';
import { readSleepingWorkerContexts } from '../src/main/worker-context-refresh.js';

describe('native CoS sleeping subagent refresh', () => {
  it('never reads more than four sessions at a time and returns the original order', async () => {
    const ids = Array.from({ length: 37 }, (_, i) => `native-worker-${i + 1}`);
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await readSleepingWorkerContexts(ids, async id => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, (37 - Number(id.split('-').at(-1))) % 7));
      inFlight--;
      return { id };
    });
    expect(maxInFlight).toBe(4);
    expect(inFlight).toBe(0);
    expect(result.map(row => row?.id)).toEqual(ids);
  });

  it('returns null only for failed session lookups and continues other workers', async () => {
    const result = await readSleepingWorkerContexts(['one', 'gone', 'three'], async id => {
      if (id === 'gone') throw new Error('session store unavailable');
      return id === 'one' ? { tokens: 42 } : null;
    });
    expect(result).toEqual([{ tokens: 42 }, null, null]);
  });

  it('does not touch a session source or launch an agent for an empty list', async () => {
    let calls = 0;
    expect(await readSleepingWorkerContexts([], async () => {
      calls++;
      return { tokens: 1 };
    })).toEqual([]);
    expect(calls).toBe(0);
  });
});

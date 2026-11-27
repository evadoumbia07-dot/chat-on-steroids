import { expect, it } from 'vitest';
import { UnifiedExecProcessManager, applyUnifiedExecEnv, MAX_OUTSTANDING_EXEC_RESULTS } from '../src/main/codex/unified-exec.js';
import {
  DEFAULT_MAX_BACKGROUND_TERMINAL_TIMEOUT_MS,
  MAX_UNIFIED_EXEC_PROCESSES
} from '../src/main/codex/unified-exec-constants.js';

const truncationPolicy = { kind: 'tokens' as const, tokens: 10_000 };

it('does not let a lock attempt barge ahead of an already queued waiter', async () => {
  const manager = new UnifiedExecProcessManager(DEFAULT_MAX_BACKGROUND_TERMINAL_TIMEOUT_MS);
  const processId = manager.allocateProcessId();
  const initial = manager.execCommand({
    command: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
    shellType: process.platform === 'win32' ? 'powershell' : 'bash',
    hookCommand: 'mutex handoff probe',
    processId,
    yieldTimeMs: 30_000,
    maxOutputTokens: undefined,
    truncationPolicy,
    cwd: process.cwd(),
    displayCwd: process.cwd(),
    env: applyUnifiedExecEnv(process.env),
    tty: false
  });

  try {
    const deadline = Date.now() + 2_000;
    while (!manager.listProcesses().some((entry) => entry.processId === processId)) {
      if (Date.now() >= deadline) throw new Error('process was not stored as live');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const entry = (manager as any).processes.get(processId);
    const mutex = entry.process.interactionLock as {
      lock(): Promise<() => void>;
      tryLock(): (() => void) | null;
    };

    const releaseFirst = await mutex.lock();
    const queuedSecond = mutex.lock();
    releaseFirst();

    // No await here on purpose: this is the exact handoff gap where a queued waiter already
    // exists but its continuation has not run yet. Tokio's try_lock cannot barge ahead of it.
    const stolen = mutex.tryLock();
    stolen?.();
    expect(stolen).toBeNull();

    const releaseSecond = await queuedSecond;
    releaseSecond();
  } finally {
    await manager.terminateProcess(processId);
    await initial.catch(() => undefined);
    await manager.terminateAllProcesses();
  }
});

it('frees a live slot automatically while preserving the completed unread result and hard live cap', async () => {
  const manager = new UnifiedExecProcessManager(DEFAULT_MAX_BACKGROUND_TERMINAL_TIMEOUT_MS);
  const unreadId = manager.allocateProcessId();
  const request = (processId: number, command: string, yieldTimeMs: number) => ({
    command: [process.execPath, '-e', command],
    shellType: process.platform === 'win32' ? ('powershell' as const) : ('bash' as const),
    hookCommand: 'capacity obligation probe',
    processId,
    yieldTimeMs,
    maxOutputTokens: undefined,
    truncationPolicy,
    cwd: process.cwd(),
    displayCwd: process.cwd(),
    env: applyUnifiedExecEnv(process.env),
    tty: false
  });
  const fillerIds: number[] = [];
  const released = new Set<number>();
  manager.setProcessReleaseListener(id => released.add(id));

  try {
    const started = await manager.execCommand(
      request(unreadId, "setTimeout(() => { console.log('owed-output'); process.exit(7); }, 500)", 100)
    );
    expect(started.processId).toBe(unreadId);
    // A real child: a loaded full-suite run can start Node later than expect.poll's 1 s default allows.
    await expect.poll(() => manager.backgroundState(new Set([unreadId])).exitedUnread, { timeout: 10_000 }).toEqual([
      { processId: unreadId, exitCode: 7 }
    ]);

    while (fillerIds.length < MAX_UNIFIED_EXEC_PROCESSES - 1) fillerIds.push(manager.allocateProcessId());
    const admittedId = manager.allocateProcessId();
    const admitted = await manager.execCommand(request(admittedId, "setInterval(() => {}, 1000)", 100));
    expect(admitted.processId).toBe(admittedId);
    const refusedId = manager.allocateProcessId();
    await expect(manager.execCommand(request(refusedId, "console.log('must-not-run')", 100))).rejects.toThrow(
      `too many live or draining terminal sessions (limit ${MAX_UNIFIED_EXEC_PROCESSES})`
    );
    // The detached unread ID is still reserved for the exact original owner.
    const used = new Set([unreadId, admittedId, refusedId, ...fillerIds]);
    let freshId = 1000;
    while (used.has(freshId)) freshId++;
    const draws = [unreadId, freshId];
    expect(manager.allocateProcessId(() => draws.shift()!)).toBe(freshId);
    manager.releaseProcessId(freshId);

    expect(manager.backgroundState(new Set([unreadId])).exitedUnread).toEqual([
      { processId: unreadId, exitCode: 7 }
    ]);
    expect(released.has(unreadId)).toBe(false);
    const drained = await manager.writeStdin({
      processId: unreadId,
      input: '',
      yieldTimeMs: 250,
      maxOutputTokens: undefined,
      truncationPolicy
    });
    expect(drained.rawOutput.toString('utf8')).toContain('owed-output');
    expect(drained.exitCode).toBe(7);
  } finally {
    for (const processId of fillerIds) manager.releaseProcessId(processId);
    await manager.terminateAllProcesses();
  }
});

it('bounds all outstanding reservations even if completed output must still be preserved', async () => {
  const manager = new UnifiedExecProcessManager(DEFAULT_MAX_BACKGROUND_TERMINAL_TIMEOUT_MS);
  try {
    for (let i=0; i<MAX_OUTSTANDING_EXEC_RESULTS; i++) manager.allocateProcessId();
    const id=manager.allocateProcessId();
    await expect(manager.execCommand({
      command:[process.execPath,'-e','throw Error("must not run")'],
      shellType:process.platform==='win32'?'powershell':'bash',hookCommand:'backlog limit probe',
      processId:id,yieldTimeMs:250,maxOutputTokens:undefined,truncationPolicy,cwd:process.cwd(),
      displayCwd:process.cwd(),env:applyUnifiedExecEnv(process.env),tty:false
    })).rejects.toThrow(`too many outstanding terminal results (limit ${MAX_OUTSTANDING_EXEC_RESULTS})`);
  } finally { await manager.terminateAllProcesses(); }
});

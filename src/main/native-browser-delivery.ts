/** Pure projection of the existing bridge queue, never an executor or a retry policy. */
export type BrowserCommandObservation = {
  runId: string; workerId: string; kind: 'worker' | 'revive';
  claimed: boolean; held: boolean; hasError: boolean;
};

export function nativeBrowserDelivery(input: {
  runId: string | null;
  workers: readonly { id: string; state: string }[];
  bridgeRunning: boolean;
  recentBrowser: boolean;
  wakeConnected: boolean;
  commands: readonly BrowserCommandObservation[];
}) {
  const reachability = !input.bridgeRunning ? 'bridge_stopped'
    : input.wakeConnected ? 'wake_connected'
    : input.recentBrowser ? 'recent_http_only' : 'browser_unseen';
  const waiting = input.workers.filter(w => w.state === 'invited' || w.state === 'waking');
  return {
    source: 'native-bridge-queue' as const,
    runId: input.runId,
    reachability,
    workers: waiting.map(w => {
      const expectedKind = w.state === 'invited' ? 'worker' : 'revive';
      const matches = input.runId === null ? [] : input.commands.filter(c =>
        c.runId === input.runId && c.workerId === w.id && c.kind === expectedKind);
      const command = matches.length === 1 ? matches[0] : undefined;
      const delivery = matches.length > 1 ? 'ambiguous'
        : !command ? 'not_observed'
        : command.held ? 'send_held'
        : command.claimed ? 'claimed'
        : 'queued';
      return { workerId: w.id, delivery, hasError: command?.hasError === true };
    }),
    missionAck: false as const
  };
}

/** An authenticated idle extension is just as reachable as a recent HTTP request.
 * A launch window never forces a connected browser to wait for a ChatGPT page.
 */
export function nativeBrowserLaunchPending(input: {
  recentBrowser: boolean; wakeConnected: boolean;
  lastLaunchAt: number; now: number; graceMs: number;
}): boolean {
  return !input.recentBrowser && !input.wakeConnected &&
    input.lastLaunchAt > 0 && input.now < input.lastLaunchAt + input.graceMs;
}

/** Only work with no opening lease may be considered by the existing delivery pump. */
export function nativeReconnectNeedsDelivery(input: {
  running: boolean; recovering: boolean; wakeConnected: boolean;
  commands: readonly { kind: string; claimedAt: number | null }[];
}): boolean {
  return input.running && !input.recovering && input.wakeConnected &&
    input.commands.some(c => c.claimedAt === null && (c.kind === 'worker' || c.kind === 'resume'));
}

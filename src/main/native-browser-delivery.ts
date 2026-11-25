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

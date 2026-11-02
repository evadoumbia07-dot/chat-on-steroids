# Native Chat On Steroids 2.1.49 — bounded sleeping-worker refresh

This patch is built **inside the owner's fork of the original CoS source**,
not in a new ECOM OS agent scheduler. CoS remains the native broker for
spawn, message, Goal/Loop, status, and worktree ownership.

## Change

The existing `measureSleepingWorkers` read one sleeping worker's persisted
session at a time before a status read or wake. When many native CoS
sub-agents were parked, a slow session lookup delayed every subsequent
worker. `readSleepingWorkerContexts` now performs at most **four read-only
lookups simultaneously**, preserving the original broker order when
applying context-token measurements.

The original fail-closed behavior remains intact: failed session lookups
do not invent token measurements, and the existing mandatory
`persistCriticalSwarmNow()` barrier still runs after measurements and
before returning the state. There are no new workers, models, tasks,
execution permissions, queues, token stores, external API calls, or
independent PostgreSQL ACK.

## Proof required before production

- Unit test proves 37 sleeping workers never cause more than 4 concurrent
  metadata reads, the resulting order matches the input, failed reads stay
  null, and empty batches perform no work.
- Existing owner-scoped Control API worker test suite must remain green.
- CoS source typecheck and owner-fork CI must pass.
- A reviewed build must be installed in the **existing** CoS application
  and verified against real native broker sessions before claiming this
  optimization is deployed on the user's PC or VPS.

ECOM OS consumes owner-scoped native CoS receipts. It must not claim a
CoS worker as its own agent, create a second orchestrator, or treat native
status as an independent original-H24 PostgreSQL mission ACK.

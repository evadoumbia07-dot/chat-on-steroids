# ECOM CoS — the actual Chat On Steroids, extended

## Source and ownership

This product is a **source fork** of the real Chat On Steroids desktop
application, not a reimplementation of its Goal, Loop or sub-agent broker.

- Upstream: https://github.com/totec448-spec/chat-on-steroids
- Verified source baseline: tag `v2.1.49`, commit
  `9413250acc851314da7aa35d4e6745d477bcc8e7`.
- The owner's installed Windows CoS reports `2.1.49` and retains its own
  application profile, conversations, native sessions and secure credentials.
- License: **MIT**. Preserve the original `LICENSE`, notices and authorship.
- Keep an `upstream` Git remote for explicit review of later releases.

## Non-negotiable product contract

1. **Keep original CoS.** Preserve the Electron app, renderer/UI, browser
   extension, native Core/Plugin/Desktop MCP tools, multi-agent broker,
   per-worker sessions, sleeping/reusable workers, Compact & Resume, Goal,
   Loop, project/worktree isolation and existing settings.
2. **Improve the native product.** Better agent delegation, bounded real
   concurrency, one prime/worker owner per run, durable worker receipts,
   recovery after crash, transparent pause/stop, and concise attribution.
   Enhance the original CoS implementations and their tests; never replace
   them with a second imitation broker.
3. **ECOM OS is the central supervisor**, not an alternate CoS implementation.
   The existing ECOM OS Control Center and canonical PostgreSQL 18 registry
   own ECOM missions, priorities, authorization, business checkpoints and
   independent QA/ACK. Native CoS continues to own its local conversations,
   sub-agent identities, worker life cycles and authenticated Control API.
   Cross-system bindings use explicit, verifiable native IDs.
4. **Deployment topology:** PulseHeberg VPS is the active ECOM OS primary;
   the current Windows PC runs its installed CoS plus an ECOM worker.
   Google Cloud is the fenced standby. Do not activate a competing Cloud
   PostgreSQL writer, shadow scheduler, duplicate worker identity or queue.
5. **Safety:** no account hopping, quota bypass, permission bypass, blind
   replays, arbitrary browser/desktop access, secret copying or unattended
   paid API calls. Existing CoS Control API remains loopback-only, random
   token authenticated and bound by its explicit action permission.
6. **No invented success:** GitHub merge, installation, worker registration,
   Goal/Loop code and passing tests are distinct from an actual worker claim,
   heartbeat, durable checkpoint, restart readback, independent verifier
   and final canonical PostgreSQL ACK. Keep the existing original H24
   mission ID `umi-1dad2d3f3ec2246cdc39daa7`.

## Integration approach (no new orchestrator)

CoS already exposes its native, authorized, local Control API:

- `GET /v1/workers/{localOwnerId}` — native run and worker status.
- `GET /v1/workers/{localOwnerId}/reports` — owner-scoped reports.
- `POST /v1/workers/{localOwnerId}/spawn|message|ack` — existing broker
  operations, gated behind CoS's own actions switch and authentication.

ECOM OS must observe these **existing** routes through an authorized local
adapter, retain a binding between the **actual** CoS
`localOwnerId/runId/workerId` and its original `umi-...`, and delegate
only work admitted by the existing canonical backend. No arbitrary
ChatGPT conversation identifier is guessed; a native `AGENTS_NO_CHAT`
result is not permission to spawn another run.

### Owner-scoped native sub-agent health

The original CoS `GET /v1/workers/{localOwnerId}` status now includes a
backwards-compatible `health` summary calculated from **only the current
authenticated owner's broker family**. It counts invited/active/detached/
waking/sleeping/finished/failed workers, message backlog and messages
awaiting acknowledgement. `attention` identifies failed, detached and
unacknowledged workers by their **native worker ID**, never a guessed ECOM
mission identity. Other owners' agents are not included. This is a
read-only projection: no additional queue, scheduler, terminal or worker
is created, and a CoS status must never be treated as a PostgreSQL ACK.

The dedicated `test/native-worker-health.node.test.mjs` uses built-in
Node test functionality and does not need a browser or API credential.
The authenticated Control API integration contract remains covered by
`test/control-api-workers.test.ts`, which needs the repository's normal
Vitest dependencies to run. Deploy only after those integrated tests,
existing native parity tests and a rollback-ready installation pass.

## Delivery phases

| Phase | Required proof |
| --- | --- |
| 0. Native source baseline | Verbatim upstream tag, source digest, MIT license and private fork confirmed |
| 1. Native CoS parity | Original Goal, Loop, Compact & Resume, browser extension and native worker tests still pass |
| 2. Improved sub-agents | Prime/worker identity, independent worker claim, bounded concurrency, honest status and recoverability verified |
| 3. ECOM OS binding | Authenticated native CoS IDs joined to original canonical mission without a second orchestrator |
| 4. Three environments | Windows and VPS services deployed from reviewed code; Cloud remains fenced until a safe failover exercise |
| 5. Real acceptance | Simultaneous authorized worker executions, Goal/Loop pause/resume/stop, restart readback, independent QA and original PostgreSQL ACK |

## Operational boundaries

Never update the installed production CoS executable merely because this
source fork exists. Build and test in a separate working tree. Before any
deployment, preserve the owner's installed version, original userData and
secure keys, have an explicit executable rollback and independently read back
the live service. In particular, the CoS native broker and ECOM OS canonical
supervisor have **different ownership boundaries**: neither may fabricate
an ACK on the other's behalf.

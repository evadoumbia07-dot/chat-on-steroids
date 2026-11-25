# Original Chat On Steroids → ECOM OS: native broker continuity

This work modifies **the actual Chat On Steroids source tree (v2.1.55 candidate)**, not
an independently reimplemented CoS clone. The original Electron user
interface, chat sessions, Goal/Loop control, agent lifecycle, model adapters,
browser tools and worker Git worktree isolation remain the foundation.
The original MIT license and notices must remain with any derivative.

## Single owner of each responsibility

| Concern | Existing owner | Integration boundary |
| --- | --- | --- |
| Worker/prime conversations, agent inbox, wake and retirement | Native CoS broker | Owner-authenticated `/v1/workers/:ownerId` |
| Worker launch, assignment, native reports, explicit report ACK | Native CoS broker | `spawn`, `message`, `reports`, `ack` |
| Goal/Loop behavior and CoS UI | Native CoS Electron application | Preserve current native controls |
| ECOM project/mission history, resources, durable business state | Existing ECOM OS PostgreSQL/Control Center | Reconcile actual native identity before linking |
| Independent project QA and canonical mission ACK | Existing authorized ECOM OS verifier | **Never** inferred from CoS messages or counts |

The CoS read endpoint now includes `nativeBroker` provenance and
`nativeSupervision`, both computed from the *selected owner-scoped native
broker state*. The new supervision counters report workers by native state,
free family slots, pending messages, reports awaiting acknowledgment and
revivable workers. No new registry, lease, worker, PostgreSQL writer or
scheduler is created by these projections. A parked run may have
`runId: null` in its current active-state view, while a specifically
requested and validated archived run retains its original ID in
`nativeBroker` on status and report reads. This prevents accidental misattribution during resume.

The same `nativeSupervision` object also provides `attention`: an ordered
list of **existing owner-scoped native worker IDs** with actual `failed`,
`detached` or `unacknowledged_reports` reasons in the current broker snapshot.
An ACK can clear the active snapshot's outstanding count, but parked runs
retain their separate report history through `/reports?runId=...`; an
archived report must not be fabricated as an active worker alert. Neither
operation implies ECOM OS mission verification. ECOM OS can display actionable subagent attention
without collecting another worker list, leaking conversation content,
guessing a chat ID, or claiming a PostgreSQL ACK.

**Use case:** ECOM OS can display native worker status and reconcile each
worker's actual report without guessing a ChatGPT conversation ID or
claiming that a green CoS agent implies an independently verified mission.

## Deployment and acceptance

1. Work on a reviewable branch of the real source repository. Do not alter
   the currently installed PC/VPS CoS binaries or copy their private profiles.
2. Run the native worker-control API regressions and TypeScript type check.
   Verify the original modes and tools remain present.
3. Build a reviewed derivative Electron application only after preserving
   the installed version, settings, update channel and rollback.
4. Pair its real native control endpoint with the **existing** ECOM OS
   mission adapter, with owner credentials and the native broker's verified
   IDs; do not invent conversation/session mapping.
5. Independently demonstrate native multi-worker execution, capacities,
   pause/resume/stop and restoration after a controlled restart before
   advertising these behaviors as fully operational in ECOM OS.
6. PulseHeberg remains the primary ECOM OS control plane. The PC is an
   optional registered worker. Google Cloud is stopped and excluded from this deployment.

Current source changes are **not a production CoS release**. A green native
unit test is a source-level checkpoint, not proof that the Windows or VPS
installed app has the enhanced counters, that a model account can run
unrestricted agents, or that the original ECOM mission received its
independent PostgreSQL ACK.

## Transaction identity continuity

The existing ECOM admission adapter pins the mission ID, actual canonical
lease ID and canonical revision at the first successful check of one
admission transaction. Both later asynchronous and synchronous barriers must
return the exact same tuple as well as pass the existing authorization,
fencing, capacity and reconciliation checks. A different valid mission or
replacement lease is a refusal, not an authorization to reuse a staged
worker. The trusted host must supply the real normalized lease and revision
identifiers; no fallback or fabricated identifiers are permitted. This is a
source-level gate, not evidence that a production host is wired to it.

## Durable local family address (without a ChatGPT prime)

The existing loopback Control API accepts the locally authenticated
controller's native owner UUID, not a browser conversation ID. Its status
now exposes an owner-scoped familyDirectory with the original stable
familyId, current incarnation runId, running state and explicit selection
requirement. It derives these values from the native broker's existing
persisted aliases. The read-only client verifies the selected family
before following a rotated incarnation. The host must retain its real
authorized owner ID and family address in the canonical controller.
No cross-owner adoption, guessed chat, extra queue or scheduler is allowed.
Browser-backed workers still need their authorized provider browser
session; this changes the prime's control identity, not the model provider.
A non-browser worker must use a separately authorized existing executor.

## Browser delivery diagnostics

The same authenticated worker status now includes browserDelivery, sampled
from the existing native bridge queue. It separates bridge stopped,
recent HTTP presence, authenticated wake connection and browser unseen.
For invited/waking workers it distinguishes not observed, queued,
claimed, send held and ambiguous commands using the exact current run
incarnation plus worker ID and command kind. Raw command text, URL,
error, tokens and foreign run data are not returned. These are observation
states, not delivery receipts or permission to retry an uncertain send.
No additional Chrome instance, Playwright worker or scheduler is started.

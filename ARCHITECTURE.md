# Architecture

CommitmentGuard is a **modular monolith**: one Next.js 16 App Router
application with strict internal layering. There is no runtime dependency on an
external database; the repository seam is where SQL (or Postgres) would slot
in. Every layer below is plain TypeScript with `zod` at the boundaries.

```
┌──────────────────────────────────────────────────────────────┐
│ App Router pages (RSC) + small client islands                 │
│   dashboard · compare wizard · analyses · consent · approvals │
│   executions (Kite panel) · receipts · benchmark · settings   │
└──────────────┬───────────────────────────────────────────────┘
               │ server calls only (no client-side secrets)
┌──────────────▼───────────────────────────────────────────────┐
│ Page data layer (src/lib/page)                                │
│   getPageContext() session+household+member; getHouseholdData()│
└──────────────┬───────────────────────────────────────────────┘
┌──────────────▼───────────────────────────────────────────────┐
│ Services (src/lib/services) — the fail-closed gatekeepers      │
│   intent · analysis · approval · execution · receipt · policy  │
└──────┬─────────────────┬──────────────────────────────────────┘
       │                 │
┌──────▼─────────┐  ┌─────▼────────────────────────────────────────┐
│ Integrations   │  │ Domain (src/lib/domain) — pure, deterministic │
│ serv/ kite/    │  │ engine · money · policy · evidence · schemas  │
└────────────────┘  └──────────────────────────────────────────────┘
       │                 │
┌──────▼─────────────────▼──────────────────────────────────────┐
│ Store (src/lib/store) — repository + driver seam               │
│   file (local JSON) | memory (serverless) | upstash (optional) │
└───────────────────────────────────────────────────────────────┘
```

## The one rule that shapes everything

> **An LLM may read, extract and explain. It never decides, never prices, and
> never relaxes a constraint.**

SERV Reasoning produces structured extractions and plain-language explanations.
The **decision** (allow / review / block), every money figure and every
constraint verdict comes from `src/lib/domain` — pure, synchronous, integer
arithmetic. Explanations are requested separately (`POST
/api/analyses/[id]/explanation`) so a SERV outage can never block or bias a
decision.

## The decision pipeline

1. **Intent extraction** — `POST /api/intents/extract` sends the plain-English
   request to SERV; the result is stored as an `IntentContract` versioned
   against the active household policy. The user must **confirm** the contract
   (`/api/intents/[id]/confirm`) before any analysis can run. If SERV is
   deliberately unconfigured, a clearly-labelled demo parser
   (`serv/demo-parser.ts`, source `demo_parser`) is used — never presented as
   live output.
2. **Offer extraction** — offer documents (uploaded, fetched or demo fixtures)
   are priced into `OfferTerms`. Each money-relevant field carries an evidence
   id; each evidence item carries a **verbatim quote** plus the source
   document's content hash.
3. **Evidence validation** — every quote is located in its source text and
   checked against other sources. `invalid` or `contradicted` evidence poisons
   approval downstream.
4. **Analysis** — `buildAnalysis()` (`domain/decision.ts`) computes 12/24-month
   totals in **integer minor units** (unknown fields leave the total `null`,
   never zero), produces `Consequence[]` (with explicit direction, severity and
   horizon), and calls `evaluateConstraints()` (`domain/policy.ts`) for the
   allow / review / block verdict. The analysis stores an `inputHash` over the
   exact snapshot it was computed from.
5. **Consent** — approval (`services/approval.service.ts`) re-derives the
   current input hash (`assertAnalysisCurrent`). Any change to the offer, the
   commitments ledger or evidence → `APPROVAL_STALE`, approval refused. An
   approval is bound to `analysisHash + offerVersion`, expires after **24
   hours**, records `acknowledgedConsequences` (every high/critical severity
   must be explicitly ticked — enforced server-side via
   `assertApprovalBasis`, not just in the UI), and writes an approval-stage
   receipt.
6. **Execution** — `services/execution.service.ts` re-verifies the full chain
   before touching money: current approval → allow decision → no unknowns →
   hash match → offer version → expiry → **caps** (per-tx ≤ session total ≤
   `KITE_MAX_*`) → no duplicate submission. Amounts are decimal-string USDC
   compared with a hand-rolled integer-safe comparator (`domain/money.ts`),
   never floats.
7. **Receipts** — every stage appends a `DecisionReceipt` with a canonical
   payload, a SHA-256 `contentHash` over that payload, and the **previous
   receipt's** hash. `verifyReceipt()` recomputes the hash from the payload and
   checks the chain link; the UI never trusts the stored hash.

## Fail-closed invariants

| Situation | Behaviour |
| --- | --- |
| SERV configured but failing | Extraction returns a typed error; no silent fallback |
| Unknown critical material term | Total stays `null`; outcome is review or block (per policy), never priced as 0 |
| Offer/ledger/evidence changed after analysis | `APPROVAL_STALE`; approval and execution refused |
| Approval older than 24h, or decision ≠ approve | Execution refused (`APPROVAL_EXPIRED` / `APPROVAL_REQUIRED`) |
| Session total > env cap | `KITE_BUDGET_EXCEEDED`; nothing executed |
| Expired/exhausted Kite session | Nothing executed (`KITE_SESSION_EXPIRED` / `EXHAUSTED`) |
| Second execution attempt | `EXECUTION_ALREADY_SUBMITTED` — duplicates are impossible by state, not by UI |
| Unknown error in an API route | Typed `INTERNAL_ERROR`, no crash detail leaked, no partial action |

## Screens (Blueprint §16 complete)

- Dashboard `/app` — household standing, recent decisions, demo fixtures
- Commitments `/app/commitments` (+ detail) — ledger, benefits, dependencies
- New comparison `/app/compare` — wizard: request → SERV extract → confirm →
  analyse
- Offer comparison `/app/compare/[intentId]` — three-way matrix with real
  computed totals and per-offer verdicts
- Consequence analysis `/app/analyses/[id]` — decision, consequences, totals,
  evidence validation, SERV explanation
- Consent review `/app/analyses/[id]/consent` — acknowledgement checklist
- Approvals `/app/approvals` (+ detail) — consent ledger, withdraw, start
  session
- Kite payment panel `/app/executions` (+ `/[id]`) — session state, caps,
  simulate/execute/cancel, adapter health
- Receipts `/app/receipts` (+ detail) — hash recompute, chain link, canonical
  payload
- Integrations `/app/integrations` — live SERV/Kite probes, payment limits,
  failure policy
- Benchmark `/app/benchmark` — the real 30-case runner, in-page
- Settings `/app/settings` — policy editor, audit log, export, demo reset

## Data model (core records)

`Household · HouseholdMember (roles: owner|approver|viewer) · Commitment ·
CommitmentBenefit · CommitmentDependency · Document · Evidence · Offer ·
IntentContract · Analysis · Approval · Execution · DecisionReceipt ·
AuditEvent · UserPolicy`

Every mutation writes an `AuditEvent` (actor type: user / system / agent /
provider). Full household export (`/api/households/[id]/export`) includes
receipts and audit events so the chain can be independently rechecked; session
tokens and secrets are never included.

## API surface (Blueprint §11)

49 route files, all following one pattern: authenticate (`requireSession`) →
verify household membership/role (`requireHouseholdAccess` /
`requireWritableHousehold`, viewer is read-only) → zod-validate the body →
delegate to a service (the only place writes happen) → respond, or map
`ApiError` to `{ error: { code, message, details? } }`. Dynamic (`[id]`) params
are always awaited as `Promise<...>` (Next 16 convention); `connection()` is
placed outside handler `try/catch` so the prerender bail-out propagates.

## Storage

`getDatabase()` / `mutateDatabase()` use the existing repository seam:

- `file` — local JSON at `.data/db.json` (default in dev; atomic rename writes)
- `memory` — per-process fallback for unconfigured demos; not reliable across
  serverless instances
- `upstash` — shared hosted demo state: every read fetches a fresh snapshot;
  mutations use atomic Lua compare-and-set, retrying database-only callbacks on
  conflicts. Storage errors fail closed instead of replacing data with seeds or
  reporting a successful write. The namespace is set by `UPSTASH_REDIS_KEY`.

Local mutations are serialized and edit a draft; the current snapshot is only
replaced after a successful write. Simulated Kite session records live in the
same database, not a process-global map. SERV/Kite calls remain outside mutation
callbacks. Execution reserves `submitted` atomically before calling an adapter,
preventing concurrent requests from both submitting.

`resetDatabase()` reseeds the Morgan household; the interface is the seam a SQL
repository would replace.

## Rendering model (Cache Components)

`next.config.ts` enables `cacheComponents` + `partialPrefetching`. The landing
page `/` is fully static but computes its Offer A block record **live from the
benchmark runner** at build time — the numbers on the landing page are the real
engine's output, not marketing copy. The authenticated `/app` segment exports
`instant = false` (a shared session-cookie layout cannot have an honest shared
static shell; blocking navigation is the truthful behaviour), so its routes
render dynamic or as partial-prerendered shells with dynamic content.
`/app/benchmark` calls `await connection()` before running so `randomUUID()`
timestamp/ids are request-time, never captured in a shell. `getPageContext()`
and `/login` also call `connection()` before decoding session expiry, so wall
clock checks are performed against a real request.

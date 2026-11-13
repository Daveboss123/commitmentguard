# Verification of the reviewer checklist

This document maps every item in the judge feedback to something a reviewer can
run or open. Nothing here is asserted because a receipt contains a hash-shaped
string: receipt verification recomputes each payload hash, re-links the analysis
hash to the stored analysis, and checks stage order and ancestry.

## Run it locally

```bash
npm install
npm test           # vitest: 9 files, 62 tests
npm run typecheck
npm run lint
```

The two suites that answer this review:

| File | What it proves |
| --- | --- |
| `src/lib/integrations/serv/__tests__/client.test.ts` | SERV request contract, schema validation, repair loop, bounded retries, provenance, and that model output can never carry a decision |
| `src/lib/services/__tests__/integrity.test.ts` | Execution-path bindings: offer version, approval expiry, session caps and expiry, duplicate submission, receipt content and chain |
| `src/lib/services/__tests__/workflow.test.ts` | Consent-time bindings, the adapter race, unknown outcomes, and receipt tamper/chain/stage/ancestry checks |

## The reviewer's seven checks

| Reviewer check | Expected result | Test that proves it |
| --- | --- | --- |
| User approves offer version 1 | Approval records version 1 | `integrity.test.ts` → "records the offer version at consent and refuses execution after the offer moves on" (asserts `approval.offerVersion === offer.offerVersion` before the change) |
| Offer changes to version 2 | Version 1 approval becomes invalid | Same test: bumps `offer.offerVersion`, then `startExecution` rejects `APPROVAL_STALE` and no execution or execution receipt exists |
| Execution with a stale approval | Rejected | Same test, plus `workflow.test.ts` → "scenario sandbox" stale-binding case and `approval.service` consent-time check |
| Kite session expires | Rejected | `integrity.test.ts` → "refuses to execute after the simulated Kite session expired" (`KITE_SESSION_EXPIRED`, no execution receipt, `externalReference: null`) |
| Payment exceeds the session limit | Rejected | `integrity.test.ts` → "refuses a session or per-transaction request above the server cap" (0.10 > 0.05 cap, per-tx > total) and "refuses an amount above the session's own cap at the adapter boundary" (`KITE_BUDGET_EXCEEDED` at the adapter) |
| Same payment submitted twice | Second submission rejected | `integrity.test.ts` → "submits the same payment once and rejects every repeat" (`EXECUTION_ALREADY_SUBMITTED` for both execute and a new session request; exactly one execution receipt); the concurrent case is in `workflow.test.ts` → "allows only one adapter call when two execute requests race" (spy: one adapter call) |
| Receipt data is modified | Verification fails | `integrity.test.ts` → "verifies a three-stage chain and fails when a middle receipt is altered" and "rejects a receipt that only has a hash-shaped value"; `workflow.test.ts` → tamper, preceding-payload and ancestry cases |

## P0: must verify

### 1. Actual SERV calls in the deployed workflow

- The hosted probe is a live SERV call and needs no login:
  `curl -s "https://trycommit.vercel.app/api/integrations/serv/status?probe=1"`
  returns `configured: true`, `reachable: true`, the configured model, latency
  and SERV response id.
- Extraction entry point: `POST /api/intents/extract` →
  `src/app/api/intents/extract/route.ts` → `extractIntent`
  (`src/lib/integrations/serv/service.ts`). The response carries
  `extraction: { source, model, responseId, latencyMs }`, and the persisted
  intent stores `extractionSource`, `extractionModel`, `servRequestId` and
  `servLatencyMs`, with an `intent.extracted` audit event.
- Recorded demo evidence: the allow-case analysis
  `/app/analyses/ana_99b538af-3df3-4257-86a2-84d550961755` shows the reasoning
  trace stage 01 as a SERV call with its recorded latency, and its receipt
  payload records `intent.extraction.source: "serv"` with model
  `gpt-5.4-mini-2026-03-17`.
- Failure policy: if the key is absent, `extractIntent` uses the deterministic
  demo parser and labels the result `demo_parser` with a warning; it is never
  presented as SERV, and no analysis may run until a human confirms the draft
  (covered by "refuses to run an analysis on an unconfirmed SERV draft").

Tests: `client.test.ts` → "validates the payload against the supplied schema and
keeps provenance", "records the live SERV source, model, request id and latency
on the intent and audit trail", "refuses to produce an extraction when SERV is
not configured".

### 2. The deterministic engine receives validated extraction

- `callServStructured` validates every response with the Zod output contract;
  invalid output gets schema feedback, at most three attempts, then
  `ServInvalidOutputError` and **nothing is persisted**.
- Unknown fields are stripped, so a model response that contains
  `decision: "block"` cannot reach the engine; the contract has no decision,
  money or constraint-relaxation field.
- `createAnalysis` refuses a draft intent without `userConfirmedAt`
  (`ANALYSIS_INCOMPLETE`), so the engine only runs on a human-confirmed
  extraction.
- SERV explanation is display-only: it cannot cite evidence outside the supplied
  set and cannot change the decision (see `explainAnalysis` in
  `src/lib/integrations/serv/service.ts`).

Tests: `client.test.ts` → "rejects model output that carries a decision field,
so SERV cannot vote", "feeds validation issues back to SERV and repairs instead
of accepting invalid output", "refuses a result that never validates within
three attempts", "persists nothing when SERV output never validates";
`integrity.test.ts` → "refuses to run an analysis on an unconfirmed SERV draft".

### 3–5. Approval invalidation, Kite limits, receipt verification

See the seven-row table above. Code paths:
`src/lib/services/execution.service.ts` (`loadVerifiedApproval`,
`assertApprovalSnapshot`, the atomic `submitted` reservation),
`src/lib/integrations/kite/mock.ts` (session state, expiry, caps, duplicate),
`src/lib/services/receipt.service.ts` (`verifyReceipt`), and the route
`POST /api/receipts/[id]/verify`.

Receipt verification checks content, not shape: it recomputes
`hashPayload(receiptPayload)` and compares it to the stored hash, checks the
payload's own fields against the receipt row, re-links `analysisHash` to the
stored analysis, and walks the chain to confirm each ancestor's version, time,
household and recomputed hash, plus analysis → approval → execution stage order.
The forged-receipt test stores a valid 64-hex string but altered totals and
still fails.

### 6. The 12-month figure

The 12- and 24-month figures are **total household spend over that horizon**,
i.e. first-year and first-two-year spend — not an early-exit, buy-out or penalty
quote. The engine does not price leaving a fixed-term contract early. This is
now stated under the **Financial consequence** panel on every analysis page
(`src/app/app/analyses/[id]/page.tsx`).

## P1: important improvements

| Item | Where it is visible |
| --- | --- |
| Visible SERV reasoning trace | Analysis page "Reasoning trace": live stages show the SERV model and recorded latency; seeded offer extraction is labelled **Demo fixture** |
| Lost-benefit calculations | Block case `/app/analyses/ana_6c5a318b-ca46-4bad-8e07-2c42929eccc9`: the family-discount loss is an explicit line in the cost breakdown and a reason |
| Developer/platform explanation | `/app/integrations`: eight-phase conceptual flow, with simulated/not-integrated states named |
| Per-case benchmark + methodology | `/app/benchmark` and `BENCHMARK.md`: all 30 cases, provenance, numerators and denominators, and **SERV Not measured** |
| Live vs simulated unmistakable | Approval page now shows a caution notice ("Simulated execution — no Passport session, no funds moved") whenever `isKiteExecutionLive()` is false; the execution page repeats **Simulated**, **Not Integrated** and "no funds moved"; the receipt repeats `providerActivation: not_integrated` |
| Provenance vs currentness separated | Evidence explorer shows source/quote provenance separately from currentness re-checks; the receipt verifier lists signature and settlement as **Not checked** |

## Still not claimed

- SERV extraction quality is **not benchmarked**; the 30-case suite is an engine
  benchmark.
- Receipts are unsigned: hashes prove integrity, not authorship.
- Kite execution is simulated; provider activation and settlement are not
  integrated.
- Production hardening (rate limiting, tenant isolation, signed audit
  checkpoints) remains outstanding.

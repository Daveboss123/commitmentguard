# Build Notes

Verification log and submission state for the SERV Hackathon 02 build.
Last updated: **2026-11-13**.

## 2026-11-13 — responsive app-shell correction

The reported narrow-screen layout was caused by the app shell using `flex`
without a mobile column direction. The mobile header and page became siblings
in a horizontal row, stretching the header into a full-height left rail and
causing page-level overflow.

- The shell now uses `flex-col lg:flex-row`: top header below 1024 px, desktop
  sidebar at 1024 px and above.
- The mobile header is full-width and non-shrinking; open/close menu controls
  have 44 px targets and the opener reports its expanded state.
- Dashboard grid children have `min-w-0` and an explicit single-column mobile
  track, keeping wide tables inside their own horizontal scroll containers.
- Added a server-rendered layout regression test for the breakpoint direction
  and main-content shrinkability. **39/39 tests across 6 files** now pass.
- Local Chromium viewport checks at **375, 800, 1024 and 1440 px** showed no
  page-level horizontal overflow. The mobile header is 69 px tall rather than
  full-page height; the desktop sidebar remains 252 px wide. The mobile drawer
  opened/closed without shifting the page or extending beyond the viewport.


## 2026-11-13 — hosted consistency and final correctness follow-up

Production testing on remediation commit `128bf81` exposed a real limitation:
live SERV extraction and confirmation worked, but a later request could not
find the newly created intent (`404`). `/api/health` confirmed `storage: memory`.
The earlier smoke test was valid for its run; it did not prove reliability
across serverless instances.

The user approved shared storage and reuse of the existing free `precedent-demo`
Redis database under an isolated, previously empty key:
`commitmentguard:production:database:v1`. No existing Precedent data was
overwritten or deleted, and no paid plan was enabled. Production environment
variables were configured server-side (`UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_KEY`); preview is not pointed at that
production key.

Code hardening:

- Redis reads always fetch fresh snapshots. Writes use atomic Lua
  compare-and-set and replay **database-only** callbacks on conflicts.
- Storage failures return `STORAGE_UNAVAILABLE` instead of silently resetting
  to seed data or claiming persistence succeeded. Corrupt data is not replaced.
- Simulated Kite sessions live in shared storage, not an instance-local map.
  Caps are compared using integer-safe decimal-string arithmetic.
- Execution reserves `submitted` atomically before the adapter call; a timeout
  leaves an unknown/pending outcome, never an automatic retry or claimed success.
- Consent and execution re-derive binding inside the atomic mutation snapshot.
- Receipt stage checks traverse actual ancestry, including recomputed ancestor
  payload hashes, household/sequence checks, required stages and cycle detection.
  Signatures, source authenticity and real settlement remain **not checked**.
- Scenario decimal inputs are parsed without floating-point rounding. Invalid
  or over-precision amounts are rejected, not converted to a missing limit.
- `connection()` precedes session-expiry clock reads in page context and login.
  The previously observed local prerender warning is gone (page console checked).
- Placeholder-brand footer replaced with a synthetic-data build note.
- Public product/package/repository/deployment identity renamed to **trycommit**
  at the user's request. Existing storage namespaces, benchmark fixture ids and
  signed cookie identifiers are retained for compatibility. New receipts use
  `trycommit.decision_receipt`; previously issued receipts still verify under
  their original kind and hash. No data reset is part of the rename.

Local verification: typecheck clean; lint clean; **37/37 tests across 5 files**;
production build clean. Added tests cover decimal precision, two-instance reads,
CAS conflicts, corrupt data, HTTP-200 Redis errors, failed writes, competing
execute requests, adapter timeouts and disconnected/corrupt receipt ancestors.

After the trycommit rename: all checks re-run clean; **38/38 tests across 5
files**, including new/legacy receipt-kind compatibility without payload edits.

### Production verification (2026-11-13, commit `bd8ad02`)

Deployment `dpl_Djyj2iJFfhbQc3RkfNTh1DnUYdU1` reached **READY** and serves
<https://trycommit.vercel.app>. The renamed GitHub repository is
<https://github.com/Daveboss123/trycommit>; the Vercel project id did not change.

- `/api/health`: `storage: upstash`, SERV configured, Kite `mock` / `simulated`.
- New-domain demo login and **live SERV intent extraction** succeeded:
  `gpt-5.4-mini-2026-03-17`, recorded latency **7061 ms** (one call, not a benchmark).
- Confirmed intent `int_72dd4476-4e7b-4ee6-89d8-397511a32b8d` remained available
  across the subsequent comparison, analysis, consent and execution requests.
- BrightWave `ana_6d4c0ce9-7b6c-449b-beec-c07a1de93d88`: **block**, +76000 minor
  over 24 months. All four cost-breakdown panels reconcile.
- HarborLink `ana_99b538af-3df3-4257-86a2-84d550961755`: **allow**, -24000 minor
  over 24 months. MetroNest `ana_35b42cfd-b680-42dc-a340-2ff89c63c2e1`: **review**,
  incomplete totals remain null.
- Evidence explorer displayed quote/document status and source authenticity
  **Not checked**; trace displayed eight stages, live SERV timing and labelled
  demo-fixture offer extraction.
- Scenario API returned `notPersisted: true`; relaxing the term limit removed
  `MAX_CONTRACT_MONTHS`, but the explicit discount exclusion remained binding.
- Consent page displayed current binding, cost model `tco-1.1.0` and a 24-hour
  window. Consent was recorded as `appr_2ad0d04b-5dbd-494d-b31d-bad5d02bb8a7`.
- Execution `exec_b406eece-5fc3-4a45-9308-f08201439a2e`: capped session → simulated
  approval → **simulated 0.05 USDC execution**. No real transaction, funds
  movement, or provider activation is claimed.
- Receipt `rcpt_a2514c73-21b6-4b8f-aafa-323a32829eda` verified via the read-only
  **GET** `/api/receipts/{id}/verify`: format, current hash, linked analysis,
  chain and actual stage ancestry all passed; `verified: true`.
- Duplicate execute returned `409 EXECUTION_ALREADY_SUBMITTED`. Consent attempts
  against both block and review analyses returned `409 HARD_CONSTRAINT_VIOLATION`.
- `/app/benchmark` displayed engine-only 30/30 results with 11/11 and 599/603
  denominators and the SERV **Not measured** panel. `/app/integrations` displayed
  the eight-phase conceptual flow. Both pages had no recorded console errors.

Two copy corrections from this pass: the conceptual walkthrough now uses the
implemented **GET** receipt-verification method; rejection/request-changes copy
correctly promises a decision record and audit event, not an approval receipt.

Redeploy continuity check: commit `5e89558` reached **READY** as deployment
`dpl_35nnmKqFEgnxKfprCykdX6Xq34eJ`. After that redeploy, the same intent,
execution and receipt above still returned **200**, with execution still
simulated/succeeded and receipt `verified: true` with the unchanged content hash.
The receipt page showed five passing checks, signature/settlement **Not checked**,
and no recorded console errors. This check performed no new execution.

## 2026-11-12 — monetary reconciliation, verification surfaces, scenario sandbox

This pass is about one rule: **every displayed dollar figure must be
reproducible from integer minor units**, and every claim must say what was and
was not checked.

### Cost model: auditable line items (`tco-1.1.0`)

- `TcoLine` now carries `id`, `label`, `frequency`, `quantity`, `currency`,
  `startMonth`/`endMonth`, `sourceEvidenceId`, `includedInTotal`, `direction`
  and a written `calculationExplanation` (e.g. `$55.00 × 18 months (month
  7–24) = $990.00`).
- `TcoResult.calculationVersion` is part of the analysis input hash, so a cost
  model change invalidates an approval the same way a ledger change does.
- Offer A's 24-month proposed total is now demonstrably
  `$180 + $990 + $70 + $120 + $1,440 = $2,800` (18000 + 99000 + 7000 + 12000
  + 144000 minor units), and the app shows that arithmetic per line, with a
  footer that re-sums the rows and compares them to the reported total.
- New `ONE_TIME_FEE_EXCEEDS_LIMIT` constraint: an optional
  `policy.maxOneTimeFeeMinor` blocks installation + activation above the limit.
- Landing-page headline changed from a hand-typed `$930` to `$760` derived
  from the engine's `delta24Minor`, with a Difference column and two
  cost-breakdown panels. The 24-month comparison now reconciles:
  current $2,040 vs proposed $2,800 → +$760.

### Verification surfaces

- **Reasoning trace** (`/app/analyses/[id]`): eight recorded stages from
  request interpretation to final decision. Durations appear only where SERV
  actually reported them; engine stages say "not instrumented". A failure-
  handling table lists the fail-closed outcome for timeout, schema mismatch,
  missing field, unsupported currency, unverifiable quote and model refusal.
- **Evidence explorer**: each fact shows five separate statuses — quote located,
  document hash vs the recorded version, source authenticity (**"Not checked"**
  — no provider-authentication service is integrated), currentness and
  conflicts — plus the highlighted passage in its source.
- **Receipt verifier checks**: payload format, recomputed hash, chain link,
  linked analysis (id **and** hash must match the stored analysis), stage
  order. Signature/authenticity, provider activation and settlement are
  explicitly listed as *not checked*.
- **Consent binding panel**: input hash, offer version, policy version, cost
  model version, 24-hour consent window and the exact `409 APPROVAL_STALE`
  path when the basis changes.

### Scenario sandbox (what-if, never persisted)

`POST /api/analyses/[id]/scenario` re-runs the real engine against hypothetical
policy limits (contract length, minimum saving, one-off fee ceiling) and a
hypothetical retention flag. Nothing is written: no analysis, receipt,
approval or payment. The panel says so, and the service returns
`notPersisted: true`. An explicit document exclusion still wins over the
retention flag — the sandbox shows that rather than fabricating an escape.

Tests prove both directions: relaxing limits on Offer A removes
`MAX_CONTRACT_MONTHS` but the minimum-saving target keeps it blocked, and
tightening the saving target turns the allowed Offer B into a block. Both assert
that analysis and receipt counts are unchanged.

### Benchmark split (engine only, denominators published)

The report now declares `kind: "engine"`, `benchmarkVersion`, per-metric
`ratios` (numerator + denominator), `counts`, per-case provenance
(`fixtureId`, `inputMode: "fixture"`, `modelConfig: "none — deterministic
engine"`, `generatedAt`, `failureReason`) and an explicit
`servExtraction: { measured: false, … }` block. The benchmark page renders a
"SERV extraction benchmark — Not measured" panel and shows the denominator in
every metric card and baseline cell. See [BENCHMARK.md](BENCHMARK.md).

### Verification log for this pass

| Check | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors, 0 warnings |
| `npm test` | **24/24 across 3 files** (12 engine/domain/workflow + benchmark runner) |
| `npm run build` | clean; new `POST /api/analyses/[id]/scenario` is dynamic |
| Benchmark | 30/30 engine cases; evidence quotes 599/603 with the four deliberately corrupted quotes flagged |

### Honesty notes added in this pass

- A hash proves integrity against the recorded version, not source
  authenticity or authorship; the UI says this next to every evidence item and
  receipt.
- The scenario sandbox is a planning tool, not a decision of record, and cannot
  be approved.
- The platform flow on `/app/integrations` uses real route paths but its JSON
  bodies are explicitly labelled **conceptual shapes**, not a published SDK
  contract.
- Latency remains engine-only; SERV is not called by the benchmark.

---

## Verification log (2026-11-08, all four green in this order)

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | clean (tsc strict, 0 errors) |
| Lint | `npm run lint` | clean (0 errors, 0 warnings after fixes below) |
| Tests | `npm test -- --run` | **20/20 across 3 files**, 3 files = benchmark runner, domain, workflow service gates |
| Benchmark | `runner.test.ts` (in `npm test`) | **30/30 cases**, engine v1.0.0 — see [BENCHMARK.md](BENCHMARK.md) |
| Production build | `npm run build` | clean; route table below |

Route table from the clean build (Next.js 16.4.5, Turbopack):

- `○ /` + `/ _not-found` — static. The landing page computes its Offer A
  block record **live from the benchmark runner at build time**, so the
  published marketing numbers are the engine's measured output.
- `ƒ 49 API route files` — all dynamic (cookies, zod bodies).
- `ƒ /app` dashboard, lists, settings, benchmark — dynamic.
- `◐ /app/analyses/[id]`, `.../consent`, `/app/approvals/[id]`,
  `/app/commitments/[id]`, `/app/compare/[intentId]`,
  `/app/executions/[id]`, `/app/receipts/[id]` — **Partial Prerender**:
  static shell + dynamic server-streamed panel.
- `ƒ /login` — dynamic (reads cookies + searchParams).

### Issues found and fixed during the pass

1. **`react-hooks/purity` errors (4).** Four RSC pages called `Date.now()`
   directly during render (approval-expiry checks). Fix: introduced
   `serverNow()` (`src/lib/app/clock.ts`) so wall-clock reads live in a plain
   server module, not component scope. Behaviour unchanged, lint clean.
2. **14 unused-import/variable warnings.** Removed across pages, services and
   the compare wizard (which also lost a never-used `policy` prop now that
   the policy editor and engine own policy entirely).
3. **Earlier cacheComponents fixes (retained):**
   - `blocking-prerender-random` → `/app/benchmark` exports nothing static
     and `await`s `connection()` before `runBenchmark()`, because the runner
     mints ids/timestamps — request-time only, never captured in a shell.
   - `blocking-prerender-dynamic` → the authenticated `/app` layout and
     `/login` export `instant = false`. A shared session-cookie layout cannot
     honestly have a shared static shell; blocking navigation is the truthful
     behaviour there.
4. **`connection()` placement.** In API handlers the prerender bail-out must
   propagate; it is called outside `try/catch` so an unexpected internal map
   cannot swallow it.

### Test coverage of the fail-closed gates (`workflow.test.ts`)

The suite drives the real seeded repository through the service layer:

- Approval gate: refuses to approve a blocked/review analysis, unknowns,
  invalid evidence, missing high-severity acknowledgements
  (`assertApprovalBasis` synthetic-basis cases); records a chain-linked
  approval receipt for the compliant offer.
- Duplicate approvals, 24 h binding, `APPROVAL_STALE` re-derivation.
- Kite caps: over-budget session refused; `EXECUTION_ALREADY_SUBMITTED` on a
  second attempt (state-level, not UI-level).
- Receipt chain: content-hash recompute + genesis/chain link; tamper
  detection.

## `instant = false` / rendering decisions (the why, briefly)

- The landing `/` is honest static: it contains no session state, and its
  benchmark record is deterministic, so build-time capture is correct.
- `/app/*` layout is deliberately `instant = false`: every screen depends on
  a session cookie household lookup; a prerendered shell would render for
  whoever taps the link. Dynamic (or ◐ where the route takes a dynamic
  param) is what the honesty policy buys.
- Partial Prerender (◐) was kept wherever the shell genuinely is
  session-independent wall decoration and the dynamic part streams in a panel.

## Honesty matrix (what is real vs simulated)

| Capability | State in this build | Label users see |
| --- | --- | --- |
| SERV intent/offer extraction | **Live** (`SERV_API_KEY`, OpenServ inference API, `gpt-5.4-mini`) | "AI-assisted extraction — you must confirm the terms" |
| SERV explanation of an analysis | **Live**, on demand, separate endpoint | — |
| Demo-parser fallback | Active only when SERV is intentionally unconfigured | "demo-fixture, not SERV" |
| Consequence analysis / totals / decision | **Deterministic engine** (no LLM) | Engine version shown |
| Approval gate + receipts | **Real code paths** over the demo store | Receipt hashes recomputed on screen |
| Kite session status (cli mode local) | Real `kpass` CLI probes | — |
| Kite payment execution | **Simulated** (`KITE_MODE=mock` / `KITE_EXECUTION_MODE=simulated`); `live` never executed in demo | "Simulated checkout — no real payment is made" |
| Provider activation | **Never claimed** | Always `not_integrated` |
| Offers | Demo fixtures | "Demo provider / Illustrative terms" |

## Environment conventions

- Local dev: `KITE_MODE=cli` (real `kpass` for status probes) + simulated
  execution; `DEMO_PERSIST=true` writes `.data/db.json`.
- Hosted demo: `KITE_MODE=mock`, `DEMO_PERSIST=false`, with the shared Upstash
  driver configured. Synthetic demo state persists across instances; nothing
  real is paid and no secrets are client-side. Memory is only the unconfigured
  fallback and cannot guarantee hosted multi-request continuity.
- `SERV_API_KEY` and `AUTH_SECRET` are the only required secrets.

## Known limitations (not hidden)

- No SQL driver implemented — the repository seam is the integration point
  (the JSON/memory drivers cover the demo).
- Demo authentication (no passwords) — see [SECURITY.md](SECURITY.md).
- No end-to-end browser automation tests; the UI was exercised interactively
  and the gates are covered at the service layer.
- The local store is plaintext JSON; multi-tenant hardening is out of demo
  scope.

## Submission checklist (target: 2026-11-15 23:59 UTC)

- [x] Product builds clean: typecheck / lint / tests / benchmark / build
- [x] Docs: README, ARCHITECTURE, INTEGRATIONS, BENCHMARK, SECURITY,
      BUILD_NOTES
- [x] Public GitHub repo: <https://github.com/Daveboss123/trycommit>
      (initial feature commit `ec688e0`, 142 files; secrets verified absent —
      `.env*`/`/.data/` gitignored, staged diff scanned for key strings)
- [x] Deployed to Vercel: <https://trycommit.vercel.app>
      (project `trycommit`, `prj_pGkAl3doQsqZ96Hmg3l7Ea56kiW5`,
      production deploy of commit `6f81c6a` with environment variables:
      `KITE_MODE=mock`, `KITE_EXECUTION_MODE=simulated`,
      `KITE_MAX_*_USDC=0.05`, `DEMO_PERSIST=false`, `SERV_API_KEY` and a
      freshly generated `AUTH_SECRET`, both stored as sensitive values)
- [x] Hosted end-to-end smoke test **passed 2026-11-08** on production:
      1. `/api/health` → `storage: memory`, SERV configured, Kite
         `mock_mode`; live SERV probe `reachable: true` (real chatcmpl id)
      2. Sign-in (`cg_session`) → household resolves
      3. **Live SERV intent extraction** → confirmed
      4. Offer A analysis → **block**
         (`MAX_CONTRACT_MONTHS`, `BENEFIT_NOT_RETAINED`, `HIGHER_TOTAL_COST`,
         `FIXED_TERM_COMMITMENT`), payment attempted → approval refused with
         typed `HARD_CONSTRAINT_VIOLATION`
      5. Offer B analysis → **allow**, 12-month totals $900.00 proposed vs
         $1,020.00 current (90000 / 102000 integer minor units)

      6. Approval recorded (empty acknowledgement set is correct: B has no
         high/critical consequences)
      7. Capped Kite mock session → simulated Passport approval→ executed
         **$0.05, `SIMULATED-KITE-*` reference, labelled simulated**
      8. Second execute attempt refused: `409 EXECUTION_ALREADY_SUBMITTED`
      9. Receipt chain `analysis#1 (genesis) → analysis#2 → approval#3 →
         execution#4`: every hash recomputes `valid: true`, `chainValid:
         true`, genesis correctly unlinked
- [ ] Demo link / short video
- [ ] Short write-up (SERV Reasoning usage: live extraction + separate
      explanations; deterministic engine decides)
- [ ] X post with the repo/demo link

# Benchmark

> **This is an engine benchmark, not a SERV extraction benchmark.**
>
> These figures measure the deterministic consequence and policy engine. SERV
> extraction quality is **not measured in this build** and no extraction
> percentage is claimed anywhere. See
> [SERV extraction — not measured](#serv-extraction--not-measured) below.

trycommit ships a **30-case hand-authored benchmark** with fixed labels.
Every number in this document comes from a real run of the shipped runner
(`src/lib/benchmark/runner.ts`) against the shipped cases
(`src/lib/benchmark/cases.ts`). Nothing here is estimated or aspirational.

- Report kind: `engine` (there is no `serv` report in this build)
- Engine under test: deterministic decision engine, `engineVersion 1.0.0`
- Benchmark version: `1.0.0`
- Input mode: fixed fixtures (`inputMode: "fixture"`), no live model
  (`modelConfig: "none — deterministic engine"`)
- Reproduce: `/app/benchmark` in the app, or `npm test` (the runner test
  asserts 30/30)

---

## Method

**What a case is.** Each case is a complete household state: an
`IntentContract`, a `UserPolicy`, an `Offer` with a source document, the
household's existing commitments, benefits and dependencies, and a set of
`Evidence` items quoting verbatim document text (with content hashes).

**What is labelled — by hand, once, fixed:**

| Field | Meaning |
| --- | --- |
| `decision` | the only acceptable allow / review / block outcome |
| `reasonCodes` | decision-reason codes that must be present in the output |
| `current12Minor` / `proposed12Minor` / `current24Minor` / `proposed24Minor` | exact integer minor-unit totals for both horizons |
| `consequenceKeywords` | every material consequence that must surface by title |
| `approvalRequired` / `paymentAllowed` | whether the consent and payment gates should be exercisable |
| `injectionDetected` | whether the prompt-injection scan must fire on the source text |

The labels were written and reviewed against the arithmetic. The runner never
derives the labels from the engine it is testing — it only checks the engine's
output against them. **No LLM is involved anywhere**: the runner does not call
SERV, and it does not use an LLM to judge outputs.

Every case result also records its provenance explicitly: `fixtureId`,
`inputMode`, `modelConfig`, `generatedAt` and, when it fails, a
human-readable `failureReason`.

**A case passes only if all of these hold:**

1. Actual decision equals the expected decision.
2. Every expected reason code appears in the output.
3. All four integer totals match **exactly** (no tolerance, no floats).
4. Every expected consequence keyword appears in a produced consequence title.
5. Injection detection matches the label.

**Categories (6):**

| Category | Cases | Passed |
| --- | --- | --- |
| Hidden fees & recurring costs | 6 | 6/6 |
| Promotion expiry & renewal | 6 | 6/6 |
| Lost benefits & dependencies | 6 | 6/6 |
| Contract duration & cancellation | 6 | 6/6 |
| Evidence integrity (corrupted/stale/contradicted quotes) | 3 | 3/3 |
| Prompt injection (offer text attacking the agent's judgment) | 3 | 3/3 |

---

## Measured results

Every published percentage is shown with its numerator and denominator. Small
denominators are shown, not hidden.

| Metric | Result | Numerator / denominator | What it means |
| --- | --- | --- | --- |
| Overall pass rate | **1** | 30 / 30 | decision, reasons, totals, consequences and injection detection all correct in every case |
| Decision accuracy | **1** | 30 / 30 | allow / review / block correct in every case |
| Hard-constraint block rate | **1** | 11 / 11 | every case whose policy makes the offer a hard constraint failure was **blocked**, never talked down to review |
| False-block rate | **0** | 0 / 12 | no compliant offer was blocked |
| Material consequence recall | **1** | 39 / 39 | every labelled consequence keyword surfaced in the produced consequences |
| TCO accuracy | **1** | 120 / 120 | 30 cases × 4 integer totals, all exactly correct |
| Evidence quote validity | **0.9934** | 599 / 603 | four quotes in the evidence-integrity cases are **deliberately corrupted**; locating them is impossible and flagging them is the correct behaviour — the engine flags all four and every case passes |
| Unknown-handling accuracy | **1** | 6 / 6 | every unknown-critical-terms or invalid-evidence case surfaced the unknown and was **never allowed** |
| Human interruption rate | **0.6** | 18 / 30 | review + block cases — the engine inserts a human at these decision points instead of auto-pacting |
| Approval-required rate | **0.4** | 12 / 30 | cases where the consent gate would be exercised before anything can move |
| Payment-allowed rate | **0.4** | 12 / 30 | cases where a capped payment session could legitimately be requested |
| Mean analysis latency | **engine-only** | 30 runs, no network | observed between roughly 1 and 4 ms depending on machine and run; this is one full decision + consequence + totals recomputation, not an end-to-end request |

The counts behind the ratios are also exposed by the runner
(`report.counts`): 11 expected-block cases, 12 expected-allow cases, 39
consequence keywords, 120 TCO fields, 603 evidence items, 6 unknown cases and
18 cases that were not auto-allowed.

---

## SERV extraction — not measured

An extraction benchmark needs repeated live SERV calls over a labelled document
set, with scored fields and quotes. **This build does not ship one, so no
extraction accuracy, freshness or latency percentage is claimed.**

What is recorded instead, per analysis:

- the extraction source (`serv` or the clearly labelled `demo_fixture` /
  `demo_parser` path),
- the model and, when SERV reported them, latency and response id,
- the quote-validation result for that analysis (how many quotes were located
  in the recorded source),
- explicit unknowns where a material field could not be extracted.

Fixture offers are labelled `demo_fixture` and are never presented as live SERV
output. If SERV is configured but unavailable, extraction fails closed with a
typed error rather than falling back silently.

---

## Baselines (controlled, not competitors)

Two synthetic control agents run on the same 30 cases to show what a
conventional agent does. These are **experimental controls defined in the
runner**, not claims about any real product.

| Control agent | Behaviour modelled | Decision accuracy | Hard-constraint escape | False blocks | Consequence recall | TCO accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline A — ordinary LLM agent | recommends when the advertised promo price undercuts the service it replaces; no ledger, dependencies, evidence, fees or contract rules | **0.4** (12/30) | **1.0** (11/11) | 0 | 0 | 0 |
| Baseline B — permission / spend control | allows when the advertised monthly price is within current spend; no total-cost, benefit or evidence model | **0.4** (12/30) | **1.0** (11/11) | 0 | 0 | 0 |

Concretely: both baselines **wave every adversarial offer through** — the
24-month auto-renewal contract, the lost family bundle, the hidden equipment
fee, all of it — because those are invisible from the advertised price. The
same cases trycommit blocks.

---

## Limitations (stated plainly)

1. **30 cases is a small suite.** It verifies the specified behaviours; it does
   not prove statistical robustness outside them. The labels cover the
   consequence categories the blueprint targets, nothing more.
2. **SERV extraction is not benchmarked.** These cases feed hand-built inputs
   straight into the deterministic engine. Extraction quality is exercised in
   the live demo, not scored here — and no percentage is published for it.
3. **Latency is engine-only.** Real end-to-end request latency includes SERV
   round-trips and is network-dependent; it is not a comparable figure.
4. **No LLM judge.** Label matching is exact strings and integer arithmetic —
   which is a strength for determinism, but means the benchmark cannot grade
   *explanation quality*.
5. **Baselines are synthetic.** They model a behaviour pattern, not a named
   product.
6. The benchmark **never proves payment success or provider activation**;
   those states are outside the deterministic engine by design.

## Reproducing

```bash
npm test                     # includes runner.test.ts: asserts 30/30
```

or open `/app/benchmark` in the running app (signed in) — the same
`runBenchmark()` executes per request, with the full per-case table (expected
vs actual decision, reasons, totals, consequences, fixture provenance and
failure reason) and the explicit "SERV extraction — not measured" panel.

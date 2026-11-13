# trycommit

**Understand the consequence before you consent.**

trycommit is a commitment consequence-analysis and consent layer for AI
assistants that act on a household's behalf. When an agent wants to switch a
provider, sign a contract or pay on someone's behalf, trycommit prices the
**total** commitment — not the advertised price — checks it against hard
household constraints, and refuses to move until a human has explicitly
consented to the material consequences.

Built for the OpenServ SERV Hackathon 02 (Kite track), November 2026.

---

## The honest one-liner

Advertised price is real; the total cost is the point. An LLM may read and
explain an offer, but it **never** decides allow / review / block, never prices
money, and never relaxes a constraint. A deterministic engine makes the
decision, and every irreversible step requires separate, explicit consent.

## What it actually does

1. **Extract (SERV Reasoning, live).** A plain-English request ("switch
   broadband, keep my family mobile discount, no contract over 12 months") is
   extracted by SERV into a structured, user-confirmable **intent contract**.
   Offer documents are extracted into priced terms where every money-relevant
   claim cites a verbatim quote from the source text.
2. **Validate evidence.** Every quoted fact is located in its source document.
   A quote that cannot be found, or that contradicts another source, invalidates
   approval. This is the trust backbone of the whole product.
3. **Decide (deterministic engine).** Integer-minor-unit totals are computed for
   12- and 24-month horizons, including one-off fees, expired promotions,
   contract terms, cancellation charges and **benefits that disappear** because
   the switch breaks a dependency (e.g. losing a family mobile bundle
   discount). Hard constraints set by the household policy block, review or
   allow. The LLM never participates in this step.
4. **Consent (separate, recorded).** Nothing is paid from an "allow". A human
   must open the consent review, tick every high/critical consequence, and
   record an approval that is cryptographically bound to the exact analysis
   hash and offer version, expires after 24 hours, and is refused if anything
   in the household ledger or the offer changes afterwards.
5. **Pay via Kite (capped, separate).** Even after approval, payment needs its
   own capped Kite/Passport session (default 0.05 USDC total). The service
   re-verifies the approval hash, expiry and session state before executing,
   and refuses duplicate execution. Provider activation is **never** claimed —
   it is always reported `not_integrated`.
6. **Prove it later.** Every stage writes a hash-chained decision receipt
   (analysis → approval → execution). Any receipt can be re-verified at any
   time by recomputing its content hash and checking its chain link.

The live SERV pipeline is real in this build (`SERV_API_KEY` required for
extraction). **Payment execution is always simulated at the demo layer** and is
labelled simulated everywhere; `KITE_EXECUTION_MODE=live` is never executed in
the demo build.

## Quickstart

```bash
npm install
cp .env.example .env.local   # fill in SERV_API_KEY for the live extraction
npm run dev                  # http://localhost:3000
```

- Sign in on `/login` as **Alex Morgan** (owner of the seeded Morgan household).
- New comparison → enter the demo request → confirm the SERV-extracted intent →
  compare three demo offers.
- **Offer A (BrightWave)** blocks: it costs more once the promo ends, breaks the
  family mobile bundle discount, and locks you into 24 months with automatic
  renewal.
- **Offer B (HarborLink)** is the compliant one ($35.00/mo, benefit retained).
- **Offer C (MetroNest)** has material unknowns → review, never auto-priced.
- Analyse → consent review → request a capped Kite session → simulated approval
  → simulated execution → verify the receipt hash chain.
- `/app/benchmark` runs the full 30-case suite in-page; `/app/settings` has the
  policy editor, audit log and a demo reset.

All offers are labelled **"Demo provider / Illustrative terms"**. No real
provider is contacted and no real payment is made anywhere in the demo.

## Verification

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run  (30 benchmark cases + domain + service gates)
npm run lint
npm run build       # production build with Cache Components + partial prefetching
```

Latest verified state: typecheck clean, **39/39 vitest tests** and **30/30
benchmark cases** green, production build clean (landing `/` prerendered
static, authenticated app routes dynamic or partial-prerendered). See
[BUILD_NOTES.md](BUILD_NOTES.md) for what was checked and how.

The hosted demo uses shared Redis storage so confirmed intents and receipts
survive serverless instance changes. Kite sessions and execution remain
**simulated**, with no real funds moved. This is shared demo state, not a
production multi-tenant database.

## Measured results (see [BENCHMARK.md](BENCHMARK.md))

This is an **engine benchmark**. SERV extraction quality is not measured in this
build, and no extraction percentage is claimed.

| Metric (30 hand-authored cases)              | Measured  | Ratio      |
| -------------------------------------------- | --------- | ---------- |
| Cases passed                                  | 30/30    | 30 / 30    |
| Decision accuracy (allow/review/block)        | 1.0      | 30 / 30    |
| Hard-constraint block rate                    | 1.0      | 11 / 11    |
| False-block rate                              | 0        | 0 / 12     |
| Material consequence recall                   | 1.0      | 39 / 39    |
| Total-cost-of-ownership accuracy (integer)    | 1.0      | 120 / 120  |
| Evidence quote validity                       | 0.9934*  | 599 / 603  |
| Unknown handling                              | 1.0      | 6 / 6      |
| Mean analysis latency (engine only, no SERV)  | ~1–4 ms  | 30 runs    |

\* Four evidence quotes in the integrity cases are deliberately corrupted and
**cannot** be located — flagging them is the correct behaviour, and the engine
flags all four. The 599/603 quote-locating rate includes them. Baseline A/B
control agents reach only 0.4 decision accuracy with a 1.0 hard-constraint
escape rate on the same 30 cases.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, decision pipeline, data model
- [INTEGRATIONS.md](INTEGRATIONS.md) — SERV + Kite, modes and failure policy
- [BENCHMARK.md](BENCHMARK.md) — method, labels and full measured numbers
- [SECURITY.md](SECURITY.md) — fail-closed invariants, auth, threat model
- [BUILD_NOTES.md](BUILD_NOTES.md) — verification log and submission state

## Tech stack

- **Next.js 16.4.5** (App Router, Cache Components + Partial Prefetching,
  Turbopack), React 19.3, TypeScript strict
- **Tailwind CSS v4**, lucide-react
- **zod**-validated API surface (49 route files, typed error envelopes)
- **openai**-compliant client pointed at the OpenServ inference API (SERV)
- **Vitest** for domain, benchmark and fail-closed service gates
- Modular monolith: no runtime dependencies on an external database; the
  repository layer abstracts storage (local JSON driver today, SQL-ready seam)

## Repo layout (short version)

```
src/
  app/page.tsx                 landing (live-computed block record, static)
  app/login/                   demo sign-in
  app/app/                     authenticated workspace (dashboard, compare,
                               analyses, consent, approvals, executions,
                               receipts, commitments, integrations, benchmark,
                               settings)
  app/api/                     zod-validated route handlers
  components/                  server panels + small client islands
  lib/domain/                  deterministic engine, money, policy, evidence
  lib/services/                analysis / approval / execution / receipt gates
  lib/integrations/serv/       SERV client, prompts, demo parser (labelled)
  lib/integrations/kite/       mock + CLI adapters behind one factory
  lib/store/                   repository + JSON/memory/Upstash drivers
  lib/benchmark/               30-case runner (no LLM, no SERV)
```

## Environment

Server-side only; never committed. See [.env.example](.env.example) and
[INTEGRATIONS.md](INTEGRATIONS.md). The hosted demo runs with `KITE_MODE=mock`
and simulated execution, so nothing real can be paid anywhere.

```text
SERV_API_KEY       OpenServ inference key (extraction + explanations)
AUTH_SECRET        HMAC secret for the demo session cookie
KITE_MODE          mock | cli        (hosted demo: mock)
KITE_EXECUTION_MODE simulated | live (hosted demo: simulated)
KITE_MAX_TOTAL_USDC / KITE_MAX_PER_TX_USDC   hard payment caps
DEMO_PERSIST       false on read-only serverless filesystems
```

## Ethics of the demo

- No fake payments, no fake provider activations, no fabricated quotes.
- Simulated actions are labelled simulated, everywhere, no exceptions.
- Every "healthy" integration claim comes from a real probe, not from config.
- Benchmark numbers on this page are from a real run of the shipped runner.

# Build Notes

Verification log and submission state for the SERV Hackathon 02 build.
Last updated: **2026-11-08**.

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
- Hosted demo: `KITE_MODE=mock`, `DEMO_PERSIST=false` (in-memory driver) —
  the demo state is seeded fresh; nothing real is paid; no secrets are
  client-side.
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
- [ ] Commit + push to a **public GitHub repo** (all feature work is
      currently uncommitted; awaiting explicit go-ahead from the user)
- [ ] Deploy to Vercel (team `team_nYeRt65eUjsMoUxjjSsq4roh`) with
      `KITE_MODE=mock`, `SERV_API_KEY`, `AUTH_SECRET`; smoke-test the full
      hosted flow: extract → confirm → analyse → block A / allow B → consent
      → simulated execution → receipt verify
- [ ] Demo link / short video
- [ ] Short write-up (SERV Reasoning usage: extraction + separate
      explanations; deterministic engine decides)
- [ ] X post with the repo/demo link

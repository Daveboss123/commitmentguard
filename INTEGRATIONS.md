# Integrations

Two external systems matter, and the product is deliberately honest about both.
Status is always reported from a **real probe or adapter**, never inferred from
the mere presence of an environment variable.

---

## SERV Reasoning (OpenServ) — real, live

**What it does.** Plain-language intent extraction, offer-term extraction, and
separate plain-language explanations of completed analyses.

**Where.** `src/lib/integrations/serv/` — `client.ts` (OpenAI-compatible client
against the OpenServ inference API), `prompts.ts`, `service.ts`,
`demo-parser.ts` (explicit fallback, labelled `demo_parser` / "demo-fixture,
not SERV" wherever it is used).

**Config (server-side only).**

```text
SERV_ENABLED=true
SERV_BASE_URL=https://inference-api.openserv.ai/v1
SERV_API_KEY=...            # server-side only; never sent to the browser
SERV_MODEL=gpt-5.4-mini
SERV_TIMEOUT_MS=45000
```

**Endpoints used.**

- `POST /api/intents/extract` — request → `IntentContract` (needs user confirm)
- `POST /api/offers/[id]/analyze-terms`, `POST /api/documents/[id]/extract`,
  `POST /api/documents/upload`, `POST /api/households/[id]/documents/fetch`
- `POST /api/analyses/[id]/explanation` — requested separately; analysis never
  blocks on it
- `GET /api/integrations/serv/status?probe=1` — one small live request from the
  Integrations page; reports measured reachability + latency, or the error

**Hard rules.**

- SERV output is validated with zod schemas (`ServIntentSchema`,
  `ServOfferTermsSchema`, `ServExplanationSchema`). Invalid output →
  `SERV_INVALID_OUTPUT`, no silent retry.
- SERV never sees the approve/block decision and cannot produce one.
- If SERV is expected but fails: typed error, fail-closed. The labelled demo
  parser is used only when SERV is deliberately unconfigured — and every such
  result says so on screen.

---

## Kite / Passport — capped sessions, simulated execution in the demo

**What it does.** Scoped, cap-bound payment sessions so an agent can pay at
most an explicit USDC total, only after a household approval is verified.

**Where.** `src/lib/integrations/kite/` — `factory.ts` picks the adapter;
`mock.ts` is an explicit in-app simulator; `cli.ts` is the real `kpass` CLI
adapter with the same interface.

**Config (server-side only).**

```text
KITE_MODE=mock | cli                 # hosted demo: mock
KITE_EXECUTION_MODE=simulated | live # hosted demo: simulated
KITE_CLI_PATH=kpass                  # used in cli mode
KITE_MAX_TOTAL_USDC=0.05             # hard session cap (env-enforced)
KITE_MAX_PER_TX_USDC=0.05            # hard per-transaction cap
KITE_SESSION_TTL=30m
KITE_DEMO_CHECKOUT_URL=              # optional demo checkout target
```

**Adapters.**

- `mock` — `KiteMockAdapter`: creates simulated sessions, records a simulated
  Passport approval, and returns `SIMULATED-KITE-*` references. Never contacts
  Kite, never moves funds. `simulateKiteApproval()` refuses to run against any
  real adapter.
- `cli` — same interface backed by `kpass`. Status/session can be real; the
  hosted demo ships **mock + simulated** execution, so nothing real is paid
  anywhere in the demo build. `KITE_EXECUTION_MODE=live` is validated before
  the adapter call and never executed in the demo configuration.

**Endpoints.**

- `POST /api/analyses/[id]/executions` — request a capped session (duplicates
  refused by state)
- `GET /api/integrations/kite/status`, `/api/integrations/kite/session`
- `POST /api/executions/[id]/refresh | simulate | execute | cancel`

**Hard rules.**

- A submitted or succeeded execution can never be submitted again
  (`EXECUTION_ALREADY_SUBMITTED`), regardless of what the UI allows.
- Payment success ≠ provider activation: activation is always
  `not_integrated`.
- Every simulated result is labelled simulated in UI, receipt payload and audit
  log. There is no mock data dressed as live data.

---

## Failure policy (the product prefers refusal to a trusted guess)

1. SERV configured but failing → typed error; no silent fallback.
2. Unknown critical term → total `null`, outcome review or block, approval
   refused.
3. Offer, ledger or evidence changed → approval stale, execution refused.
4. Expired approval or over-cap/over-TTL session → nothing executed.
5. Duplicate execution → refused by the service, not by a disabled button.
6. Integration health shown as healthy only after a real probe succeeds.

## Secrets

All integration credentials live in server-side environment variables read by
`src/lib/app/config.ts` (module guarded by `import "server-only"`). No page or
client component can read them; `.env*` and `/.data/` are gitignored.

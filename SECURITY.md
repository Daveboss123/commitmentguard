# Security

CommitmentGuard is a consent-and-consequence layer for an agent that can spend
money. Its security posture is therefore **refusal-first**: the goal is that
when the system is unsure, stale, over-budget or compromised, it does nothing
rather than doing something plausible. This document states the concrete
invariants, what is enforced server-side, and — just as important —
**what is not proven**.

---

## Auth model (demo-scoped, stated honestly)

- The app issues an HMAC-signed session cookie (`cg_session`) via
  `src/lib/auth/session.ts`. The signing key is `AUTH_SECRET`, read
  server-side only. The cookie carries `userId`, `householdId`, `issuedAt`,
  `expiresAt`; tampering breaks the HMAC and the request is rejected.
- Every authenticated page resolves its context through `getPageContext()`
  (session → household → acting member). Every API route goes through
  `requireSession()` and then `requireHouseholdAccess` /
  `requireWritableHousehold` — membership and role are checked **per request**,
  never inferred from client data.
- Roles: `owner` and `approver` can act; **`viewer` is read-only at the service
  layer**, not merely in the UI (writes refuse with a typed error).
- **This is not production authentication.** There are no passwords; sign-in
  exists only as a demo fairness mechanism because the whole product is
  multi-actor (an owner approves an agent's action). A production deployment
  needs real identity (OIDC/WebAuthn) — this build does not claim otherwise.

## Fail-closed invariants (the real security boundary)

The decision, consent and payment gates live in service code
(`src/lib/services/`), and every one of them **refuses when inputs are
unknown, changed, expired or over-cap**:

| Situation | Enforced behaviour |
| --- | --- |
| Analysis decision ≠ `allow` | Approval refused (`assertApprovalBasis`) |
| Material terms still unknown | Approval refused — an unknown is never priced as zero |
| Invalid or contradicted evidence quote | Approval refused |
| High/critical consequence not explicitly acknowledged | Approval refused, missing ids in the typed error (`assertApprovalBasis`) |
| Household ledger / offer / evidence changed after the analysis | `APPROVAL_STALE` — the service re-derives `inputHash` before binding an approval |
| Approval expired (24 h TTL) | Execution refused (`APPROVAL_EXPIRED`) |
| Approval hash/version mismatch | Execution refused |
| Kite session total above `KITE_MAX_TOTAL_USDC`, or per-tx above `KITE_MAX_PER_TX_USDC` | `KITE_BUDGET_EXCEEDED`, nothing executed |
| Kite session expired or exhausted | `KITE_SESSION_EXPIRED` / `EXHAUSTED`, nothing executed |
| Second execution attempt | `EXECUTION_ALREADY_SUBMITTED` — refused **by state**, not by a disabled button |
| Concurrent execution attempts | Atomic `submitted` reservation before the adapter call; only one request can submit |
| Adapter timeout after submission | Remains `submitted` / outcome unknown; no automatic resubmission or payment-success claim |
| Shared store read/write failure | `STORAGE_UNAVAILABLE`; no silent fixture reset or successful-write claim |
| SERV mis-configured or failing | typed error; no silent fallback that could steer a decision |
| Unexpected error in an API route | typed `INTERNAL_ERROR`, no stack or internal detail leaked |

The LLM never decides, never prices, never relaxes a constraint — so prompt
injection in offer text cannot turn a "block" into a payment. Injection
attempts are additionally scanned (`src/lib/security/injection.ts`) and shown
to the user; the benchmark has a dedicated prompt-injection category (3/3
detected).

## Money integrity

- All money is **integer minor units**. Totals are produced by pure functions
  in `src/lib/domain/` (no floats, no rounding drift). Unknown components
  leave the horizon total `null`, never a misleading zero.
- Payment amounts travel as decimal strings and are compared with an
  integer-safe comparator (`src/lib/domain/money.ts`) — string-to-float
  coercion, `>= 0.05` style float edge cases, cannot occur.
- Caps are environment-enforced (`KITE_MAX_TOTAL_USDC` /
  `KITE_MAX_PER_TX_USDC`) and checked again inside the execution service, so a
  compromised UI cannot raise them.
- The hosted demo runs `KITE_MODE=mock` and `KITE_EXECUTION_MODE=simulated`;
  nothing real can be paid anywhere in the demo build. The `live` mode is
  validated before the adapter call and never executed in the demo
  configuration.

## Consent integrity

- Every approval is bound to the exact `analysisHash` (content hash of the
  analysis input snapshot) **and** the `offerVersion`, carries the explicit
  `acknowledgedConsequences` list, and expires after 24 hours.
- The acknowledgement gate is enforced server-side by
  `assertApprovalBasis()` — ticking checkboxes in the UI is not trusted.
- Duplicate approvals return the existing record; a new approval after a state
  change fails with `APPROVAL_STALE` because the hash no longer matches.

## Receipt chain

- Each stage (analysis → approval → execution) appends a `DecisionReceipt`
  with a canonical payload, a SHA-256 `contentHash` over that payload, and the
  **previous receipt's hash** as its chain link.
- `verifyReceipt()` recomputes the hash from the payload and checks the chain
  link; the UI re-verifies rather than trusting the stored value. The verify
  button on every receipt page demonstrates this on demand.
- The verifier also checks the payload envelope, linked analysis id/hash and
  the actual hash-linked ancestry. It recomputes ancestor payload hashes and
  checks household, sequence, missing links, cycles and required stage order.
  `valid` means the current payload hash matches; `verified` combines these
  checks. Neither means a signature or provider-authentication check occurred.
- The complete household export (`/api/households/[id]/export`) includes
  receipts and audit events so the whole chain can be rechecked
  independently. Session tokens and secrets are never included.
- **Limit, stated plainly:** the chain proves *internal consistency*, not
  external tamper-proofing — an attacker with write access to the store could
  rewrite both payload and hashes. (Production hardening would use signed
  receipts or external anchoring; not claimed in this build.)

## Secrets & data flow

- All credentials (`SERV_API_KEY`, `AUTH_SECRET`, Kite config) are read by
  `src/lib/app/config.ts`, which is guarded by `import "server-only"` — no
  client component can import it, and no page ships them.
- `.env*` and the local store `/.data/` are gitignored; the public repo must
  never contain keys or household data.
- The local JSON store is a demo store. It is not a hardened multi-tenant
  database; a production deployment would sit Postgres behind the existing
  repository seam (the driver seam in `src/lib/store/`), with row-level
  authorization re-checked in the same services.
- The hosted Redis driver uses fresh snapshots and atomic compare-and-set
  writes. Binding is re-derived inside consent/execution mutation snapshots,
  including conflict retries. Credentials stay server-side. This remains a
  shared synthetic demo ledger, not tenant-isolated production storage.

## Threat model summary

| Threat | Mitigation in this build |
| --- | --- |
| Prompt injection in offer/document text → agent pays anyway | Deterministic engine decides; quotes are the only money source; injection scan + benchmark cases |
| LLM hallucinated price or missing fee | LLM cannot price; totals computed in integer arithmetic from validated quotes; unknowns block approval |
| Silent auto-payment via an "allow" | `allow` is inert; consent is a separate, hash-bound, expiring approval |
| Over-charging through budget drift | Env caps re-checked per execution; decimals as integer strings; duplicate execution impossible by state |
| Stale approval reused after terms change | Hash re-derivation (`APPROVAL_STALE`), 24 h TTL, offer-version binding |
| Impersonated household member | HMAC session + per-request membership/role checks; viewer is read-only at the service layer |
| Leaked secrets | server-only config boundary; gitignored env/store; no secrets in client bundles |
| Fabricated integration health | status endpoints are live probes, not config inference |

## What is NOT proven (and is therefore not claimed)

1. **Real payment execution.** The Kite `live` path is implemented behind the
   adapter interface but the demo never executes it — simulated, labelled
   simulated, everywhere.
2. **Production authentication.** No passwords/identity provider; the login
   screen is demo-scoped.
3. **Tamper-externalized receipts** (no signing/anchoring; the chain is
   integrity-consistent, not adversary-proof).
4. **Multi-tenant hardening** of the JSON store; the repository seam is where
   a real database slots in.
5. **Rate limiting / brute-force protection** on the demo auth endpoint.
6. **End-to-end encryption of store contents at rest** (plaintext JSON
   locally).

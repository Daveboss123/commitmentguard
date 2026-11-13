# Build plan implementation matrix

This matrix audits the original `COMMITMENTGUARD_BUILD_CHANGE_PLAN.md` against the renamed **trycommit** build. "Implemented" means the behavior exists and was verified; "partial" and "not implemented" are intentionally not presented as complete.

## Summary

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Positioning and platform story | Implemented | Landing story, deterministic-engine principle, eight-step conceptual platform flow. |
| Cost reconciliation | Implemented | `tco-1.1.0`, integer minor units, auditable 12/24-month lines, derived +$760, tests. |
| Engine benchmark | Implemented | 30 fixed cases, per-case provenance, every percentage has a numerator/denominator. |
| SERV extraction benchmark | **Not implemented** | The UI and docs say **Not measured**. A repeatable labelled live-document evaluation is still required. |
| User-visible reasoning trace | Implemented, with recorded-data limits | Eight stages; live intent extraction has actual model/latency. Seeded offer extraction is labelled Demo fixture. Engine stages without timing say not instrumented. |
| SERV failure-path tests | **Partial** | Typed timeout/unavailable/invalid-output handling exists; benchmark covers malformed evidence/unknowns. Dedicated mocked 429, timeout, refusal, and malformed-response integration tests are still required. |
| Evidence provenance/explorer | Implemented for available data | Highlighted quotes, field/value, page, evidence id, hash, origin label, timestamp, currentness and conflicts. Source authenticity says Not checked. Fixture documents have no external URL, so none is invented. |
| Prompt-injection resistance | Implemented | Source text is treated as data, schemas gate model output, deterministic engine decides, benchmark includes injection cases. |
| Approval binding and stale protection | Implemented in service layer | Canonical hash includes policy/intent/offer/commitment/evidence/cost-model versions; re-derived on consent/execution; `APPROVAL_STALE` tests. |
| Guided post-approval offer-change demo | Implemented as a non-persistent preview | The scenario sandbox can create a hypothetical offer v+1 with a changed provider price, re-run evidence and the real engine, compare the resulting canonical hash with recorded consent and show `APPROVAL_STALE — fresh consent required`. The stored offer and approval are not mutated. |
| Explicit outcomes and explanation | Implemented with existing names | allow/review/block, typed stale/execution states, structured reason codes, evidence and calculations. Optional SERV prose is separate and cannot vote. |
| Kite payment honesty | Implemented as simulated adapter | Mock/simulated mode, 0.05 caps, approval and duplicate checks, no provider-activation claim. No live payment was executed. |
| Receipts and verifier | Implemented, unsigned | Canonical payload, sequence, previous hash, read-only verifier, format/hash/analysis/stage checks, download/export. Cryptographic signatures/checkpoints are **not implemented** and labelled Not checked. |
| Commitment-change sandbox | Implemented | Backend engine re-run, no persistence, explicit document exclusion wins, exact minor-unit inputs. |
| Visual direction | Implemented and continuing | Editorial casefile system, verdict stamp, restrained palette, product UI, responsive records/evidence/trace. |
| Responsive/accessibility | **Partial, tested scope documented** | Keyboard focus, skip link, 44px key controls, reduced motion, mobile nav, card/table adaptations. Not a claim of formal WCAG conformance; screen-reader/large-text coverage remains manual. |
| Overview recommendations | Partial by design | Household commitments, latest decisions, blocked/review counts, integrations and activity are real. "Protected agents" and a decisions-over-time chart are omitted because no meaningful real time-series/agent registry exists in this demo. |
| Security/reliability checklist | Partial | Server-only secrets, roles, validation, shared CAS storage, stale approval, replay/idempotency and safe upload paths exist. Production rate limiting, production identity, tenant-grade storage isolation, signed audit checkpoints and full dependency-remediation evidence remain out of scope. |

## Acceptance status

- Cost and commitment engine acceptance items are covered by domain, benchmark and workflow tests.
- Deployed live SERV intent extraction has been observed and recorded; fixture offer extraction is visibly labelled.
- The full production path—block/allow/review, consent, capped simulated execution and receipt verification—has been exercised.
- The remaining blocker before claiming the *entire plan* complete is a scored SERV extraction benchmark with a full mocked failure harness. Production-hardening recommendations are explicitly limitations, not hidden roadmap claims.

# trycommit demo video

Target: a judge-oriented product walkthrough in the same style as the RunLatch demo.

## Production rules

- Voice: local Kokoro `af_heart`, identical to RunLatch; no paid TTS call.
- Tight pacing: 0.08 s lead/tail and 0.15 s between sentences.
- Reject any unexpected silence longer than 0.45 seconds during final composition.
- Capture the deployed product at 1920×1080, 30 fps. No synthetic product screens.
- Chapter labels may be editorial overlays; product facts must come from the live UI.
- Do not perform another payment. Show the existing **simulated** execution and receipt.
- Always say that provider activation, signature and settlement are not checked.

## Chapters

| Chapter | Judge action shown | Proof on screen |
| --- | --- | --- |
| 1. The problem | Landing → Open the demo | Enforcement-layer positioning; engine benchmark denominators |
| 2. Commitments | Demo login → dashboard → analyses | Household baseline, commitments, live SERV intent metadata |
| 3. The block | Open BrightWave → cost lines → evidence | Block reasons, +$760, reconciled line items, highlighted quote, authenticity Not checked |
| 4. The binding | Open HarborLink → scenario → price 35→60 | Allow becomes Block; offer v2 hash differs; `APPROVAL_STALE`; no persistence |
| 5. Consent and receipt | Approval → existing simulated execution → receipt | Exact hash/version/expiry, 0.05 cap, simulated state, seven verifier checks (five passed, signature and settlement explicitly not checked) |
| 6. Platform fit | Benchmark → Integrations | 30/30 engine suite, SERV Not measured, eight-phase conceptual integration flow |

The narration text, timings and capture plan live with the local video tooling;
the generated narration manifest records the same text and cue timings.

import { Badge, Panel, PanelHeader } from "./ui";

interface FlowStep {
  title: string;
  method: "POST" | "GET";
  path: string;
  detail: string;
  request?: string;
  response?: string;
  note?: string;
}

const steps: FlowStep[] = [
  {
    title: "Bind a household and its policy",
    method: "POST",
    path: "/api/households",
    detail:
      "The platform creates the household that owns the commitments, then writes the hard limits the agent must obey.",
    request: `{
  "name": "Morgan household",
  "currency": "USD",
  "locale": "en-US",
  "ownerDisplayName": "Alex Morgan"
}

// then: PUT /api/households/{id}/policy
{
  "minimumMonthlySavingMinor": 1000,
  "maxContractMonths": 12,
  "mustKeepBenefits": ["family_mobile_bundle_discount"],
  "unknownCriticalTermsPolicy": "review"
}`,
    response: `{
  "household": { "id": "hh_…", "currency": "USD" },
  "policy": { "id": "pol_…", "version": 3 }
}`,
    note: "All money is an integer count of minor units. The policy is versioned, and every analysis records the version it used.",
  },
  {
    title: "Supply the current ledger and its evidence",
    method: "POST",
    path: "/api/households/{id}/commitments",
    detail:
      "Existing services, benefits and dependency links. Each material figure carries an evidence reference and stays marked user-provided until a document quote supports it.",
    request: `{
  "providerName": "Northline Mobile",
  "serviceType": "mobile",
  "planName": "Family 4 lines",
  "currency": "USD",
  "recurringChargeMinor": 6000,
  "billingPeriod": "monthly",
  "minimumTermMonths": 0,
  "renewalType": "monthly"
}`,
    response: `{
  "commitment": { "id": "cm_…", "status": "active" },
  "evidenceIds": ["ev_…"]
}`,
  },
  {
    title: "Interpret the request",
    method: "POST",
    path: "/api/intents/extract",
    detail:
      "SERV turns the natural-language request into a structured intent. Extraction only: it cannot choose allow, review or block. The household confirms the result before it is used.",
    request: `{
  "householdId": "hh_…",
  "request": "Find a cheaper broadband and mobile package, keep the family discount, and avoid contracts over 12 months."
}`,
    response: `{
  "intent": {
    "id": "int_…",
    "minimumMonthlySavingMinor": 1000,
    "maxContractMonths": 12,
    "extractionSource": "serv",
    "servLatencyMs": 1180
  },
  "requiresConfirmation": true
}

// then: POST /api/intents/{id}/confirm`,
    note: "If SERV is configured but unavailable, the call fails closed. The labelled demo parser is used only when SERV is deliberately absent.",
  },
  {
    title: "Submit the offer and its document",
    method: "POST",
    path: "/api/offers",
    detail:
      "The offer arrives as text plus the original document. Term extraction quotes each material fact, and every quote is validated against the recorded source.",
    request: `{
  "householdId": "hh_…",
  "providerName": "Brightwave",
  "planName": "Fibre 300",
  "sourceText": "…the document text…",
  "documentId": "doc_…"
}

// then: POST /api/offers/{id}/analyze-terms`,
    response: `{
  "offer": {
    "id": "off_…",
    "offerVersion": 1,
    "extractionSource": "serv",
    "terms": { "promotionalMonthlyPriceMinor": 3000 }
  },
  "evidence": { "total": 9, "valid": 9 }
}`,
    note: "A hash proves the document matches the recorded version. It does not prove the source is authentic, and the UI says so.",
  },
  {
    title: "Get the decision",
    method: "POST",
    path: "/api/analyses",
    detail:
      "The deterministic engine prices the current and proposed arrangement in integer minor units, validates evidence, and evaluates every hard constraint. The model has no vote.",
    request: `{
  "intentId": "int_…",
  "offerId": "off_…"
}`,
    response: `{
  "analysis": {
    "id": "ana_…",
    "decision": "block",
    "inputHash": "…",
    "totals": {
      "currentTco24Minor": 204000,
      "proposedTco24Minor": 280000,
      "delta24Minor": 76000
    },
    "evidenceValidation": { "valid": 9, "total": 9 },
    "reasons": [
      { "code": "MAX_CONTRACT_MONTHS", "severity": "critical" }
    ]
  },
  "receipt": { "id": "rcpt_…", "receiptVersion": 1 }
}`,
    note: "allow → consent may be recorded. review → consent refused until unknowns are resolved. block → consent refused by the service with 409 HARD_CONSTRAINT_VIOLATION.",
  },
  {
    title: "Record consent against the exact analysis",
    method: "POST",
    path: "/api/analyses/{id}/approval",
    detail:
      "The approver ticks every high or critical consequence. The approval stores the analysis hash, offer version and a 24-hour expiry.",
    request: `{
  "decision": "approve",
  "acknowledgedConsequences": ["cons_…"],
  "approverRole": "owner"
}`,
    response: `{
  "approval": {
    "id": "apv_…",
    "analysisHash": "…",
    "offerVersion": 1,
    "expiresAt": "2026-11-13T09:00:00.000Z"
  },
  "receipt": { "id": "rcpt_…", "stage": "approval" }
}`,
    note: "If the offer, ledger, evidence or cost model changed, the service answers 409 APPROVAL_STALE instead of recording consent.",
  },
  {
    title: "Execute, capped",
    method: "POST",
    path: "/api/analyses/{id}/executions",
    detail:
      "A Kite Passport session is requested with explicit caps. In this demo build execution is simulated and labelled; provider activation is not integrated.",
    request: `{
  "approvalId": "apv_…",
  "maxTotalUsdc": "0.05",
  "maxPerTxUsdc": "0.05"
}`,
    response: `{
  "execution": {
    "id": "exe_…",
    "status": "pending_authorization",
    "executionMode": "simulated",
    "providerActivation": "not_integrated"
  }
}

// POST /api/executions/{id}/execute`,
    note: "Over-cap requests are refused before the adapter is called. A duplicate execute answers 409 EXECUTION_ALREADY_SUBMITTED.",
  },
  {
    title: "Verify the receipt chain",
    method: "GET",
    path: "/api/receipts/{id}",
    detail:
      "Each stage appends a receipt whose content hash covers the canonical payload and links to the previous receipt.",
    request: `// then
GET /api/receipts/{id}/verify`,
    response: `{
  "verification": {
    "valid": true,
    "chainValid": true,
    "computedHash": "…",
    "storedHash": "…"
  }
}`,
    note: "Verified means the record was not edited and the chain link is intact. It does not prove authorship, provider activation or that real funds moved.",
  },
];

/**
 * A conceptual walkthrough of the calls this app actually exposes. The bodies
 * are abbreviated shapes, not a published SDK contract, and the panel says so
 * on every step.
 */
export function PlatformFlow() {
  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Embedding the guard in an agent platform"
        description="The same calls this app makes, in order. Paths are real routes in this build; request and response bodies are abbreviated conceptual shapes, not a published SDK contract."
        action={<Badge tone="caution">Conceptual API</Badge>}
      />
      <ol className="divide-y divide-line">
        {steps.map((step, index) => (
          <li key={step.path + step.title}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-3 hover:bg-surface">
                <span className="mt-0.5 font-mono-num text-[10px] text-ink-faint">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[12px] font-medium text-ink">
                      {step.title}
                    </span>
                    <span className="font-mono-num text-[9px] text-ink-faint">
                      {step.method} {step.path}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-ink-muted">
                    {step.detail}
                  </span>
                </span>
              </summary>
              <div className="border-t border-line bg-surface px-5 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <Badge tone="neutral">Conceptual shape</Badge>
                  <span className="font-mono-num text-[9px] text-ink-faint">
                    {step.method} {step.path}
                  </span>
                </div>
                {step.request ? (
                  <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap border border-line bg-raised px-3 py-2 font-mono-num text-[10px] leading-5 text-ink-muted">
                    {step.request}
                  </pre>
                ) : null}
                {step.response ? (
                  <>
                    <div className="mt-2 text-[9px] uppercase tracking-wide text-ink-faint">
                      Response
                    </div>
                    <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap border border-line bg-raised px-3 py-2 font-mono-num text-[10px] leading-5 text-ink-muted">
                      {step.response}
                    </pre>
                  </>
                ) : null}
                {step.note ? (
                  <p className="mt-2 text-[10px] leading-4 text-ink-faint">
                    {step.note}
                  </p>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ol>
      <div className="border-t border-line bg-surface px-5 py-3">
        <p className="text-[10px] leading-4 text-ink-faint">
          Integration status: the decision, consent, execution, receipt and
          scenario routes are implemented and exercised by this demo. The Kite
          adapter runs in{" "}
          <span className="font-mono-num">simulated</span> mode in this
          deployment; {" "}
          <span className="font-mono-num">provider_activation</span> is{" "}
          <span className="font-mono-num">not_integrated</span>. No aggregate
          service API or SDK is published from this repository.
        </p>
      </div>
    </Panel>
  );
}

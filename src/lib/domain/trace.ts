import type {
  Analysis,
  Offer,
  IntentContract,
} from "./types";

export type TraceStageStatus = "passed" | "failed" | "unknown" | "not_instrumented";

export interface ReasoningStage {
  id: string;
  label: string;
  status: TraceStageStatus;
  /** Where the output came from. Fixture data is never presented as SERV. */
  source: "serv" | "engine" | "policy" | "demo_fixture";
  correlationId: string | null;
  /** Only recorded durations are shown; engine stages are not instrumented. */
  durationMs: number | null;
  schemaVersion: string;
  /** Redacted summary: counts and identifiers, never document text or PII. */
  summary: string;
  detail: string[];
}

export interface FailureHandling {
  condition: string;
  outcome: string;
}

export interface ReasoningTrace {
  analysisId: string;
  correlationId: string;
  stages: ReasoningStage[];
  failureHandling: FailureHandling[];
  demoFixture: boolean;
}

export interface TraceInput {
  analysis: Analysis;
  intent: IntentContract | null;
  offer: Offer | null;
  commitmentsCount: number;
  benefitsCount: number;
  dependenciesCount: number;
  documentsCount: number;
}

function redacted(value: string, max = 120): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

/**
 * Builds the user-visible reasoning trace from data that was actually
 * recorded with the analysis. It never invents timings or model calls: SERV
 * latency appears only when the extraction service reported it.
 */
export function buildReasoningTrace(input: TraceInput): ReasoningTrace {
  const { analysis, intent, offer } = input;
  const evidence = analysis.evidenceValidation;
  const invalid =
    evidence.invalidEvidenceIds.length + evidence.contradictedEvidenceIds.length;
  const offerIsFixture = offer?.extractionSource === "demo_fixture";
  const intentIsFixture = intent?.extractionSource === "demo_parser";
  const demoFixture = offerIsFixture || intentIsFixture;

  const stages: ReasoningStage[] = [
    {
      id: "request_interpretation",
      label: "Request interpretation",
      status: intent ? "passed" : "unknown",
      source: intent?.extractionSource === "serv" ? "serv" : "demo_fixture",
      correlationId: intent?.servRequestId ?? intent?.id ?? null,
      durationMs: intent?.servLatencyMs ?? null,
      schemaVersion: "serv.intent.v1",
      summary: intent
        ? redacted(intent.goal)
        : "No confirmed intent is stored for this analysis.",
      detail: intent
        ? [
            `Request length ${intent.originalRequest.length} chars (text not echoed)`,
            `Model: ${intent.extractionModel}`,
            `Extraction source: ${intent.extractionSource}`,
            `Confirmed by the household: ${intent.userConfirmedAt ?? "not recorded"}`,
          ]
        : [],
    },
    {
      id: "commitment_extraction",
      label: "Household commitment extraction",
      status: "passed",
      source: "engine",
      correlationId: analysis.householdId,
      durationMs: null,
      schemaVersion: "household.snapshot.v1",
      summary: `${input.commitmentsCount} active commitment(s), ${input.benefitsCount} benefit(s), ${input.dependenciesCount} dependency link(s), ${input.documentsCount} source document(s).`,
      detail: [
        "The ledger snapshot is read inside the same mutation that writes the analysis.",
        "Household-entered figures stay marked user-provided and are never promoted to verified document facts.",
      ],
    },
    {
      id: "offer_term_extraction",
      label: "Offer-term extraction",
      status: offer ? "passed" : "unknown",
      source: offerIsFixture ? "demo_fixture" : "serv",
      correlationId:
        offer?.extractionResponseId ?? offer?.rawDocumentId ?? offer?.id ?? null,
      durationMs: offer?.extractionLatencyMs ?? null,
      schemaVersion: "serv.offer_terms.v1",
      summary: offer
        ? `${offer.evidence.length} quoted fact(s) extracted from “${redacted(offer.sourceLabel, 80)}”.`
        : "The offer document is unavailable.",
      detail: offer
        ? [
            `Extraction source: ${offer.extractionSource}`,
            offer.extractionModel ? `Model: ${offer.extractionModel}` : "Model: not recorded",
            `Offer version: ${offer.offerVersion}`,
            `Document hash: ${offer.evidence[0]?.sourceVersionHash.slice(0, 16) ?? "not recorded"}…`,
          ]
        : [],
    },
    {
      id: "schema_validation",
      label: "Structured-output validation",
      status: "passed",
      source: "engine",
      correlationId: analysis.id,
      durationMs: null,
      schemaVersion: "analysis.v1",
      summary: `${analysis.unknowns.length} material unknown(s) recorded; unknown values are never coerced to zero.`,
      detail: [
        "The model output is parsed by a strict schema before any money is computed.",
        ...analysis.unknowns.slice(0, 3).map((unknown) => `Unknown: ${redacted(unknown, 100)}`),
      ],
    },
    {
      id: "evidence_validation",
      label: "Evidence validation",
      status: invalid > 0 ? "failed" : "passed",
      source: "engine",
      correlationId: analysis.inputHash,
      durationMs: null,
      schemaVersion: "evidence.v1",
      summary: `${evidence.valid}/${evidence.total} quote(s) located in their source; ${evidence.contradictedEvidenceIds.length} contradiction(s).`,
      detail: [
        "Quote matching is whitespace-insensitive but otherwise exact.",
        "A hash proves integrity against the recorded source version, not that the source is authentic.",
        ...evidence.invalidEvidenceIds
          .slice(0, 3)
          .map((id) => `Failed quote validation: ${id}`),
      ],
    },
    {
      id: "consequence_calculation",
      label: "Deterministic consequence calculation",
      status: "passed",
      source: "engine",
      correlationId: analysis.totals.current12.calculationVersion,
      durationMs: null,
      schemaVersion: "tco.v1",
      summary: `12-month ${analysis.totals.delta12Minor === null ? "unknown" : `${analysis.totals.proposed12.totalMinor} vs ${analysis.totals.current12.totalMinor} minor`}; 24-month ${analysis.totals.delta24Minor === null ? "unknown" : `${analysis.totals.proposed24.totalMinor} vs ${analysis.totals.current24.totalMinor} minor`}.`,
      detail: [
        `Cost model: ${analysis.totals.current12.calculationVersion}`,
        `Line items: ${analysis.totals.current24.lines?.length ?? 0} current, ${analysis.totals.proposed24.lines?.length ?? 0} proposed`,
        "Integer minor units only. No floating-point arithmetic feeds a total.",
      ],
    },
    {
      id: "commitment_evaluation",
      label: "Commitment evaluation",
      status: "passed",
      source: "policy",
      correlationId: analysis.intentContractId,
      durationMs: null,
      schemaVersion: "policy.v1",
      summary: `${analysis.decisionReasons.length} reason(s) recorded; ${analysis.decisionReasons.filter((reason) => reason.severity === "critical").length} critical.`,
      detail: analysis.decisionReasons
        .slice(0, 5)
        .map((reason) => `${reason.code}: ${redacted(reason.title, 90)}`),
    },
    {
      id: "final_decision",
      label: "Final decision",
      status: "passed",
      source: "engine",
      correlationId: analysis.inputHash,
      durationMs: null,
      schemaVersion: "decision.v1",
      summary: `Engine returned ${analysis.decision.toUpperCase()}.`,
      detail: [
        "The language model does not vote on allow, review or block.",
        `Analysis hash: ${analysis.inputHash.slice(0, 24)}…`,
        `Recorded at ${analysis.createdAt}`,
      ],
    },
  ];

  return {
    analysisId: analysis.id,
    correlationId: analysis.intentContractId,
    stages,
    demoFixture,
    failureHandling: [
      {
        condition: "SERV timeout or rate limit",
        outcome:
          "Extraction fails closed with a typed error. No analysis is produced from an invented fallback.",
      },
      {
        condition: "Invalid JSON or schema mismatch",
        outcome:
          "The response is rejected before any money is computed; the caller receives an extraction error.",
      },
      {
        condition: "Missing material field",
        outcome:
          "The field stays unknown. The decision becomes review (the REVIEW_REQUIRED equivalent) and approval is refused.",
      },
      {
        condition: "Unsupported currency",
        outcome:
          "The engine blocks with CURRENCY_MISMATCH. No exchange rate is guessed.",
      },
      {
        condition: "Unverifiable quote",
        outcome:
          "EVIDENCE_INVALID forces review; a contradiction between sources blocks.",
      },
      {
        condition: "Model refusal or conflicting interpretation",
        outcome:
          "No decision is generated without a structured, validated output; the request returns an error or review.",
      },
    ],
  };
}

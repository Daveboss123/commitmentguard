import type { Decision } from "@/lib/domain/types";
import { buildAnalysis } from "@/lib/domain/decision";
import { scanForInjection } from "@/lib/security/injection";
import { benchmarkCases, type BenchmarkCase, type BenchmarkCategory } from "./cases";

export interface BenchmarkCaseResult {
  id: string;
  category: BenchmarkCategory;
  title: string;
  note: string;
  expectedDecision: Decision;
  actualDecision: Decision;
  decisionMatch: boolean;
  expectedReasons: string[];
  actualReasons: string[];
  missingReasons: string[];
  expected: BenchmarkCase["expected"];
  actual: {
    current12Minor: number | null;
    proposed12Minor: number | null;
    current24Minor: number | null;
    proposed24Minor: number | null;
    consequenceTitles: string[];
    unknownCount: number;
    evidenceValid: number;
    evidenceTotal: number;
    invalidEvidenceIds: string[];
    contradictedEvidenceIds: string[];
  };
  consequenceHits: string[];
  consequenceMisses: string[];
  totalsMatch: boolean;
  injectionDetected: boolean;
  injectionMatch: boolean;
  passed: boolean;
}

export interface BaselineMetrics {
  name: string;
  description: string;
  decisionAccuracy: number;
  hardConstraintEscapeRate: number;
  falseBlockRate: number;
  materialConsequenceRecall: number;
  tcoAccuracy: number;
}

export interface BenchmarkMetrics {
  totalCases: number;
  passedCases: number;
  overallPassRate: number;
  decisionAccuracy: number;
  hardConstraintBlockRate: number;
  falseBlockRate: number;
  materialConsequenceRecall: number;
  tcoAccuracy: number;
  evidenceQuoteValidity: number;
  unknownHandlingAccuracy: number;
  humanInterruptionRate: number;
  meanAnalysisLatencyMs: number;
  approvalRequiredRate: number;
  paymentAllowedRate: number;
}

export interface CategorySummary {
  category: BenchmarkCategory;
  label: string;
  total: number;
  passed: number;
}

export interface BenchmarkReport {
  generatedAt: string;
  engineVersion: string;
  metrics: BenchmarkMetrics;
  baselines: BaselineMetrics[];
  categories: CategorySummary[];
  cases: BenchmarkCaseResult[];
  notes: string[];
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

const CATEGORY_LABELS: Record<BenchmarkCategory, string> = {
  hidden_fees: "Hidden fees & recurring costs",
  promotion_renewal: "Promotion expiry & renewal",
  benefits_dependencies: "Lost benefits & dependencies",
  contract_etf: "Contract duration & cancellation",
  evidence_integrity: "Evidence integrity",
  prompt_injection: "Prompt injection",
};

function matchConsequence(caseExpected: string[], titles: string[]): {
  hits: string[];
  misses: string[];
} {
  const haystack = titles.join(" \n ").toLowerCase();
  const hits = caseExpected.filter((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
  const misses = caseExpected.filter(
    (keyword) => !haystack.includes(keyword.toLowerCase()),
  );
  return { hits, misses };
}

function decisionForBaselineA(item: BenchmarkCase): Decision {
  const replaced = item.commitments.filter((commitment) =>
    item.offer.serviceType === "bundle"
      ? true
      : commitment.serviceType === item.offer.serviceType,
  );
  const replacedMonthly = replaced.reduce(
    (sum, commitment) => sum + commitment.recurringChargeMinor,
    0,
  );
  const advertised = item.offer.terms.promotionalMonthlyPriceMinor;
  if (advertised !== null && advertised < replacedMonthly) return "allow";
  return "block";
}

function decisionForBaselineB(item: BenchmarkCase): Decision {
  const currentMonthly = item.commitments.reduce(
    (sum, commitment) => sum + commitment.recurringChargeMinor,
    0,
  );
  const currentBenefits = item.benefits.reduce(
    (sum, benefit) => sum + (benefit.valueMinor ?? 0),
    0,
  );
  const advertised = item.offer.terms.promotionalMonthlyPriceMinor;
  if (advertised !== null && advertised <= currentMonthly - currentBenefits) {
    return "allow";
  }
  return "review";
}

export function runBenchmark(): BenchmarkReport {
  const started = performance.now();
  const cases: BenchmarkCaseResult[] = benchmarkCases.map((item) => {
    const analysis = buildAnalysis({
      householdId: item.intent.householdId,
      intent: item.intent,
      policy: item.policy,
      offer: item.offer,
      commitments: item.commitments,
      benefits: item.benefits,
      dependencies: item.dependencies,
      currentEvidence: item.currentEvidence,
      documents: item.documents,
    });
    const actualReasons = analysis.decisionReasons.map((reason) => reason.code);
    const missingReasons = item.expected.reasonCodes.filter(
      (code) => !actualReasons.includes(code),
    );
    const consequenceTitles = analysis.consequences.map(
      (consequence) => `${consequence.title} — ${consequence.description}`,
    );
    const { hits, misses } = matchConsequence(
      item.expected.consequenceKeywords,
      consequenceTitles,
    );
    const totalsMatch =
      analysis.totals.current12.totalMinor === item.expected.current12Minor &&
      analysis.totals.proposed12.totalMinor === item.expected.proposed12Minor &&
      analysis.totals.current24.totalMinor === item.expected.current24Minor &&
      analysis.totals.proposed24.totalMinor === item.expected.proposed24Minor;
    const injection = scanForInjection(
      item.documents.map((document) => document.text).join("\n"),
    );
    const injectionMatch = injection.detected === item.expected.injectionDetected;
    const decisionMatch = analysis.decision === item.expected.decision;
    const passed =
      decisionMatch &&
      missingReasons.length === 0 &&
      totalsMatch &&
      misses.length === 0 &&
      injectionMatch;

    return {
      id: item.id,
      category: item.category,
      title: item.title,
      note: item.note,
      expectedDecision: item.expected.decision,
      actualDecision: analysis.decision,
      decisionMatch,
      expectedReasons: item.expected.reasonCodes,
      actualReasons,
      missingReasons,
      expected: item.expected,
      actual: {
        current12Minor: analysis.totals.current12.totalMinor,
        proposed12Minor: analysis.totals.proposed12.totalMinor,
        current24Minor: analysis.totals.current24.totalMinor,
        proposed24Minor: analysis.totals.proposed24.totalMinor,
        consequenceTitles: analysis.consequences.map((consequence) => consequence.title),
        unknownCount: analysis.unknowns.length,
        evidenceValid: analysis.evidenceValidation.valid,
        evidenceTotal: analysis.evidenceValidation.total,
        invalidEvidenceIds: analysis.evidenceValidation.invalidEvidenceIds,
        contradictedEvidenceIds:
          analysis.evidenceValidation.contradictedEvidenceIds,
      },
      consequenceHits: hits,
      consequenceMisses: misses,
      totalsMatch,
      injectionDetected: injection.detected,
      injectionMatch,
      passed,
    };
  });

  const elapsed = performance.now() - started;
  const total = cases.length;
  const passed = cases.filter((item) => item.passed).length;
  const decisionMatches = cases.filter((item) => item.decisionMatch).length;
  const expectedBlock = cases.filter(
    (item) => item.expectedDecision === "block",
  );
  const expectedAllow = cases.filter(
    (item) => item.expectedDecision === "allow",
  );
  const blocked = expectedBlock.filter(
    (item) => item.actualDecision === "block",
  ).length;
  const falseBlocks = expectedAllow.filter(
    (item) => item.actualDecision === "block",
  ).length;
  const consequenceTotal = cases.reduce(
    (sum, item) => sum + item.expected.consequenceKeywords.length,
    0,
  );
  const consequenceHits = cases.reduce(
    (sum, item) => sum + item.consequenceHits.length,
    0,
  );
  const tcoFields = cases.reduce(
    (sum, item) =>
      sum +
      [
        item.actual.current12Minor === item.expected.current12Minor,
        item.actual.proposed12Minor === item.expected.proposed12Minor,
        item.actual.current24Minor === item.expected.current24Minor,
        item.actual.proposed24Minor === item.expected.proposed24Minor,
      ].filter(Boolean).length,
    0,
  );
  const evidenceTotal = cases.reduce(
    (sum, item) => sum + item.actual.evidenceTotal,
    0,
  );
  const evidenceValid = cases.reduce(
    (sum, item) => sum + item.actual.evidenceValid,
    0,
  );
  const unknownCases = cases.filter(
    (item) =>
      item.expected.reasonCodes.includes("UNKNOWN_CRITICAL_TERMS") ||
      item.expected.reasonCodes.includes("EVIDENCE_INVALID"),
  );
  const unknownHandled = unknownCases.filter(
    (item) =>
      item.actualDecision !== "allow" &&
      (item.actual.unknownCount > 0 || item.actual.invalidEvidenceIds.length > 0),
  ).length;

  const baselineA = {
    name: "Baseline A — ordinary LLM agent",
    description:
      "Recommends when the advertised promotional price is below the service it replaces; no ledger, dependencies, evidence, fees or contract constraints.",
    decisions: benchmarkCases.map((item) => decisionForBaselineA(item)),
  };
  const baselineB = {
    name: "Baseline B — permission / spend control",
    description:
      "Allows when the advertised monthly price is within the current household spend; no total cost, benefit or evidence model.",
    decisions: benchmarkCases.map((item) => decisionForBaselineB(item)),
  };

  const baselineMetrics = [baselineA, baselineB].map((baseline) => {
    const baselineDecisionMatches = baseline.decisions.filter(
      (decision, index) => decision === cases[index].expectedDecision,
    ).length;
    const baselineEscapes = baseline.decisions.filter(
      (decision, index) =>
        decision === "allow" && cases[index].expectedDecision === "block",
    ).length;
    const baselineFalseBlocks = baseline.decisions.filter(
      (decision, index) =>
        decision === "block" && cases[index].expectedDecision === "allow",
    ).length;
    return {
      name: baseline.name,
      description: baseline.description,
      decisionAccuracy: round(ratio(baselineDecisionMatches, total)),
      hardConstraintEscapeRate: round(
        ratio(baselineEscapes, Math.max(expectedBlock.length, 1)),
      ),
      falseBlockRate: round(
        ratio(baselineFalseBlocks, Math.max(expectedAllow.length, 1)),
      ),
      materialConsequenceRecall: 0,
      tcoAccuracy: 0,
    };
  });

  const metrics: BenchmarkMetrics = {
    totalCases: total,
    passedCases: passed,
    overallPassRate: round(ratio(passed, total)),
    decisionAccuracy: round(ratio(decisionMatches, total)),
    hardConstraintBlockRate: round(ratio(blocked, Math.max(expectedBlock.length, 1))),
    falseBlockRate: round(ratio(falseBlocks, Math.max(expectedAllow.length, 1))),
    materialConsequenceRecall: round(ratio(consequenceHits, consequenceTotal)),
    tcoAccuracy: round(ratio(tcoFields, total * 4)),
    evidenceQuoteValidity: round(ratio(evidenceValid, Math.max(evidenceTotal, 1))),
    unknownHandlingAccuracy: round(
      ratio(unknownHandled, Math.max(unknownCases.length, 1)),
    ),
    humanInterruptionRate: round(
      ratio(
        cases.filter((item) => item.actualDecision !== "allow").length,
        total,
      ),
    ),
    meanAnalysisLatencyMs: round(elapsed / total),
    approvalRequiredRate: round(
      ratio(
        cases.filter((item) => item.expected.approvalRequired).length,
        total,
      ),
    ),
    paymentAllowedRate: round(
      ratio(
        cases.filter((item) => item.expected.paymentAllowed).length,
        total,
      ),
    ),
  };

  const categories = (
    Object.keys(CATEGORY_LABELS) as BenchmarkCategory[]
  ).map((category) => {
    const group = cases.filter((item) => item.category === category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      total: group.length,
      passed: group.filter((item) => item.passed).length,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    engineVersion: "1.0.0",
    metrics,
    baselines: baselineMetrics,
    categories,
    cases,
    notes: [
      "All 30 labels are hand-authored and fixed; the runner does not call SERV and does not use an LLM to judge outputs.",
      "Baselines are controlled experimental baselines, not claims about any real competitor.",
      "The benchmark never proves provider activation or payment success; those states are outside the deterministic engine.",
      "Every dollar figure is checked as integer minor units, never as a floating-point total.",
    ],
  };
}

import "server-only";
import type {
  Analysis,
  Approval,
  Database,
  DecisionReceipt,
  Execution,
  IntentContract,
  Offer,
  UserPolicy,
} from "@/lib/domain/types";
import type {
  ScenarioEvaluation,
  ScenarioOutcome,
  ScenarioOverrides,
} from "@/lib/domain/scenario";
import { buildAnalysis } from "@/lib/domain/decision";
import { formatMoneyMinor } from "@/lib/domain/money";
import { mutateDatabase, getDatabase } from "@/lib/store/database";
import {
  appendAudit,
  getAnalysis,
  getIntent,
  getOffer,
  getPolicy,
  requireHouseholdAccess,
  requireWritableHousehold,
  type HouseholdAccess,
} from "@/lib/store/repository";
import { ApiError } from "@/lib/http/errors";
import { appendReceipt } from "./receipt.service";
import { explainAnalysis } from "@/lib/integrations/serv/service";
import { isServConfigured } from "@/lib/app/config";

export interface CreateAnalysisInput {
  householdId: string;
  intentId: string;
  offerId: string;
  explain?: boolean;
}

export interface AnalysisCreationResult {
  analysis: Analysis;
  receipt: DecisionReceipt;
  explanationError: string | null;
}

function currentEvidenceIds(
  commitments: Array<{ evidenceIds: string[] }>,
  benefits: Array<{ evidenceId: string | null }>,
  dependencies: Array<{ evidenceId: string | null }>,
): string[] {
  return [
    ...new Set([
      ...commitments.flatMap((commitment) => commitment.evidenceIds),
      ...benefits.map((benefit) => benefit.evidenceId).filter((id): id is string => Boolean(id)),
      ...dependencies
        .map((dependency) => dependency.evidenceId)
        .filter((id): id is string => Boolean(id)),
    ]),
  ];
}

export function recomputeInputHash(
  analysis: Analysis,
  offer: Offer,
  intent: IntentContract,
  policy: UserPolicy,
  data: {
    commitments: AnalysisInputCommitment[];
    benefits: AnalysisInputBenefit[];
    dependencies: AnalysisInputDependency[];
    currentEvidence: Array<{ id: string; sourceVersionHash: string }>;
    documents: Array<{ id: string; text: string }>;
  },
): string {
  const rebuilt = buildAnalysis({
    householdId: analysis.householdId,
    intent,
    policy,
    offer,
    commitments: data.commitments,
    benefits: data.benefits,
    dependencies: data.dependencies,
    currentEvidence: data.currentEvidence as never,
    documents: data.documents as never,
  });
  return rebuilt.inputHash;
}

type AnalysisInputCommitment = Parameters<typeof buildAnalysis>[0]["commitments"][number];
type AnalysisInputBenefit = Parameters<typeof buildAnalysis>[0]["benefits"][number];
type AnalysisInputDependency = Parameters<typeof buildAnalysis>[0]["dependencies"][number];

/**
 * Creates an analysis from the current ledger snapshot. The deterministic
 * engine runs inside the mutation so the receipt and analysis share one
 * snapshot.
 */
export async function createAnalysis(
  input: CreateAnalysisInput,
): Promise<AnalysisCreationResult> {
  const access = await requireWritableHousehold(input.householdId);
  const intent = await getIntent(input.intentId);
  const offer = await getOffer(input.offerId);
  if (!intent || intent.householdId !== input.householdId) {
    throw new ApiError("NOT_FOUND", "Intent contract not found for this household.");
  }
  if (!offer || offer.householdId !== input.householdId) {
    throw new ApiError("NOT_FOUND", "Offer not found for this household.");
  }
  if (!intent.userConfirmedAt) {
    throw new ApiError(
      "ANALYSIS_INCOMPLETE",
      "The extracted intent must be confirmed before an analysis can run.",
    );
  }
  const policy = await getPolicy(input.householdId);
  if (!policy) {
    throw new ApiError("ANALYSIS_INCOMPLETE", "The household has no active policy.");
  }

  const result = await mutateDatabase((database) => {
    const currentIntent = database.intents.find((item) => item.id === input.intentId);
    const currentOffer = database.offers.find((item) => item.id === input.offerId);
    const currentPolicy = database.policies.find((item) => item.id === policy.id);
    if (!currentIntent || !currentOffer || !currentPolicy) {
      throw new ApiError("NOT_FOUND", "The analysis inputs are no longer available.");
    }

    const commitments = database.commitments.filter(
      (item) => item.householdId === input.householdId && item.status === "active",
    );
    const benefits = database.benefits.filter(
      (item) => item.householdId === input.householdId,
    );
    const dependencies = database.dependencies.filter(
      (item) => item.householdId === input.householdId,
    );
    const evidenceIds = currentEvidenceIds(commitments, benefits, dependencies);
    const currentEvidence = database.evidence.filter((item) =>
      evidenceIds.includes(item.id),
    );
    const documents = database.documents.filter(
      (item) => item.householdId === input.householdId,
    );

    const analysis = buildAnalysis({
      householdId: input.householdId,
      intent: currentIntent,
      policy: currentPolicy,
      offer: currentOffer,
      commitments,
      benefits,
      dependencies,
      currentEvidence,
      documents,
    });

    database.analyses.push(analysis);
    const receipt = appendReceipt(database, {
      analysis,
      intent: currentIntent,
      offer: currentOffer,
      stage: "analysis",
      actorUserId: access.session.userId,
    });

    appendAudit(database, {
      householdId: input.householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: "analysis.completed",
      entityType: "analysis",
      entityId: analysis.id,
      metadata: {
        offerId: analysis.offerId,
        offerVersion: analysis.offerVersion,
        decision: analysis.decision,
        inputHash: analysis.inputHash,
        evidenceValid: analysis.evidenceValidation.valid,
        evidenceTotal: analysis.evidenceValidation.total,
        receiptId: receipt.id,
      },
    });

    return { analysis, receipt };
  });

  return {
    ...result,
    explanationError: null,
  };
}

export async function generateExplanationForAnalysis(input: {
  analysisId: string;
  actorUserId: string;
}): Promise<Analysis> {
  const analysis = await getAnalysis(input.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const access = await requireWritableHousehold(analysis.householdId);
  const intent = await getIntent(analysis.intentContractId);
  const offer = await getOffer(analysis.offerId);
  if (!intent || !offer) {
    throw new ApiError("NOT_FOUND", "The analysis inputs are no longer available.");
  }

  if (!isServConfigured()) {
    throw new ApiError(
      "SERV_NOT_CONFIGURED",
      "SERV is not configured. A plain-language explanation cannot be generated. No action was taken.",
    );
  }

  try {
    const result = await explainAnalysis({
      analysis,
      intent,
      offer,
      actorUserId: access.session.userId,
    });
    return result.analysis;
  } catch (error) {
    await mutateDatabase((database) => {
      const stored = database.analyses.find((item) => item.id === analysis.id);
      if (stored) {
        stored.servExplanationError =
          error instanceof Error ? error.message : "SERV explanation failed.";
      }
      appendAudit(database, {
        householdId: analysis.householdId,
        actorType: "user",
        actorId: access.session.userId,
        eventType: "analysis.explanation_failed",
        entityType: "analysis",
        entityId: analysis.id,
        metadata: {
          error: error instanceof Error ? error.name : "unknown",
        },
      });
    });
    throw error;
  }
}

export interface AnalysisBundle {
  analysis: Analysis;
  intent: IntentContract | null;
  offer: Offer | null;
  policy: UserPolicy | null;
  approvals: Approval[];
  executions: Execution[];
  receipts: DecisionReceipt[];
}

export async function getAnalysisBundle(
  analysisId: string,
  access?: HouseholdAccess,
): Promise<AnalysisBundle> {
  const analysis = await getAnalysis(analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  await (access
    ? Promise.resolve(access)
    : requireHouseholdAccess(analysis.householdId));
  const database = await getDatabase();
  const intent =
    database.intents.find((item) => item.id === analysis.intentContractId) ?? null;
  return {
    analysis,
    intent,
    offer: database.offers.find((item) => item.id === analysis.offerId) ?? null,
    policy: intent
      ? (database.policies.find((item) => item.id === intent.policyId) ??
        database.policies
          .filter((item) => item.householdId === analysis.householdId)
          .sort((left, right) => right.version - left.version)[0] ??
        null)
      : null,
    approvals: database.approvals.filter((item) => item.analysisId === analysis.id),
    executions: database.executions.filter((item) => item.analysisId === analysis.id),
    receipts: database.receipts
      .filter((item) => item.analysisId === analysis.id)
      .sort((left, right) => left.receiptVersion - right.receiptVersion),
  };
}

export async function assertAnalysisCurrent(analysis: Analysis): Promise<{
  offer: Offer;
  intent: IntentContract;
  policy: UserPolicy;
  currentHash: string;
}> {
  const database = await getDatabase();
  return assertAnalysisSnapshotCurrent(analysis, database);
}

/** Same binding check inside the atomic write snapshot, including CAS retries. */
export function assertAnalysisSnapshotCurrent(analysis: Analysis, database: Database): {
  offer: Offer;
  intent: IntentContract;
  policy: UserPolicy;
  currentHash: string;
} {
  const offer = database.offers.find((item) => item.id === analysis.offerId);
  const intent = database.intents.find((item) => item.id === analysis.intentContractId);
  if (!offer || !intent) {
    throw new ApiError("APPROVAL_STALE", "The offer or intent no longer exists.");
  }
  const policyForHousehold =
    database.policies
      .filter((item) => item.householdId === analysis.householdId)
      .sort((left, right) => right.version - left.version)[0] ?? null;
  if (!policyForHousehold) {
    throw new ApiError("APPROVAL_STALE", "The household policy no longer exists.");
  }

  if (analysis.offerVersion !== offer.offerVersion) {
    throw new ApiError(
      "APPROVAL_STALE",
      "The offer changed after this analysis. Re-run the analysis before approving.",
    );
  }

  const commitments = database.commitments.filter(
    (item) => item.householdId === analysis.householdId && item.status === "active",
  );
  const benefits = database.benefits.filter(
    (item) => item.householdId === analysis.householdId,
  );
  const dependencies = database.dependencies.filter(
    (item) => item.householdId === analysis.householdId,
  );
  const evidenceIds = currentEvidenceIds(commitments, benefits, dependencies);
  const currentEvidence = database.evidence.filter((item) =>
    evidenceIds.includes(item.id),
  );
  const documents = database.documents.filter(
    (item) => item.householdId === analysis.householdId,
  );

  const rebuilt = buildAnalysis({
    householdId: analysis.householdId,
    intent,
    policy: policyForHousehold,
    offer,
    commitments,
    benefits,
    dependencies,
    currentEvidence,
    documents,
  });

  if (rebuilt.inputHash !== analysis.inputHash) {
    throw new ApiError(
      "APPROVAL_STALE",
      "The household ledger, evidence or offer changed after this analysis. Re-run the analysis.",
    );
  }

  return {
    offer,
    intent,
    policy: policyForHousehold,
    currentHash: rebuilt.inputHash,
  };
}

export type {
  ScenarioEvaluation,
  ScenarioOutcome,
  ScenarioOverrides,
} from "@/lib/domain/scenario";

export function toScenarioOutcome(analysis: Analysis): ScenarioOutcome {
  return {
    decision: analysis.decision,
    current12Minor: analysis.totals.current12.totalMinor,
    proposed12Minor: analysis.totals.proposed12.totalMinor,
    current24Minor: analysis.totals.current24.totalMinor,
    proposed24Minor: analysis.totals.proposed24.totalMinor,
    delta12Minor: analysis.totals.delta12Minor,
    delta24Minor: analysis.totals.delta24Minor,
    unknowns: analysis.unknowns,
    evidenceValid: analysis.evidenceValidation.valid,
    evidenceTotal: analysis.evidenceValidation.total,
    reasonCodes: analysis.decisionReasons.map((reason) => reason.code),
    blockers: analysis.decisionReasons
      .filter(
        (reason) => reason.severity === "critical" || reason.severity === "high",
      )
      .slice(0, 5)
      .map((reason) => ({
        code: reason.code,
        title: reason.title,
        severity: reason.severity,
      })),
    costModel: analysis.totals.current12.calculationVersion ?? "unrecorded",
  };
}

/**
 * Re-runs the real deterministic engine with hypothetical policy or offer
 * terms. The result is deliberately not persisted and cannot be approved: an
 * approval is always bound to a stored analysis hash.
 */
export async function runAnalysisScenario(
  analysisId: string,
  overrides: ScenarioOverrides,
): Promise<ScenarioEvaluation> {
  const analysis = await getAnalysis(analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  await requireHouseholdAccess(analysis.householdId);

  const database = await getDatabase();
  const intent = database.intents.find(
    (item) => item.id === analysis.intentContractId,
  );
  const offer = database.offers.find((item) => item.id === analysis.offerId);
  const policy =
    database.policies
      .filter((item) => item.householdId === analysis.householdId)
      .sort((left, right) => right.version - left.version)[0] ?? null;
  if (!intent || !offer || !policy) {
    throw new ApiError(
      "NOT_FOUND",
      "The analysis inputs are no longer available for a scenario.",
    );
  }

  const commitments = database.commitments.filter(
    (item) => item.householdId === analysis.householdId && item.status === "active",
  );
  const benefits = database.benefits.filter(
    (item) => item.householdId === analysis.householdId,
  );
  const dependencies = database.dependencies.filter(
    (item) => item.householdId === analysis.householdId,
  );
  const evidenceIds = currentEvidenceIds(commitments, benefits, dependencies);
  const currentEvidence = database.evidence.filter((item) =>
    evidenceIds.includes(item.id),
  );
  const documents = database.documents.filter(
    (item) => item.householdId === analysis.householdId,
  );

  const scenarioIntent: IntentContract = {
    ...intent,
    maxContractMonths:
      overrides.maxContractMonths === undefined
        ? intent.maxContractMonths
        : overrides.maxContractMonths,
    minimumMonthlySavingMinor:
      overrides.minimumMonthlySavingMinor === undefined
        ? intent.minimumMonthlySavingMinor
        : overrides.minimumMonthlySavingMinor,
  };
  const scenarioPolicy: UserPolicy = {
    ...policy,
    maxOneTimeFeeMinor:
      overrides.maxOneTimeFeeMinor === undefined
        ? (policy.maxOneTimeFeeMinor ?? null)
        : overrides.maxOneTimeFeeMinor,
  };
  const scenarioOffer: Offer = {
    ...offer,
    terms: {
      ...offer.terms,
      familyBundleDiscountRetained:
        overrides.retainFamilyDiscount === undefined ||
        overrides.retainFamilyDiscount === null
          ? offer.terms.familyBundleDiscountRetained
          : overrides.retainFamilyDiscount,
    },
  };

  const rebuilt = buildAnalysis({
    householdId: analysis.householdId,
    intent: scenarioIntent,
    policy: scenarioPolicy,
    offer: scenarioOffer,
    commitments,
    benefits,
    dependencies,
    currentEvidence,
    documents,
  });

  const currency = intent.currency;
  const appliedOverrides: ScenarioEvaluation["appliedOverrides"] = [];
  if (overrides.maxContractMonths !== undefined) {
    appliedOverrides.push({
      field: "maxContractMonths",
      label: "Maximum contract length",
      before:
        intent.maxContractMonths === null
          ? "no limit"
          : `${intent.maxContractMonths} months`,
      after:
        overrides.maxContractMonths === null
          ? "no limit"
          : `${overrides.maxContractMonths} months`,
    });
  }
  if (overrides.minimumMonthlySavingMinor !== undefined) {
    appliedOverrides.push({
      field: "minimumMonthlySavingMinor",
      label: "Minimum monthly saving",
      before: formatMoneyMinor(intent.minimumMonthlySavingMinor, currency),
      after: formatMoneyMinor(
        overrides.minimumMonthlySavingMinor,
        currency,
      ),
    });
  }
  if (overrides.maxOneTimeFeeMinor !== undefined) {
    appliedOverrides.push({
      field: "maxOneTimeFeeMinor",
      label: "One-off fee limit",
      before: formatMoneyMinor(policy.maxOneTimeFeeMinor ?? null, currency),
      after: formatMoneyMinor(overrides.maxOneTimeFeeMinor, currency),
    });
  }
  if (
    overrides.retainFamilyDiscount !== undefined &&
    overrides.retainFamilyDiscount !== null
  ) {
    appliedOverrides.push({
      field: "familyBundleDiscountRetained",
      label: "Family discount retained (hypothetical offer term)",
      before:
        offer.terms.familyBundleDiscountRetained === null
          ? "unknown"
          : offer.terms.familyBundleDiscountRetained
            ? "retained"
            : "lost",
      after: overrides.retainFamilyDiscount ? "retained" : "lost",
    });
  }

  return {
    label: "Hypothetical scenario",
    disclaimer:
      "Not saved, not sent to SERV, and never an approval basis. The stored analysis and any approval remain bound to the real ledger and offer version.",
    base: toScenarioOutcome(analysis),
    scenario: toScenarioOutcome(rebuilt),
    appliedOverrides,
    notPersisted: true,
    retentionLockedByExclusion: offer.terms.excludedBenefits.some(
      (item) => item.key === "family_mobile_bundle_discount",
    ),
  };
}

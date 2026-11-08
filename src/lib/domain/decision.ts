import { randomUUID } from "node:crypto";
import type {
  Analysis,
  Commitment,
  CommitmentBenefit,
  CommitmentDependency,
  Consequence,
  DemoDocument,
  Evidence,
  IntentContract,
  Offer,
  UserPolicy,
} from "./types";
import { compareTotals, calculateCurrentTco, calculateProposedTco } from "./tco";
import { validateEvidence } from "./evidence";
import { evaluateConstraints } from "./policy";
import { hashPayload } from "./canonical";
import { formatMoneyMinor } from "./money";

export interface AnalysisInput {
  householdId: string;
  intent: IntentContract;
  policy: UserPolicy;
  offer: Offer;
  commitments: Commitment[];
  benefits: CommitmentBenefit[];
  dependencies: CommitmentDependency[];
  currentEvidence: Evidence[];
  documents: DemoDocument[];
}

function consequence(
  analysisId: string,
  input: Omit<Consequence, "id" | "analysisId">,
): Consequence {
  return { id: `cons_${randomUUID()}`, analysisId, ...input };
}

function offerEvidence(offer: Offer, fields: string[]): string[] {
  return fields
    .map(
      (field) =>
        offer.evidence.find((item) => item.normalizedField === field)?.id ?? null,
    )
    .filter((id): id is string => Boolean(id));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function buildAnalysis(input: AnalysisInput): Analysis {
  const id = `ana_${randomUUID()}`;
  const { offer, intent, commitments, benefits, dependencies, policy } = input;
  const terms = offer.terms;

  const current12 = calculateCurrentTco({
    commitments,
    benefits,
    dependencies,
    horizonMonths: 12,
  });
  const proposed12 = calculateProposedTco(
    { commitments, benefits, dependencies, horizonMonths: 12 },
    offer,
  );
  const current24 = calculateCurrentTco({
    commitments,
    benefits,
    dependencies,
    horizonMonths: 24,
  });
  const proposed24 = calculateProposedTco(
    { commitments, benefits, dependencies, horizonMonths: 24 },
    offer,
  );
  const totals = compareTotals(current12, proposed12, current24, proposed24);

  const sourceTexts: Record<string, string> = {};
  for (const document of input.documents) sourceTexts[document.id] = document.text;

  const evidenceValidation = validateEvidence(
    [...input.currentEvidence, ...offer.evidence],
    sourceTexts,
  );

  const constraintResult = evaluateConstraints({
    intent,
    policy,
    offer,
    totals,
    evidenceValidation,
    benefits,
  });

  const consequences: Consequence[] = [];

  // Financial consequences.
  if (totals.delta12Minor !== null) {
    const delta = totals.delta12Minor;
    consequences.push(
      consequence(id, {
        category: "financial",
        severity: delta > 0 ? "high" : delta < 0 ? "medium" : "low",
        title:
          delta > 0
            ? "Household cost increases over 12 months"
            : delta < 0
              ? "Household cost decreases over 12 months"
              : "Household cost is unchanged over 12 months",
        description: `Current 12-month household cost is ${formatMoneyMinor(
          totals.current12.totalMinor,
          intent.currency,
        )}. Under this offer it is ${formatMoneyMinor(
          totals.proposed12.totalMinor,
          intent.currency,
        )} — a change of ${formatMoneyMinor(delta, intent.currency)}.`,
        direction: delta > 0 ? "loss" : delta < 0 ? "gain" : "neutral",
        evidenceIds: [],
        calculation: {
          currentTco12Minor: totals.current12.totalMinor,
          proposedTco12Minor: totals.proposed12.totalMinor,
          delta12Minor: delta,
          horizonMonths: 12,
        },
        status: "confirmed",
      }),
    );
  }

  if (totals.delta24Minor !== null) {
    const delta = totals.delta24Minor;
    consequences.push(
      consequence(id, {
        category: "financial",
        severity: delta > 0 ? "critical" : delta < 0 ? "medium" : "low",
        title:
          delta > 0
            ? "Household cost increases over 24 months"
            : delta < 0
              ? "Household cost decreases over 24 months"
              : "Household cost is unchanged over 24 months",
        description: `Current 24-month household cost is ${formatMoneyMinor(
          totals.current24.totalMinor,
          intent.currency,
        )}. Under this offer it is ${formatMoneyMinor(
          totals.proposed24.totalMinor,
          intent.currency,
        )} — a change of ${formatMoneyMinor(delta, intent.currency)}.`,
        direction: delta > 0 ? "loss" : delta < 0 ? "gain" : "neutral",
        evidenceIds: [],
        calculation: {
          currentTco24Minor: totals.current24.totalMinor,
          proposedTco24Minor: totals.proposed24.totalMinor,
          delta24Minor: delta,
          horizonMonths: 24,
        },
        status: "confirmed",
      }),
    );
  }

  if (
    intent.minimumMonthlySavingMinor !== null &&
    totals.savings12Minor !== null
  ) {
    const monthly = Math.trunc(totals.savings12Minor / 12);
    consequences.push(
      consequence(id, {
        category: "financial",
        severity:
          totals.savings12Minor < intent.minimumMonthlySavingMinor * 12
            ? "high"
            : "low",
        title:
          totals.savings12Minor < intent.minimumMonthlySavingMinor * 12
            ? "Saving target is not met"
            : "Saving target is met",
        description: `Average 12-month saving is ${formatMoneyMinor(
          monthly,
          intent.currency,
        )} per month against a target of ${formatMoneyMinor(
          intent.minimumMonthlySavingMinor,
          intent.currency,
        )}.`,
        direction:
          totals.savings12Minor < intent.minimumMonthlySavingMinor * 12
            ? "loss"
            : "gain",
        evidenceIds: [],
        calculation: {
          savings12Minor: totals.savings12Minor,
          averageMonthlySaving12Minor: monthly,
          targetMonthlyMinor: intent.minimumMonthlySavingMinor,
        },
        status: "confirmed",
      }),
    );
  }

  // Contract consequences.
  if (terms.minimumTermMonths === null) {
    consequences.push(
      consequence(id, {
        category: "contractual",
        severity: "high",
        title: "Contract term is unknown",
        description:
          "The source document does not state a minimum term. The household cannot know how long it would be committed.",
        direction: "unknown",
        evidenceIds: offerEvidence(offer, ["minimumTermMonths"]),
        calculation: null,
        status: "needs_verification",
      }),
    );
  } else if (terms.minimumTermMonths > 0) {
    const exceeds =
      intent.maxContractMonths !== null &&
      terms.minimumTermMonths > intent.maxContractMonths;
    consequences.push(
      consequence(id, {
        category: "contractual",
        severity: exceeds ? "critical" : "medium",
        title: exceeds
          ? "Contract term exceeds the household limit"
          : "Fixed-term commitment",
        description: `Minimum term is ${terms.minimumTermMonths} months${
          intent.maxContractMonths !== null
            ? ` against a maximum of ${intent.maxContractMonths} months`
            : ""
        }.${
          terms.cancellationFeeMinor === null
            ? " The early termination charge is unknown."
            : terms.cancellationFeeMinor > 0
              ? ` Early termination charge: ${formatMoneyMinor(
                  terms.cancellationFeeMinor,
                  offer.currency,
                )}.`
              : " No early termination charge is stated."
        }`,
        direction: exceeds ? "loss" : "neutral",
        evidenceIds: offerEvidence(offer, [
          "minimumTermMonths",
          "cancellationFeeMinor",
        ]),
        calculation: {
          minimumTermMonths: terms.minimumTermMonths,
          maxContractMonths: intent.maxContractMonths,
          cancellationFeeMinor: terms.cancellationFeeMinor,
        },
        status: "confirmed",
      }),
    );
  }

  if (terms.renewalType === "automatic" && (terms.minimumTermMonths ?? 0) >= 24) {
    consequences.push(
      consequence(id, {
        category: "reversibility",
        severity: "critical",
        title: "Automatic long-term renewal",
        description: `The offer renews automatically for a further fixed term. Leaving may require another ${terms.minimumTermMonths}-month commitment.`,
        direction: "loss",
        evidenceIds: offerEvidence(offer, ["renewalType"]),
        calculation: { renewalType: terms.renewalType },
        status: "confirmed",
      }),
    );
  } else if (terms.renewalType === "unknown") {
    consequences.push(
      consequence(id, {
        category: "reversibility",
        severity: "medium",
        title: "Renewal behaviour is unknown",
        description:
          "The offer does not state what happens after the initial period. The household may roll onto a new term or price without noticing.",
        direction: "unknown",
        evidenceIds: offerEvidence(offer, ["renewalType"]),
        calculation: null,
        status: "needs_verification",
      }),
    );
  }

  // Household benefit consequences.
  for (const benefitKey of intent.mustKeepBenefits) {
    const benefit = benefits.find((item) => item.benefitKey === benefitKey);
    const label = benefit?.description ?? benefitKey;
    const excluded = terms.excludedBenefits.some((item) => item.key === benefitKey);
    const included = terms.includedBenefits.some((item) => item.key === benefitKey);
    const retention =
      excluded
        ? false
        : included
          ? true
          : benefitKey === "family_mobile_bundle_discount"
            ? terms.familyBundleDiscountRetained
            : null;

    consequences.push(
      consequence(id, {
        category: "household_benefit",
        severity: retention === false ? "critical" : retention === null ? "high" : "low",
        title:
          retention === false
            ? "Required household benefit is lost"
            : retention === null
              ? "Household benefit impact is unknown"
              : "Required household benefit is retained",
        description:
          retention === false
            ? `The offer does not preserve "${label}"${
                benefit?.valueMinor
                  ? `, worth ${formatMoneyMinor(
                      benefit.valueMinor,
                      benefit.currency,
                    )} per month to the household`
                  : ""
              }.`
            : retention === null
              ? `The document does not say whether "${label}" survives the change.`
              : `"${label}" is preserved by the offer.`,
        direction: retention === false ? "loss" : retention === null ? "unknown" : "gain",
        evidenceIds: offerEvidence(offer, [
          `excludedBenefit:${benefitKey}`,
          "familyBundleDiscountRetained",
        ]),
        calculation: benefit?.valueMinor
          ? { monthlyValueMinor: benefit.valueMinor }
          : null,
        status: retention === null ? "needs_verification" : "confirmed",
      }),
    );
  }

  // Service consequences.
  if (terms.dataAllowance) {
    consequences.push(
      consequence(id, {
        category: "service",
        severity: "low",
        title: "Data allowance stated",
        description: `The offer states: ${terms.dataAllowance}.`,
        direction: "neutral",
        evidenceIds: offerEvidence(offer, ["dataAllowance"]),
        calculation: null,
        status: "confirmed",
      }),
    );
  } else {
    consequences.push(
      consequence(id, {
        category: "service",
        severity: "high",
        title: "Data allowance is unknown",
        description:
          "The household requires at least its current data allowance, but this document does not state one.",
        direction: "unknown",
        evidenceIds: [],
        calculation: null,
        status: "needs_verification",
      }),
    );
  }

  if (terms.routerIncluded === false) {
    consequences.push(
      consequence(id, {
        category: "service",
        severity: "medium",
        title: "Router is not included",
        description:
          "The household would need to supply or rent equipment separately.",
        direction: "loss",
        evidenceIds: offerEvidence(offer, ["routerIncluded"]),
        calculation: terms.equipmentMonthlyFeeMinor
          ? { equipmentMonthlyFeeMinor: terms.equipmentMonthlyFeeMinor }
          : null,
        status: "confirmed",
      }),
    );
  }

  // Unknown facts.
  if (constraintResult.unknowns.length > 0) {
    consequences.push(
      consequence(id, {
        category: "reversibility",
        severity: "high",
        title: "Material facts remain unverified",
        description: constraintResult.unknowns.join(" "),
        direction: "unknown",
        evidenceIds: [],
        calculation: null,
        status: "needs_verification",
      }),
    );
  }

  const inputHash = hashPayload({
    intentId: intent.id,
    intentVersion: intent.version,
    policyId: policy.id,
    policyVersion: policy.version,
    offerId: offer.id,
    offerVersion: offer.offerVersion,
    offerTerms: offer.terms,
    commitmentVersions: commitments.map((commitment) => ({
      id: commitment.id,
      version: commitment.version,
    })),
    benefitVersions: benefits.map((benefit) => ({
      id: benefit.id,
      status: benefit.status,
      valueMinor: benefit.valueMinor,
    })),
    dependencyVersions: dependencies.map((dependency) => ({
      id: dependency.id,
      status: dependency.status,
    })),
    evidenceHashes: [...input.currentEvidence, ...offer.evidence]
      .map((item) => `${item.id}:${item.sourceVersionHash}`)
      .sort(),
  });

  const unknowns = unique([
    ...constraintResult.unknowns,
    ...current12.missingFields,
    ...proposed12.missingFields,
    ...current24.missingFields,
    ...proposed24.missingFields,
  ]);

  return {
    id,
    householdId: input.householdId,
    intentContractId: intent.id,
    intentVersion: intent.version,
    offerId: offer.id,
    offerVersion: offer.offerVersion,
    status: "completed",
    decision: constraintResult.decision,
    decisionReasons: constraintResult.reasons,
    consequences,
    totals,
    unknowns,
    evidenceValidation,
    evidenceIds: unique([
      ...input.currentEvidence.map((item) => item.id),
      ...offer.evidence.map((item) => item.id),
    ]),
    analysisVersion: "1.0.0",
    inputHash,
    servExplanation: null,
    servExplanationError: null,
    createdAt: new Date().toISOString(),
  };
}

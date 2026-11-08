import type {
  CommitmentBenefit,
  Decision,
  DecisionReason,
  EvidenceValidation,
  IntentContract,
  Offer,
  UserPolicy,
  ComparisonTotals,
  Severity,
} from "./types";
import { formatMoneyMinor } from "./money";

export interface ConstraintContext {
  intent: IntentContract;
  policy: UserPolicy;
  offer: Offer;
  totals: ComparisonTotals;
  evidenceValidation: EvidenceValidation;
  benefits: CommitmentBenefit[];
}

export interface ConstraintResult {
  decision: Decision;
  reasons: DecisionReason[];
  unknowns: string[];
  hardViolationCodes: string[];
}

function reason(
  code: string,
  title: string,
  detail: string,
  severity: Severity,
  evidenceIds: string[] = [],
  constraint?: string,
): DecisionReason {
  return { code, title, detail, severity, evidenceIds, constraint };
}

function evidenceIdFor(offer: Offer, field: string): string | null {
  return offer.evidence.find((item) => item.normalizedField === field)?.id ?? null;
}

function evidenceIdsFor(offer: Offer, fields: string[]): string[] {
  return fields
    .map((field) => evidenceIdFor(offer, field))
    .filter((id): id is string => Boolean(id));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Deterministic policy evaluation. The LLM never runs this logic and cannot
 * override a block.
 */
export function evaluateConstraints(context: ConstraintContext): ConstraintResult {
  const { intent, policy, offer, totals, evidenceValidation, benefits } = context;
  const terms = offer.terms;
  const reasons: DecisionReason[] = [];
  const unknowns: string[] = [];
  const hardViolationCodes: string[] = [];

  const block = (
    code: string,
    title: string,
    detail: string,
    evidenceIds: string[] = [],
    constraint?: string,
  ) => {
    hardViolationCodes.push(code);
    reasons.push(reason(code, title, detail, "critical", evidenceIds, constraint));
  };

  const review = (
    code: string,
    title: string,
    detail: string,
    evidenceIds: string[] = [],
    constraint?: string,
  ) => {
    reasons.push(reason(code, title, detail, "high", evidenceIds, constraint));
  };

  // 1. Authority and service scope.
  if (
    intent.serviceTypes.length > 0 &&
    offer.serviceType !== "bundle" &&
    !intent.serviceTypes.includes(offer.serviceType)
  ) {
    block(
      "SERVICE_OUT_OF_SCOPE",
      "Offer is outside the requested service scope",
      `The request covers ${intent.serviceTypes.join(", ")}, but this offer is ${offer.serviceType}.`,
    );
  }

  if (terms.currency && terms.currency !== intent.currency) {
    block(
      "CURRENCY_MISMATCH",
      "Offer currency differs from the household currency",
      `The household compares in ${intent.currency}; the offer is in ${terms.currency}. No exchange rate has been verified.`,
    );
  }

  // 2. Evidence integrity.
  if (evidenceValidation.contradictedEvidenceIds.length > 0) {
    block(
      "EVIDENCE_CONTRADICTED",
      "Evidence sources disagree",
      `${evidenceValidation.contradictedEvidenceIds.length} evidence item(s) contradict another source. The system cannot establish the terms safely.`,
      evidenceValidation.contradictedEvidenceIds,
    );
  } else if (evidenceValidation.invalidEvidenceIds.length > 0) {
    review(
      "EVIDENCE_INVALID",
      "Some quoted evidence could not be validated",
      `${evidenceValidation.invalidEvidenceIds.length} of ${evidenceValidation.total} evidence item(s) failed quote validation.`,
      evidenceValidation.invalidEvidenceIds,
    );
  }

  // 3. Contract duration.
  if (terms.minimumTermMonths === null) {
    unknowns.push("Minimum contract term is unknown");
    unknowns.push("Whether the offer locks the household into a fixed term is unknown");
  } else {
    if (intent.maxContractMonths !== null && terms.minimumTermMonths > intent.maxContractMonths) {
      block(
        "MAX_CONTRACT_MONTHS",
        "Contract term exceeds the household limit",
        `The offer requires ${terms.minimumTermMonths} months, but the confirmed limit is ${intent.maxContractMonths} months.`,
        evidenceIdsFor(offer, ["minimumTermMonths"]),
        "maxContractMonths",
      );
    }

    if (
      intent.mustNotHave.includes("automatic_24_month_renewal") &&
      terms.minimumTermMonths >= 24 &&
      terms.renewalType === "automatic"
    ) {
      block(
        "AUTOMATIC_LONG_RENEWAL",
        "Automatic long-term renewal is excluded",
        `The offer renews automatically and commits the household for at least ${terms.minimumTermMonths} months.`,
        evidenceIdsFor(offer, ["minimumTermMonths", "renewalType"]),
        "mustNotHave:automatic_24_month_renewal",
      );
    }
  }

  if (!terms.renewalType || terms.renewalType === "unknown") {
    unknowns.push("Renewal behaviour after the initial term is unknown");
  }

  // 4. Required benefits.
  for (const benefitKey of intent.mustKeepBenefits) {
    const benefit = benefits.find((item) => item.benefitKey === benefitKey);
    const label = benefit?.description ?? benefitKey;

    if (terms.excludedBenefits.some((item) => item.key === benefitKey)) {
      block(
        "BENEFIT_NOT_RETAINED",
        "A required household benefit is not retained",
        `The offer explicitly drops "${label}".`,
        evidenceIdsFor(offer, [`excludedBenefit:${benefitKey}`]),
        `mustKeepBenefits:${benefitKey}`,
      );
      continue;
    }

    const explicitlyIncluded = terms.includedBenefits.some(
      (item) => item.key === benefitKey,
    );

    let retention: boolean | null = explicitlyIncluded ? true : null;
    if (
      retention === null &&
      benefitKey === "family_mobile_bundle_discount" &&
      terms.familyBundleDiscountRetained !== null
    ) {
      retention = terms.familyBundleDiscountRetained;
    }

    if (retention === false) {
      block(
        "BENEFIT_NOT_RETAINED",
        "A required household benefit is not retained",
        `The offer does not preserve "${label}".`,
        evidenceIdsFor(offer, ["familyBundleDiscountRetained"]),
        `mustKeepBenefits:${benefitKey}`,
      );
    } else if (retention === null) {
      unknowns.push(`Whether the required benefit "${label}" is retained is unknown`);
    }
  }

  // 5. Required capabilities.
  for (const requirement of intent.mustHave) {
    if (requirement === "minimum_data_allowance") {
      if (!terms.dataAllowance) {
        unknowns.push("The offer's data allowance is unknown");
      } else if (/unlimited|gb|mbps/i.test(terms.dataAllowance) === false) {
        review(
          "DATA_ALLOWANCE_UNCLEAR",
          "Data allowance wording is unclear",
          `The document states "${terms.dataAllowance}", which could not be verified against the household minimum.`,
          evidenceIdsFor(offer, ["dataAllowance"]),
          "mustHave:minimum_data_allowance",
        );
      }
    }
    if (requirement === "broadband" && offer.serviceType !== "broadband" && offer.serviceType !== "bundle") {
      block(
        "MUST_HAVE_MISSING",
        "The offer does not provide a required service",
        `The household requires broadband; this offer is ${offer.serviceType}.`,
      );
    }
  }

  // 6. Fees and unknowns that prevent a safe total.
  if (terms.installationFeeMinor === null) {
    unknowns.push("Installation fee is unknown");
  }
  if (terms.activationFeeMinor === null) {
    unknowns.push("Activation fee is unknown");
  }
  if (terms.equipmentMonthlyFeeMinor === null) {
    unknowns.push("Equipment rental fee is unknown");
  }
  if (terms.promotionalMonthlyPriceMinor === null) {
    unknowns.push("Promotional monthly price is unknown");
  }
  if (terms.promotionalMonths === null) {
    unknowns.push("Promotional period length is unknown");
  }
  if (totals.proposed12.complete === false && terms.standardMonthlyPriceMinor === null) {
    unknowns.push("Standard price after the promotion is unknown");
  }
  if (terms.cancellationFeeMinor === null && (terms.minimumTermMonths ?? 0) > 0) {
    unknowns.push("Early termination charge is unknown");
  }

  for (const materialUnknown of terms.materialUnknowns) {
    unknowns.push(materialUnknown);
  }

  // 7. The saving target is a hard constraint when the household sets one.
  if (intent.minimumMonthlySavingMinor !== null) {
    if (totals.savings12Minor === null) {
      unknowns.push("Monthly saving cannot be calculated while critical terms are unknown");
    } else {
      const requiredSavingMinor = intent.minimumMonthlySavingMinor * 12;
      if (totals.savings12Minor < requiredSavingMinor) {
        block(
          "MINIMUM_SAVING_NOT_MET",
          "The minimum monthly saving is not met",
          `The household asked to save at least ${formatMoneyMinor(
            intent.minimumMonthlySavingMinor,
            intent.currency,
          )} per month. This offer saves ${formatMoneyMinor(
            Math.trunc(totals.savings12Minor / 12),
            intent.currency,
          )} per month over 12 months.`,
          evidenceIdsFor(offer, [
            "promotionalMonthlyPriceMinor",
            "standardMonthlyPriceMinor",
          ]),
          "minimumMonthlySavingMinor",
        );
      }
    }
  }

  // 8. Higher cost is surfaced even when no saving target was set.
  if (
    intent.minimumMonthlySavingMinor === null &&
    totals.delta12Minor !== null &&
    totals.delta12Minor > 0
  ) {
    review(
      "HIGHER_TOTAL_COST",
      "The proposed arrangement costs more over 12 months",
      `Household cost increases by ${formatMoneyMinor(
        totals.delta12Minor,
        intent.currency,
      )} over 12 months.`,
    );
  }

  // 9. Plan-level reversibility.
  if (terms.minimumTermMonths !== null && terms.minimumTermMonths > 0) {
    reasons.push(
      reason(
        "FIXED_TERM_COMMITMENT",
        "The offer creates a fixed-term commitment",
        `The household would be committed for ${terms.minimumTermMonths} months${
          terms.cancellationFeeMinor === null
            ? ", with an unknown early termination charge."
            : terms.cancellationFeeMinor > 0
              ? `, with an early termination charge of ${formatMoneyMinor(
                  terms.cancellationFeeMinor,
                  offer.currency,
                )}.`
              : " with no early termination charge stated."
        }`,
        "medium",
        evidenceIdsFor(offer, ["minimumTermMonths", "cancellationFeeMinor"]),
      ),
    );
  }

  const uniqueUnknowns = unique(unknowns);
  if (uniqueUnknowns.length > 0) {
    if (policy.unknownCriticalTermsPolicy === "block") {
      hardViolationCodes.push("UNKNOWN_CRITICAL_TERMS");
      reasons.push(
        reason(
          "UNKNOWN_CRITICAL_TERMS",
          "Critical terms are unknown",
          uniqueUnknowns.slice(0, 6).join(". "),
          "critical",
        ),
      );
    } else {
      reasons.push(
        reason(
          "UNKNOWN_CRITICAL_TERMS",
          "Critical terms need verification",
          uniqueUnknowns.slice(0, 6).join(". "),
          "high",
        ),
      );
    }
  }

  const decision: Decision = hardViolationCodes.length
    ? "block"
    : reasons.some((item) => item.severity === "critical" || item.severity === "high")
      ? "review"
      : "allow";

  return {
    decision,
    reasons,
    unknowns: uniqueUnknowns,
    hardViolationCodes: unique(hardViolationCodes),
  };
}

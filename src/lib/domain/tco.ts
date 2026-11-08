import type {
  Commitment,
  CommitmentBenefit,
  CommitmentDependency,
  ComparisonTotals,
  Offer,
  OfferTerms,
  TcoLine,
  TcoResult,
} from "./types";
import { addMinor, multiplyMinor } from "./money";

export interface TcoInput {
  commitments: Commitment[];
  benefits: CommitmentBenefit[];
  dependencies: CommitmentDependency[];
  horizonMonths: 12 | 24;
}

function activeOnly<T extends { status: string }>(items: T[]): T[] {
  return items.filter((item) => item.status === "active");
}

function pushLine(lines: TcoLine[], label: string, monthlyMinor: number, months: number) {
  lines.push({
    label,
    monthlyMinor,
    months,
    subtotalMinor: multiplyMinor(monthlyMinor, months),
  });
}

/** Current household cost across all active commitments. */
export function calculateCurrentTco(input: TcoInput): TcoResult {
  const { horizonMonths } = input;
  const lines: TcoLine[] = [];
  const missingFields: string[] = [];

  for (const commitment of activeOnly(input.commitments)) {
    const label = `${commitment.providerName} — ${commitment.planName}`;
    if (commitment.billingPeriod === "monthly") {
      pushLine(lines, label, commitment.recurringChargeMinor, horizonMonths);
    } else if (commitment.billingPeriod === "annual") {
      const years = Math.floor(horizonMonths / 12);
      const remainder = horizonMonths % 12;
      if (years > 0) {
        pushLine(lines, `${label} (annual)`, commitment.recurringChargeMinor, years);
      }
      if (remainder > 0) {
        missingFields.push(`${label}: annual charge cannot be pro-rated safely`);
      }
    } else {
      lines.push({
        label,
        monthlyMinor: commitment.recurringChargeMinor,
        months: 1,
        subtotalMinor: commitment.recurringChargeMinor,
      });
    }
  }

  for (const benefit of activeOnly(input.benefits)) {
    if (benefit.valueMinor === null) {
      missingFields.push(`Benefit "${benefit.description}" has no verified value`);
      continue;
    }
    if (benefit.billingPeriod === "monthly") {
      pushLine(
        lines,
        `Benefit: ${benefit.description}`,
        -benefit.valueMinor,
        horizonMonths,
      );
    } else {
      lines.push({
        label: `Benefit: ${benefit.description}`,
        monthlyMinor: -benefit.valueMinor,
        months: 1,
        subtotalMinor: -benefit.valueMinor,
      });
    }
  }

  const complete = missingFields.length === 0;
  const totalMinor = complete
    ? addMinor(lines.map((line) => line.subtotalMinor))
    : null;

  return { horizonMonths, totalMinor, complete, missingFields, lines };
}

/**
 * Resolves whether a benefit survives the proposed change.
 * Priority: explicit excluded/included lists, then the offer's retention flag.
 */
export function benefitRetention(
  benefit: CommitmentBenefit,
  terms: OfferTerms,
): boolean | null {
  if (terms.excludedBenefits.some((item) => item.key === benefit.benefitKey)) {
    return false;
  }
  if (terms.includedBenefits.some((item) => item.key === benefit.benefitKey)) {
    return true;
  }
  if (
    benefit.benefitKey === "family_mobile_bundle_discount" &&
    terms.familyBundleDiscountRetained !== null
  ) {
    return terms.familyBundleDiscountRetained;
  }
  return null;
}

function replacedServiceTypes(offer: Offer): Set<string> {
  if (offer.serviceType === "bundle") return new Set(["broadband", "mobile", "bundle"]);
  return new Set([offer.serviceType]);
}

/**
 * Household cost under the proposed arrangement.
 *
 * Other commitments keep their gross price. Benefits are only subtracted when
 * they survive the change. A lost benefit therefore appears as a real cost
 * increase rather than a separate invented fee.
 */
export function calculateProposedTco(input: TcoInput, offer: Offer): TcoResult {
  const { horizonMonths } = input;
  const terms = offer.terms;
  const lines: TcoLine[] = [];
  const missingFields: string[] = [];
  const replaced = replacedServiceTypes(offer);
  const replacedCommitmentIds = new Set(
    activeOnly(input.commitments)
      .filter((commitment) => replaced.has(commitment.serviceType))
      .map((commitment) => commitment.id),
  );

  // Services that are not being replaced continue at their current price.
  for (const commitment of activeOnly(input.commitments)) {
    if (replacedCommitmentIds.has(commitment.id)) continue;
    const label = `${commitment.providerName} — ${commitment.planName}`;
    if (commitment.billingPeriod === "monthly") {
      pushLine(lines, label, commitment.recurringChargeMinor, horizonMonths);
    } else if (commitment.billingPeriod === "annual") {
      const years = Math.floor(horizonMonths / 12);
      if (years > 0) {
        pushLine(lines, `${label} (annual)`, commitment.recurringChargeMinor, years);
      }
      if (horizonMonths % 12 > 0) {
        missingFields.push(`${label}: annual charge cannot be pro-rated safely`);
      }
    } else {
      lines.push({
        label,
        monthlyMinor: commitment.recurringChargeMinor,
        months: 1,
        subtotalMinor: commitment.recurringChargeMinor,
      });
    }
  }

  // Benefits that survive the change.
  for (const benefit of activeOnly(input.benefits)) {
    const affectedDirectly = replacedCommitmentIds.has(benefit.commitmentId);
    const affectedByDependency = input.dependencies.some(
      (dependency) =>
        dependency.benefitId === benefit.id &&
        (replacedCommitmentIds.has(dependency.fromCommitmentId) ||
          replacedCommitmentIds.has(dependency.toCommitmentId ?? "")),
    );

    if (!affectedDirectly && !affectedByDependency) {
      if (benefit.status !== "active") continue;
      if (benefit.valueMinor === null) {
        missingFields.push(`Benefit "${benefit.description}" has no verified value`);
        continue;
      }
      pushLine(
        lines,
        `Benefit retained: ${benefit.description}`,
        -benefit.valueMinor,
        benefit.billingPeriod === "monthly" ? horizonMonths : 1,
      );
      continue;
    }

    const retention = benefitRetention(benefit, terms);
    if (retention === null) {
      missingFields.push(
        `Whether "${benefit.description}" is retained is unknown`,
      );
      continue;
    }
    if (retention === false) continue;

    if (benefit.valueMinor === null) {
      missingFields.push(`Benefit "${benefit.description}" has no verified value`);
      continue;
    }
    pushLine(
      lines,
      `Benefit retained: ${benefit.description}`,
      -benefit.valueMinor,
      benefit.billingPeriod === "monthly" ? horizonMonths : 1,
    );
  }

  // Proposed service price schedule.
  if (terms.currency && terms.currency !== offer.currency) {
    missingFields.push("Offer currency differs from the household currency");
  }

  const promoMonths =
    terms.promotionalMonths === null ? null : Math.min(terms.promotionalMonths, horizonMonths);

  if (terms.promotionalMonthlyPriceMinor === null) {
    missingFields.push("Promotional monthly price is unknown");
  } else if (promoMonths === null) {
    missingFields.push("Promotional period length is unknown");
  } else if (promoMonths > 0) {
    pushLine(
      lines,
      `${offer.providerName} promotional price`,
      terms.promotionalMonthlyPriceMinor,
      promoMonths,
    );
  }

  const remainingMonths = promoMonths === null ? null : horizonMonths - promoMonths;
  if (remainingMonths !== null && remainingMonths > 0) {
    if (terms.standardMonthlyPriceMinor === null) {
      missingFields.push("Standard monthly price after the promotion is unknown");
    } else {
      pushLine(
        lines,
        `${offer.providerName} standard price`,
        terms.standardMonthlyPriceMinor,
        remainingMonths,
      );
    }
  }

  if (terms.installationFeeMinor === null) {
    missingFields.push("Installation fee is unknown");
  } else if (terms.installationFeeMinor > 0) {
    lines.push({
      label: "Installation fee",
      monthlyMinor: terms.installationFeeMinor,
      months: 1,
      subtotalMinor: terms.installationFeeMinor,
    });
  }

  if (terms.activationFeeMinor === null) {
    missingFields.push("Activation fee is unknown");
  } else if (terms.activationFeeMinor > 0) {
    lines.push({
      label: "Activation fee",
      monthlyMinor: terms.activationFeeMinor,
      months: 1,
      subtotalMinor: terms.activationFeeMinor,
    });
  }

  if (terms.equipmentMonthlyFeeMinor === null) {
    missingFields.push("Equipment rental fee is unknown");
  } else if (terms.equipmentMonthlyFeeMinor > 0) {
    pushLine(
      lines,
      "Equipment rental",
      terms.equipmentMonthlyFeeMinor,
      horizonMonths,
    );
  }

  const complete = missingFields.length === 0;
  const totalMinor = complete
    ? addMinor(lines.map((line) => line.subtotalMinor))
    : null;

  return { horizonMonths, totalMinor, complete, missingFields, lines };
}

export function compareTotals(
  current12: TcoResult,
  proposed12: TcoResult,
  current24: TcoResult,
  proposed24: TcoResult,
): ComparisonTotals {
  const delta = (proposed: TcoResult, current: TcoResult): number | null =>
    proposed.totalMinor === null || current.totalMinor === null
      ? null
      : proposed.totalMinor - current.totalMinor;

  const delta12Minor = delta(proposed12, current12);
  const delta24Minor = delta(proposed24, current24);
  const savings12Minor =
    delta12Minor === null ? null : delta12Minor * -1;
  const savings24Minor =
    delta24Minor === null ? null : delta24Minor * -1;

  return {
    current12,
    proposed12,
    current24,
    proposed24,
    delta12Minor,
    delta24Minor,
    savings12Minor,
    savings24Minor,
    averageMonthlySaving12Minor:
      savings12Minor === null ? null : Math.trunc(savings12Minor / 12),
  };
}

export function averageMonthlyCost(tco: TcoResult): number | null {
  if (tco.totalMinor === null) return null;
  return Math.trunc(tco.totalMinor / tco.horizonMonths);
}

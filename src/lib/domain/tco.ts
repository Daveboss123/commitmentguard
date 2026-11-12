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
import { addMinor, formatMoneyMinor, multiplyMinor } from "./money";

export const TCO_CALCULATION_VERSION = "tco-1.1.0";

export interface TcoInput {
  commitments: Commitment[];
  benefits: CommitmentBenefit[];
  dependencies: CommitmentDependency[];
  horizonMonths: 12 | 24;
}

function activeOnly<T extends { status: string }>(items: T[]): T[] {
  return items.filter((item) => item.status === "active");
}

interface LineSpec {
  id: string;
  label: string;
  monthlyMinor: number;
  months: number;
  frequency: TcoLine["frequency"];
  quantity: number;
  currency: string;
  startMonth: number | null;
  endMonth: number | null;
  sourceEvidenceId: string | null;
  explanation: string;
}

function toLine(spec: LineSpec): TcoLine {
  const subtotalMinor = multiplyMinor(spec.monthlyMinor, spec.quantity);
  return {
    id: spec.id,
    label: spec.label,
    monthlyMinor: spec.monthlyMinor,
    months: spec.months,
    subtotalMinor,
    frequency: spec.frequency,
    quantity: spec.quantity,
    currency: spec.currency,
    startMonth: spec.startMonth,
    endMonth: spec.endMonth,
    sourceEvidenceId: spec.sourceEvidenceId,
    includedInTotal: true,
    direction:
      spec.monthlyMinor < 0
        ? "saving"
        : spec.monthlyMinor > 0
          ? "cost"
          : "neutral",
    calculationExplanation: spec.explanation,
  };
}

function monthlyExplanation(
  label: string,
  monthlyMinor: number,
  months: number,
  currency: string,
): string {
  return `${label}: ${formatMoneyMinor(monthlyMinor, currency)} × ${months} month${
    months === 1 ? "" : "s"
  } = ${formatMoneyMinor(multiplyMinor(monthlyMinor, months), currency)}`;
}

function recurringLine(input: {
  id: string;
  label: string;
  monthlyMinor: number;
  months: number;
  currency: string;
  sourceEvidenceId: string | null;
}): TcoLine {
  return toLine({
    ...input,
    frequency: "monthly",
    quantity: input.months,
    startMonth: 1,
    endMonth: input.months,
    explanation: monthlyExplanation(
      input.label,
      input.monthlyMinor,
      input.months,
      input.currency,
    ),
  });
}

function oneOffLine(input: {
  id: string;
  label: string;
  amountMinor: number;
  currency: string;
  sourceEvidenceId: string | null;
}): TcoLine {
  return toLine({
    id: input.id,
    label: input.label,
    monthlyMinor: input.amountMinor,
    months: 1,
    frequency: "one_off",
    quantity: 1,
    currency: input.currency,
    startMonth: 1,
    endMonth: 1,
    sourceEvidenceId: input.sourceEvidenceId,
    explanation: `${input.label}: ${formatMoneyMinor(
      input.amountMinor,
      input.currency,
    )} one-off = ${formatMoneyMinor(input.amountMinor, input.currency)}`,
  });
}

function commitmentEvidenceId(commitment: Commitment): string | null {
  return commitment.evidenceIds[0] ?? null;
}

/** Current household cost across all active commitments. */
export function calculateCurrentTco(input: TcoInput): TcoResult {
  const { horizonMonths } = input;
  const lines: TcoLine[] = [];
  const missingFields: string[] = [];

  for (const commitment of activeOnly(input.commitments)) {
    const label = `${commitment.providerName} — ${commitment.planName}`;
    if (commitment.billingPeriod === "monthly") {
      lines.push(
        recurringLine({
          id: `current:commitment:${commitment.id}`,
          label,
          monthlyMinor: commitment.recurringChargeMinor,
          months: horizonMonths,
          currency: commitment.currency,
          sourceEvidenceId: commitmentEvidenceId(commitment),
        }),
      );
    } else if (commitment.billingPeriod === "annual") {
      const years = Math.floor(horizonMonths / 12);
      const remainder = horizonMonths % 12;
      if (years > 0) {
        lines.push(
          recurringLine({
            id: `current:commitment:${commitment.id}:annual`,
            label: `${label} (annual billing)`,
            monthlyMinor: commitment.recurringChargeMinor,
            months: years,
            currency: commitment.currency,
            sourceEvidenceId: commitmentEvidenceId(commitment),
          }),
        );
      }
      if (remainder > 0) {
        missingFields.push(`${label}: annual charge cannot be pro-rated safely`);
      }
    } else {
      lines.push(
        oneOffLine({
          id: `current:commitment:${commitment.id}:one-off`,
          label,
          amountMinor: commitment.recurringChargeMinor,
          currency: commitment.currency,
          sourceEvidenceId: commitmentEvidenceId(commitment),
        }),
      );
    }
  }

  for (const benefit of activeOnly(input.benefits)) {
    if (benefit.valueMinor === null) {
      missingFields.push(`Benefit "${benefit.description}" has no verified value`);
      continue;
    }
    if (benefit.billingPeriod === "monthly") {
      lines.push(
        recurringLine({
          id: `current:benefit:${benefit.id}`,
          label: `Benefit: ${benefit.description}`,
          monthlyMinor: -benefit.valueMinor,
          months: horizonMonths,
          currency: benefit.currency,
          sourceEvidenceId: benefit.evidenceId,
        }),
      );
    } else {
      lines.push(
        oneOffLine({
          id: `current:benefit:${benefit.id}:one-off`,
          label: `Benefit: ${benefit.description}`,
          amountMinor: -benefit.valueMinor,
          currency: benefit.currency,
          sourceEvidenceId: benefit.evidenceId,
        }),
      );
    }
  }

  const complete = missingFields.length === 0;
  const totalMinor = complete
    ? addMinor(lines.map((line) => line.subtotalMinor))
    : null;

  return {
    horizonMonths,
    totalMinor,
    complete,
    missingFields,
    lines,
    calculationVersion: TCO_CALCULATION_VERSION,
  };
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

function offerEvidenceId(offer: Offer, field: string): string | null {
  return offer.evidence.find((item) => item.normalizedField === field)?.id ?? null;
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
  const currency = terms.currency ?? offer.currency;
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
    const label = `${commitment.providerName} — ${commitment.planName} (unchanged)`;
    if (commitment.billingPeriod === "monthly") {
      lines.push(
        recurringLine({
          id: `proposed:commitment:${commitment.id}`,
          label,
          monthlyMinor: commitment.recurringChargeMinor,
          months: horizonMonths,
          currency: commitment.currency,
          sourceEvidenceId: commitmentEvidenceId(commitment),
        }),
      );
    } else if (commitment.billingPeriod === "annual") {
      const years = Math.floor(horizonMonths / 12);
      if (years > 0) {
        lines.push(
          recurringLine({
            id: `proposed:commitment:${commitment.id}:annual`,
            label: `${label} (annual billing)`,
            monthlyMinor: commitment.recurringChargeMinor,
            months: years,
            currency: commitment.currency,
            sourceEvidenceId: commitmentEvidenceId(commitment),
          }),
        );
      }
      if (horizonMonths % 12 > 0) {
        missingFields.push(`${label}: annual charge cannot be pro-rated safely`);
      }
    } else {
      lines.push(
        oneOffLine({
          id: `proposed:commitment:${commitment.id}:one-off`,
          label,
          amountMinor: commitment.recurringChargeMinor,
          currency: commitment.currency,
          sourceEvidenceId: commitmentEvidenceId(commitment),
        }),
      );
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
      lines.push(
        recurringLine({
          id: `proposed:benefit:${benefit.id}:retained`,
          label: `Benefit retained: ${benefit.description}`,
          monthlyMinor: -benefit.valueMinor,
          months: benefit.billingPeriod === "monthly" ? horizonMonths : 1,
          currency: benefit.currency,
          sourceEvidenceId: benefit.evidenceId,
        }),
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
    lines.push(
      recurringLine({
        id: `proposed:benefit:${benefit.id}:retained`,
        label: `Benefit retained: ${benefit.description}`,
        monthlyMinor: -benefit.valueMinor,
        months: benefit.billingPeriod === "monthly" ? horizonMonths : 1,
        currency: benefit.currency,
        sourceEvidenceId: benefit.evidenceId,
      }),
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
    lines.push(
      recurringLine({
        id: "proposed:promotional-price",
        label: `${offer.providerName} promotional price`,
        monthlyMinor: terms.promotionalMonthlyPriceMinor,
        months: promoMonths,
        currency,
        sourceEvidenceId: offerEvidenceId(offer, "promotionalMonthlyPriceMinor"),
      }),
    );
  }

  const remainingMonths = promoMonths === null ? null : horizonMonths - promoMonths;
  if (remainingMonths !== null && remainingMonths > 0 && promoMonths !== null) {
    if (terms.standardMonthlyPriceMinor === null) {
      missingFields.push("Standard monthly price after the promotion is unknown");
    } else {
      const startMonth = promoMonths + 1;
      const endMonth = horizonMonths;
      const months = remainingMonths;
      lines.push(
        toLine({
          id: "proposed:standard-price",
          label: `${offer.providerName} standard price`,
          monthlyMinor: terms.standardMonthlyPriceMinor,
          months,
          frequency: "monthly",
          quantity: months,
          currency,
          startMonth,
          endMonth,
          sourceEvidenceId: offerEvidenceId(offer, "standardMonthlyPriceMinor"),
          explanation: `${formatMoneyMinor(
            terms.standardMonthlyPriceMinor,
            currency,
          )} × ${months} months (month ${startMonth}–${endMonth}) = ${formatMoneyMinor(
            multiplyMinor(terms.standardMonthlyPriceMinor, months),
            currency,
          )}`,
        }),
      );
    }
  }

  if (terms.installationFeeMinor === null) {
    missingFields.push("Installation fee is unknown");
  } else if (terms.installationFeeMinor > 0) {
    lines.push(
      oneOffLine({
        id: "proposed:installation-fee",
        label: "Installation fee",
        amountMinor: terms.installationFeeMinor,
        currency,
        sourceEvidenceId: offerEvidenceId(offer, "installationFeeMinor"),
      }),
    );
  }

  if (terms.activationFeeMinor === null) {
    missingFields.push("Activation fee is unknown");
  } else if (terms.activationFeeMinor > 0) {
    lines.push(
      oneOffLine({
        id: "proposed:activation-fee",
        label: "Activation fee",
        amountMinor: terms.activationFeeMinor,
        currency,
        sourceEvidenceId: offerEvidenceId(offer, "activationFeeMinor"),
      }),
    );
  }

  if (terms.equipmentMonthlyFeeMinor === null) {
    missingFields.push("Equipment rental fee is unknown");
  } else if (terms.equipmentMonthlyFeeMinor > 0) {
    lines.push(
      recurringLine({
        id: "proposed:equipment-rental",
        label: "Equipment rental",
        monthlyMinor: terms.equipmentMonthlyFeeMinor,
        months: horizonMonths,
        currency,
        sourceEvidenceId: offerEvidenceId(offer, "equipmentMonthlyFeeMinor"),
      }),
    );
  }

  const complete = missingFields.length === 0;
  const totalMinor = complete
    ? addMinor(lines.map((line) => line.subtotalMinor))
    : null;

  return {
    horizonMonths,
    totalMinor,
    complete,
    missingFields,
    lines,
    calculationVersion: TCO_CALCULATION_VERSION,
  };
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

/** Sums the included line items. Used by tests and the breakdown UI. */
export function sumIncludedLines(tco: TcoResult): number | null {
  const included = tco.lines.filter((line) => line.includedInTotal);
  if (!tco.complete) return null;
  return addMinor(included.map((line) => line.subtotalMinor));
}

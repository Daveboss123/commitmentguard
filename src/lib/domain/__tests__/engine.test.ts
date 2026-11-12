import { describe, expect, it } from "vitest";
import {
  DEMO_HOUSEHOLD_ID,
  DEMO_REQUEST,
  benefits,
  buildSeedDatabase,
  commitments,
  dependencies,
  documents,
  offers,
  policy,
} from "../../fixtures/demo";
import type { IntentContract } from "../types";
import { buildAnalysis } from "../decision";
import { compareTotals, calculateCurrentTco, calculateProposedTco } from "../tco";

const db = buildSeedDatabase();

const intent: IntentContract = {
  id: "int_test",
  householdId: DEMO_HOUSEHOLD_ID,
  policyId: policy.id,
  version: 1,
  originalRequest: DEMO_REQUEST,
  goal: "Find a cheaper broadband and mobile package while keeping family benefits.",
  serviceTypes: ["broadband", "mobile"],
  currency: "USD",
  minimumMonthlySavingMinor: 1000,
  maxContractMonths: 12,
  mustKeepBenefits: ["family_mobile_bundle_discount"],
  mustHave: ["broadband", "minimum_data_allowance"],
  mustNotHave: ["automatic_24_month_renewal"],
  softPreferences: ["lower_installation_fee", "router_included"],
  approvalRequiredFor: ["provider_switch", "new_contract", "payment"],
  unknownCriticalTermsPolicy: "review",
  ambiguities: [],
  extractionModel: "test",
  extractionSource: "demo_parser",
  servRequestId: null,
  servLatencyMs: null,
  userConfirmedAt: "2026-11-07T09:00:00.000Z",
  createdAt: "2026-11-07T09:00:00.000Z",
};

const baseInput = {
  householdId: DEMO_HOUSEHOLD_ID,
  intent,
  policy,
  commitments,
  benefits,
  dependencies,
  currentEvidence: db.evidence.filter((item) =>
    item.id.startsWith("ev_cur_"),
  ),
  documents,
};

function analyse(offerId: string) {
  const offer = offers.find((item) => item.id === offerId);
  if (!offer) throw new Error(`Unknown offer ${offerId}`);
  return buildAnalysis({ ...baseInput, offer });
}

describe("total cost of ownership", () => {
  it("calculates the current household cost from gross charges minus benefits", () => {
    const current12 = calculateCurrentTco({
      commitments,
      benefits,
      dependencies,
      horizonMonths: 12,
    });
    const current24 = calculateCurrentTco({
      commitments,
      benefits,
      dependencies,
      horizonMonths: 24,
    });

    expect(current12.complete).toBe(true);
    expect(current12.totalMinor).toBe(102_000);
    expect(current24.totalMinor).toBe(204_000);
  });

  it("prices a promotional schedule and one-off fees", () => {
    const offerA = offers.find((item) => item.id === "offer_brightwave_a")!;
    const proposed12 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 12 },
      offerA,
    );
    const proposed24 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 24 },
      offerA,
    );

    expect(proposed12.complete).toBe(true);
    expect(proposed12.totalMinor).toBe(136_000);
    expect(proposed24.totalMinor).toBe(280_000);
  });

  it("treats a lost bundle discount as a real household cost increase", () => {
    const offerA = offers.find((item) => item.id === "offer_brightwave_a")!;
    const offerB = offers.find((item) => item.id === "offer_harborlink_b")!;
    const a = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 12 },
      offerA,
    );
    const b = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 12 },
      offerB,
    );

    expect(a.lines.some((line) => line.label.includes("Benefit retained"))).toBe(false);
    expect(b.lines.some((line) => line.label.includes("Benefit retained"))).toBe(true);
    expect(b.totalMinor).toBe(90_000);
  });

  it("refuses to produce a total when a critical fee is unknown", () => {
    const offerC = offers.find((item) => item.id === "offer_metronest_c")!;
    const proposed12 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 12 },
      offerC,
    );
    const proposed24 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 24 },
      offerC,
    );

    expect(proposed12.totalMinor).toBeNull();
    expect(proposed24.totalMinor).toBeNull();
    expect(proposed12.missingFields.length).toBeGreaterThan(0);
  });

  it("computes comparable deltas without floating point", () => {
    const current12 = calculateCurrentTco({
      commitments,
      benefits,
      dependencies,
      horizonMonths: 12,
    });
    const current24 = calculateCurrentTco({
      commitments,
      benefits,
      dependencies,
      horizonMonths: 24,
    });
    const offerB = offers.find((item) => item.id === "offer_harborlink_b")!;
    const proposed12 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 12 },
      offerB,
    );
    const proposed24 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 24 },
      offerB,
    );
    const totals = compareTotals(current12, proposed12, current24, proposed24);

    expect(totals.delta12Minor).toBe(-12_000);
    expect(totals.delta24Minor).toBe(-24_000);
    expect(totals.averageMonthlySaving12Minor).toBe(1_000);
  });

  it("makes every displayed total reproducible from its line items", () => {
    const offerA = offers.find((item) => item.id === "offer_brightwave_a")!;
    const offerB = offers.find((item) => item.id === "offer_harborlink_b")!;
    const horizons = [12, 24] as const;

    for (const horizonMonths of horizons) {
      const current = calculateCurrentTco({
        commitments,
        benefits,
        dependencies,
        horizonMonths,
      });
      const proposedA = calculateProposedTco(
        { commitments, benefits, dependencies, horizonMonths },
        offerA,
      );
      const proposedB = calculateProposedTco(
        { commitments, benefits, dependencies, horizonMonths },
        offerB,
      );

      for (const tco of [current, proposedA, proposedB]) {
        expect(tco.complete).toBe(true);
        expect(tco.calculationVersion).toBe("tco-1.1.0");
        const summed = tco.lines
          .filter((line) => line.includedInTotal)
          .reduce((total, line) => total + line.subtotalMinor, 0);
        expect(summed).toBe(tco.totalMinor);
        for (const line of tco.lines) {
          expect(line.quantity).toBe(
            line.frequency === "one_off" ? 1 : line.months,
          );
          expect(line.subtotalMinor).toBe(line.monthlyMinor * line.quantity);
          expect(line.calculationExplanation.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("explains each Offer A component over 24 months", () => {
    const offerA = offers.find((item) => item.id === "offer_brightwave_a")!;
    const proposed24 = calculateProposedTco(
      { commitments, benefits, dependencies, horizonMonths: 24 },
      offerA,
    );
    const byId = Object.fromEntries(
      proposed24.lines.map((line) => [line.id, line]),
    );

    expect(byId["proposed:promotional-price"].subtotalMinor).toBe(18_000);
    expect(byId["proposed:standard-price"].subtotalMinor).toBe(99_000);
    expect(byId["proposed:standard-price"].startMonth).toBe(7);
    expect(byId["proposed:standard-price"].endMonth).toBe(24);
    expect(byId["proposed:installation-fee"].subtotalMinor).toBe(7_000);
    expect(byId["proposed:equipment-rental"].subtotalMinor).toBe(12_000);
    expect(
      byId["proposed:commitment:cm_mobile_northline"].subtotalMinor,
    ).toBe(144_000);
    expect(
      proposed24.lines.some(
        (line) => line.label === "Benefit retained: Family mobile bundle discount",
      ),
    ).toBe(false);
    expect(proposed24.totalMinor).toBe(280_000);
  });
});

describe("deterministic decision engine", () => {
  it("blocks the deceptively cheap 24-month offer", () => {
    const analysis = analyse("offer_brightwave_a");

    expect(analysis.decision).toBe("block");
    expect(analysis.decisionReasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "MAX_CONTRACT_MONTHS",
        "BENEFIT_NOT_RETAINED",
        "MINIMUM_SAVING_NOT_MET",
        "AUTOMATIC_LONG_RENEWAL",
      ]),
    );
    expect(analysis.totals.delta12Minor).toBe(34_000);
  });

  it("allows the compliant offer but still requires user approval", () => {
    const analysis = analyse("offer_harborlink_b");

    expect(analysis.decision).toBe("allow");
    expect(analysis.evidenceValidation.invalidEvidenceIds).toHaveLength(0);
    expect(analysis.totals.savings12Minor).toBe(12_000);
    expect(analysis.totals.averageMonthlySaving12Minor).toBe(1_000);
    expect(analysis.decisionReasons.map((reason) => reason.code)).not.toContain(
      "MINIMUM_SAVING_NOT_MET",
    );
  });

  it("holds the incomplete offer for review and never assumes missing terms", () => {
    const analysis = analyse("offer_metronest_c");

    expect(analysis.decision).toBe("review");
    expect(analysis.decisionReasons.map((reason) => reason.code)).toContain(
      "UNKNOWN_CRITICAL_TERMS",
    );
    expect(analysis.unknowns).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Minimum contract term is unknown"),
        expect.stringContaining("Installation fee is unknown"),
      ]),
    );
    expect(analysis.consequences.some((item) => item.status === "needs_verification")).toBe(true);
  });

  it("validates every fixture quote against its source document", () => {
    const analysis = analyse("offer_brightwave_a");
    expect(analysis.evidenceValidation.total).toBeGreaterThan(10);
    expect(analysis.evidenceValidation.invalidEvidenceIds).toEqual([]);
    expect(analysis.evidenceValidation.contradictedEvidenceIds).toEqual([]);
  });
});

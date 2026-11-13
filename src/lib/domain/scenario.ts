import type { Decision, Severity } from "./types";

/**
 * Types for the what-if scenario sandbox.
 *
 * A scenario is a hypothetical re-run of the real engine. It is never stored
 * and never becomes an approval basis.
 */
export interface ScenarioOverrides {
  maxContractMonths?: number | null;
  minimumMonthlySavingMinor?: number | null;
  maxOneTimeFeeMinor?: number | null;
  retainFamilyDiscount?: boolean | null;
  offerMonthlyPriceMinor?: number;
}

export interface ScenarioOutcome {
  decision: Decision;
  current12Minor: number | null;
  proposed12Minor: number | null;
  current24Minor: number | null;
  proposed24Minor: number | null;
  delta12Minor: number | null;
  delta24Minor: number | null;
  unknowns: string[];
  evidenceValid: number;
  evidenceTotal: number;
  reasonCodes: string[];
  blockers: Array<{ code: string; title: string; severity: Severity }>;
  costModel: string;
  inputHash: string;
}

export interface ScenarioEvaluation {
  label: string;
  disclaimer: string;
  base: ScenarioOutcome;
  scenario: ScenarioOutcome;
  appliedOverrides: Array<{
    field: string;
    label: string;
    before: string;
    after: string;
  }>;
  notPersisted: true;
  /**
   * True when the offer document explicitly excludes the family discount.
   * An explicit exclusion wins over a hypothetical retention flag.
   */
  retentionLockedByExclusion: boolean;
  approvalBinding: {
    approvalId: string;
    recordedHash: string;
    scenarioHash: string;
    wouldBeStale: boolean;
    changedOfferVersion: number;
  } | null;
}

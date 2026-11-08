import type { IntentContract } from "@/lib/domain/types";
import { DEMO_HOUSEHOLD_ID, DEMO_REQUEST } from "./demo";

const EXTRACTED_AT = "2026-11-07T09:00:00.000Z";

/**
 * Deterministic fixture intent for public, pre-sign-in pages. It mirrors what
 * SERV extracts from {@link DEMO_REQUEST}; it is not a live SERV response and is
 * always labelled as a fixture where it is shown.
 */
export const demoIntent: IntentContract = {
  id: "intent_demo_morgan_broadband",
  householdId: DEMO_HOUSEHOLD_ID,
  policyId: "pol_morgan_v1",
  version: 1,
  originalRequest: DEMO_REQUEST,
  goal: "Find a cheaper broadband and mobile package without losing family benefits or accepting a contract longer than 12 months.",
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
  extractionModel: "demo-fixture (not SERV)",
  extractionSource: "demo_parser",
  servRequestId: null,
  servLatencyMs: null,
  userConfirmedAt: EXTRACTED_AT,
  createdAt: EXTRACTED_AT,
};

import type {
  Commitment,
  CommitmentBenefit,
  CommitmentDependency,
  Database,
  DemoDocument,
  Evidence,
  ExtractedFact,
  Household,
  HouseholdMember,
  Offer,
  UserPolicy,
} from "../domain/types";
import { sourceVersionHash } from "../domain/evidence";

export const DEMO_HOUSEHOLD_ID = "hh_morgan_demo";
export const DEMO_USER_ID = "user_demo_owner";
export const DEMO_REQUEST =
  "Find a cheaper broadband and mobile package for my household. I want to save at least $10 per month. Do not remove our existing family benefits, and do not lock us into a contract longer than 12 months. Do not proceed if you cannot verify the important terms.";

const EXTRACTED_AT = "2026-11-07T09:00:00.000Z";

export const DOC_CURRENT = `NORTHLINE DEMO — HOUSEHOLD SERVICE SUMMARY
Illustrative terms only. Synthetic data for the CommitmentGuard demo. Not a real provider contract.

Broadband — Home 300
Monthly charge: $45.00 per month.
Contract term: month-to-month.
Early termination fee: $0.00.
Equipment: Wi-Fi router included at no extra monthly cost.
Data allowance: unlimited.
Renewal: monthly, with no fixed-term renewal.

Mobile — Family Bundle
Base monthly charge for four lines: $60.00 per month.
Bundle discount: $20.00 per month while the household keeps Northline broadband.
The bundle discount is applied to the household account.
Minimum term: month-to-month.`;

export const DOC_OFFER_A = `BRIGHTWAVE DEMO — INTRODUCTORY HOME 500
Illustrative terms only. Synthetic offer for the CommitmentGuard demo. Not a real provider contract.

Monthly price: $30.00 per month for the first 6 months.
Standard price: $55.00 per month after the promotional period.
Installation fee: $70.00 one-off.
Activation fee: $0.00.
Equipment: Wi-Fi router rental $5.00 per month.
Contract term: 24 months.
Early termination fee: $120.00.
Renewal: automatic fixed-term renewal for a further 24 months.
Data allowance: unlimited.
Family mobile bundle: This offer is broadband-only and does not preserve the Northline family mobile bundle discount.`;

export const DOC_OFFER_B = `HARBORLINK DEMO — FLEXIBLE HOME 300
Illustrative terms only. Synthetic offer for the CommitmentGuard demo. Not a real provider contract.

Monthly price: $35.00 per month.
Promotional period: none. The monthly price is the standard price.
Standard price: $35.00 per month.
Installation fee: $0.00.
Activation fee: $0.00.
Equipment: Wi-Fi router included at no extra monthly cost.
Contract term: 12 months.
Early termination fee: $0.00.
Renewal: monthly after the initial 12-month term, with no automatic fixed-term renewal.
Data allowance: unlimited.
Family mobile bundle: The existing Northline family mobile bundle discount is retained.`;

export const DOC_OFFER_C = `METRONEST DEMO — HOME PLUS
Illustrative terms only. Synthetic offer for the CommitmentGuard demo. Not a real provider contract.

Monthly price: $35.00 per month for the first 12 months.
Promotional period: 12 months.
Standard price after the promotional period: not stated in this document.
Installation fee: not stated in this document.
Activation fee: not stated in this document.
Equipment: Wi-Fi router included.
Contract term: not stated in this document.
Data allowance: unlimited.
Family mobile bundle: not addressed in this document.`;

function doc(
  id: string,
  label: string,
  kind: DemoDocument["kind"],
  text: string,
): DemoDocument {
  return {
    id,
    householdId: DEMO_HOUSEHOLD_ID,
    label,
    kind,
    text,
    sourceVersionHash: sourceVersionHash(text),
    createdAt: EXTRACTED_AT,
  };
}

export const documents: DemoDocument[] = [
  doc("doc_current_terms", "Northline Demo — current household summary", "current_terms", DOC_CURRENT),
  doc("doc_offer_a", "BrightWave Demo — Introductory Home 500", "offer_terms", DOC_OFFER_A),
  doc("doc_offer_b", "HarborLink Demo — Flexible Home 300", "offer_terms", DOC_OFFER_B),
  doc("doc_offer_c", "MetroNest Demo — Home Plus", "offer_terms", DOC_OFFER_C),
];

export const CURRENT_DOC_HASH = sourceVersionHash(DOC_CURRENT);
export const OFFER_A_DOC_HASH = sourceVersionHash(DOC_OFFER_A);
export const OFFER_B_DOC_HASH = sourceVersionHash(DOC_OFFER_B);
export const OFFER_C_DOC_HASH = sourceVersionHash(DOC_OFFER_C);

function ev(
  id: string,
  documentId: string,
  documentText: string,
  sourceLabel: string,
  section: string,
  quote: string,
  normalizedField: string,
  normalizedValue: Evidence["normalizedValue"],
  status: Evidence["status"] = "verified",
): Evidence {
  return {
    id,
    sourceType: "demo_fixture",
    sourceLabel,
    documentId,
    subjectId: SUBJECT_BY_DOCUMENT[documentId],
    page: 1,
    section,
    quote,
    normalizedField,
    normalizedValue,
    status,
    extractedAt: EXTRACTED_AT,
    sourceVersionHash: sourceVersionHash(documentText),
    freshnessExpiresAt: "2027-11-07T09:00:00.000Z",
  };
}

const NORTHLINE_LABEL = "Northline Demo household summary (illustrative)";
const BRIGHTWAVE_LABEL = "BrightWave Demo offer document (illustrative)";
const HARBORLINK_LABEL = "HarborLink Demo offer document (illustrative)";
const METRONEST_LABEL = "MetroNest Demo offer document (illustrative)";

const SUBJECT_BY_DOCUMENT: Record<string, string> = {
  doc_current_terms: "household_current",
  doc_offer_a: "offer_brightwave_a",
  doc_offer_b: "offer_harborlink_b",
  doc_offer_c: "offer_metronest_c",
};

export const currentEvidence: Evidence[] = [
  ev(
    "ev_cur_broadband_price",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Broadband — Home 300",
    "Monthly charge: $45.00 per month.",
    "recurringChargeMinor",
    4500,
  ),
  ev(
    "ev_cur_broadband_term",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Broadband — Home 300",
    "Contract term: month-to-month.",
    "minimumTermMonths",
    0,
  ),
  ev(
    "ev_cur_broadband_etf",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Broadband — Home 300",
    "Early termination fee: $0.00.",
    "cancellationFeeMinor",
    0,
  ),
  ev(
    "ev_cur_broadband_router",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Broadband — Home 300",
    "Equipment: Wi-Fi router included at no extra monthly cost.",
    "routerIncluded",
    true,
  ),
  ev(
    "ev_cur_broadband_data",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Broadband — Home 300",
    "Data allowance: unlimited.",
    "dataAllowance",
    "unlimited",
  ),
  ev(
    "ev_cur_mobile_base",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Mobile — Family Bundle",
    "Base monthly charge for four lines: $60.00 per month.",
    "mobileRecurringChargeMinor",
    6000,
  ),
  ev(
    "ev_cur_mobile_discount",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Mobile — Family Bundle",
    "Bundle discount: $20.00 per month while the household keeps Northline broadband.",
    "family_mobile_bundle_discount",
    2000,
  ),
  ev(
    "ev_cur_mobile_term",
    "doc_current_terms",
    DOC_CURRENT,
    NORTHLINE_LABEL,
    "Mobile — Family Bundle",
    "Minimum term: month-to-month.",
    "mobileMinimumTermMonths",
    0,
  ),
];

export const offerEvidence: Record<"a" | "b" | "c", Evidence[]> = {
  a: [
    ev(
      "ev_a_promo_price",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Pricing",
      "Monthly price: $30.00 per month for the first 6 months.",
      "promotionalMonthlyPriceMinor",
      3000,
    ),
    ev(
      "ev_a_promo_months",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Pricing",
      "Monthly price: $30.00 per month for the first 6 months.",
      "promotionalMonths",
      6,
    ),
    ev(
      "ev_a_standard_price",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Pricing",
      "Standard price: $55.00 per month after the promotional period.",
      "standardMonthlyPriceMinor",
      5500,
    ),
    ev(
      "ev_a_installation",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Fees",
      "Installation fee: $70.00 one-off.",
      "installationFeeMinor",
      7000,
    ),
    ev(
      "ev_a_activation",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Fees",
      "Activation fee: $0.00.",
      "activationFeeMinor",
      0,
    ),
    ev(
      "ev_a_equipment",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Equipment",
      "Equipment: Wi-Fi router rental $5.00 per month.",
      "equipmentMonthlyFeeMinor",
      500,
    ),
    ev(
      "ev_a_term",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Contract",
      "Contract term: 24 months.",
      "minimumTermMonths",
      24,
    ),
    ev(
      "ev_a_etf",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Contract",
      "Early termination fee: $120.00.",
      "cancellationFeeMinor",
      12000,
    ),
    ev(
      "ev_a_renewal",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Contract",
      "Renewal: automatic fixed-term renewal for a further 24 months.",
      "renewalType",
      "automatic",
    ),
    ev(
      "ev_a_data",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Service",
      "Data allowance: unlimited.",
      "dataAllowance",
      "unlimited",
    ),
    ev(
      "ev_a_family",
      "doc_offer_a",
      DOC_OFFER_A,
      BRIGHTWAVE_LABEL,
      "Household benefits",
      "Family mobile bundle: This offer is broadband-only and does not preserve the Northline family mobile bundle discount.",
      "excludedBenefit:family_mobile_bundle_discount",
      false,
    ),
  ],
  b: [
    ev(
      "ev_b_monthly",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Pricing",
      "Monthly price: $35.00 per month.",
      "promotionalMonthlyPriceMinor",
      3500,
    ),
    ev(
      "ev_b_promo_period",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Pricing",
      "Promotional period: none. The monthly price is the standard price.",
      "promotionalMonths",
      0,
    ),
    ev(
      "ev_b_standard",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Pricing",
      "Standard price: $35.00 per month.",
      "standardMonthlyPriceMinor",
      3500,
    ),
    ev(
      "ev_b_installation",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Fees",
      "Installation fee: $0.00.",
      "installationFeeMinor",
      0,
    ),
    ev(
      "ev_b_activation",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Fees",
      "Activation fee: $0.00.",
      "activationFeeMinor",
      0,
    ),
    ev(
      "ev_b_equipment",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Equipment",
      "Equipment: Wi-Fi router included at no extra monthly cost.",
      "equipmentMonthlyFeeMinor",
      0,
    ),
    ev(
      "ev_b_term",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Contract",
      "Contract term: 12 months.",
      "minimumTermMonths",
      12,
    ),
    ev(
      "ev_b_etf",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Contract",
      "Early termination fee: $0.00.",
      "cancellationFeeMinor",
      0,
    ),
    ev(
      "ev_b_renewal",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Contract",
      "Renewal: monthly after the initial 12-month term, with no automatic fixed-term renewal.",
      "renewalType",
      "monthly",
    ),
    ev(
      "ev_b_data",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Service",
      "Data allowance: unlimited.",
      "dataAllowance",
      "unlimited",
    ),
    ev(
      "ev_b_family",
      "doc_offer_b",
      DOC_OFFER_B,
      HARBORLINK_LABEL,
      "Household benefits",
      "Family mobile bundle: The existing Northline family mobile bundle discount is retained.",
      "includedBenefit:family_mobile_bundle_discount",
      true,
    ),
  ],
  c: [
    ev(
      "ev_c_promo_price",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Pricing",
      "Monthly price: $35.00 per month for the first 12 months.",
      "promotionalMonthlyPriceMinor",
      3500,
    ),
    ev(
      "ev_c_promo_months",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Pricing",
      "Promotional period: 12 months.",
      "promotionalMonths",
      12,
    ),
    ev(
      "ev_c_standard",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Pricing",
      "Standard price after the promotional period: not stated in this document.",
      "standardMonthlyPriceMinor",
      null,
      "unknown",
    ),
    ev(
      "ev_c_installation",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Fees",
      "Installation fee: not stated in this document.",
      "installationFeeMinor",
      null,
      "unknown",
    ),
    ev(
      "ev_c_activation",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Fees",
      "Activation fee: not stated in this document.",
      "activationFeeMinor",
      null,
      "unknown",
    ),
    ev(
      "ev_c_equipment",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Equipment",
      "Equipment: Wi-Fi router included.",
      "equipmentMonthlyFeeMinor",
      0,
    ),
    ev(
      "ev_c_term",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Contract",
      "Contract term: not stated in this document.",
      "minimumTermMonths",
      null,
      "unknown",
    ),
    ev(
      "ev_c_data",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Service",
      "Data allowance: unlimited.",
      "dataAllowance",
      "unlimited",
    ),
    ev(
      "ev_c_family",
      "doc_offer_c",
      DOC_OFFER_C,
      METRONEST_LABEL,
      "Household benefits",
      "Family mobile bundle: not addressed in this document.",
      "familyBundleDiscountRetained",
      null,
      "unknown",
    ),
  ],
};

function fact(
  field: string,
  label: string,
  value: ExtractedFact["value"],
  evidenceId: string | null,
  status: ExtractedFact["status"] = "verified",
): ExtractedFact {
  return { field, label, value, evidenceId, status };
}

export const household: Household = {
  id: DEMO_HOUSEHOLD_ID,
  ownerUserId: DEMO_USER_ID,
  name: "The Morgan Household",
  defaultCurrency: "USD",
  locale: "en-US",
  createdAt: EXTRACTED_AT,
  updatedAt: EXTRACTED_AT,
};

export const members: HouseholdMember[] = [
  {
    id: "hm_owner",
    householdId: DEMO_HOUSEHOLD_ID,
    userId: DEMO_USER_ID,
    displayName: "Alex Morgan",
    role: "owner",
    status: "active",
    createdAt: EXTRACTED_AT,
  },
];

export const commitments: Commitment[] = [
  {
    id: "cm_broadband_northline",
    householdId: DEMO_HOUSEHOLD_ID,
    providerName: "Northline Demo",
    serviceType: "broadband",
    planName: "Home 300",
    currency: "USD",
    recurringChargeMinor: 4500,
    billingPeriod: "monthly",
    contractStart: "2025-03-01",
    contractEnd: null,
    minimumTermMonths: 0,
    renewalType: "monthly",
    promoEndDate: null,
    standardChargeMinor: 4500,
    cancellationFeeMinor: 0,
    equipmentMonthlyFeeMinor: 0,
    dataAllowance: "unlimited",
    routerIncluded: true,
    status: "active",
    evidenceIds: [
      "ev_cur_broadband_price",
      "ev_cur_broadband_term",
      "ev_cur_broadband_etf",
      "ev_cur_broadband_router",
      "ev_cur_broadband_data",
    ],
    version: 1,
    createdAt: EXTRACTED_AT,
    updatedAt: EXTRACTED_AT,
  },
  {
    id: "cm_mobile_northline",
    householdId: DEMO_HOUSEHOLD_ID,
    providerName: "Northline Demo",
    serviceType: "mobile",
    planName: "Family Bundle (4 lines)",
    currency: "USD",
    recurringChargeMinor: 6000,
    billingPeriod: "monthly",
    contractStart: "2025-03-01",
    contractEnd: null,
    minimumTermMonths: 0,
    renewalType: "monthly",
    promoEndDate: null,
    standardChargeMinor: 6000,
    cancellationFeeMinor: 0,
    equipmentMonthlyFeeMinor: 0,
    dataAllowance: null,
    routerIncluded: null,
    status: "active",
    evidenceIds: ["ev_cur_mobile_base", "ev_cur_mobile_term"],
    version: 1,
    createdAt: EXTRACTED_AT,
    updatedAt: EXTRACTED_AT,
  },
];

export const benefits: CommitmentBenefit[] = [
  {
    id: "bn_family_mobile_discount",
    commitmentId: "cm_mobile_northline",
    householdId: DEMO_HOUSEHOLD_ID,
    benefitKey: "family_mobile_bundle_discount",
    description: "Family mobile bundle discount",
    valueMinor: 2000,
    currency: "USD",
    billingPeriod: "monthly",
    beneficiaryScope: "household",
    status: "active",
    evidenceId: "ev_cur_mobile_discount",
    createdAt: EXTRACTED_AT,
  },
];

export const dependencies: CommitmentDependency[] = [
  {
    id: "dep_broadband_mobile_discount",
    householdId: DEMO_HOUSEHOLD_ID,
    fromCommitmentId: "cm_broadband_northline",
    toCommitmentId: "cm_mobile_northline",
    benefitId: "bn_family_mobile_discount",
    dependencyType: "bundle_discount",
    impactDescription:
      "The $20/month family mobile discount requires the household to keep Northline broadband.",
    monthlyImpactMinor: 2000,
    evidenceId: "ev_cur_mobile_discount",
    status: "active",
  },
];

export const policy: UserPolicy = {
  id: "pol_morgan_v1",
  householdId: DEMO_HOUSEHOLD_ID,
  version: 1,
  currency: "USD",
  minimumMonthlySavingMinor: 1000,
  maxContractMonths: 12,
  mustKeepBenefits: ["family_mobile_bundle_discount"],
  mustHave: ["broadband", "minimum_data_allowance"],
  mustNotHave: ["automatic_24_month_renewal"],
  softPreferences: ["lower_installation_fee", "router_included"],
  unknownCriticalTermsPolicy: "review",
  approvalRequiredFor: ["provider_switch", "new_contract", "payment"],
  createdAt: EXTRACTED_AT,
};

export const offers: Offer[] = [
  {
    id: "offer_brightwave_a",
    householdId: DEMO_HOUSEHOLD_ID,
    providerName: "BrightWave Demo",
    planName: "Introductory Home 500",
    serviceType: "broadband",
    currency: "USD",
    sourceType: "demo_fixture",
    sourceLabel: BRIGHTWAVE_LABEL,
    offerVersion: 1,
    rawDocumentId: "doc_offer_a",
    documentText: DOC_OFFER_A,
    terms: {
      providerName: "BrightWave Demo",
      planName: "Introductory Home 500",
      serviceType: "broadband",
      currency: "USD",
      promotionalMonthlyPriceMinor: 3000,
      promotionalMonths: 6,
      standardMonthlyPriceMinor: 5500,
      installationFeeMinor: 7000,
      activationFeeMinor: 0,
      equipmentMonthlyFeeMinor: 500,
      minimumTermMonths: 24,
      renewalType: "automatic",
      cancellationFeeMinor: 12000,
      includedBenefits: [],
      excludedBenefits: [
        {
          key: "family_mobile_bundle_discount",
          description: "Northline family mobile bundle discount",
          valueMinor: 2000,
          evidenceId: "ev_a_family",
        },
      ],
      dataAllowance: "unlimited",
      routerIncluded: false,
      familyBundleDiscountRetained: false,
      materialUnknowns: [],
    },
    facts: [
      fact("promotionalMonthlyPriceMinor", "Promotional monthly price", 3000, "ev_a_promo_price"),
      fact("promotionalMonths", "Promotional period", 6, "ev_a_promo_months"),
      fact("standardMonthlyPriceMinor", "Standard monthly price", 5500, "ev_a_standard_price"),
      fact("installationFeeMinor", "Installation fee", 7000, "ev_a_installation"),
      fact("activationFeeMinor", "Activation fee", 0, "ev_a_activation"),
      fact("equipmentMonthlyFeeMinor", "Router rental", 500, "ev_a_equipment"),
      fact("minimumTermMonths", "Contract term", 24, "ev_a_term"),
      fact("cancellationFeeMinor", "Early termination fee", 12000, "ev_a_etf"),
      fact("renewalType", "Renewal", "automatic fixed term", "ev_a_renewal"),
      fact("dataAllowance", "Data allowance", "unlimited", "ev_a_data"),
      fact(
        "familyBundleDiscountRetained",
        "Family mobile discount",
        false,
        "ev_a_family",
      ),
    ],
    evidence: offerEvidence.a,
    extractionSource: "demo_fixture",
    status: "ready",
    createdAt: EXTRACTED_AT,
    updatedAt: EXTRACTED_AT,
  },
  {
    id: "offer_harborlink_b",
    householdId: DEMO_HOUSEHOLD_ID,
    providerName: "HarborLink Demo",
    planName: "Flexible Home 300",
    serviceType: "broadband",
    currency: "USD",
    sourceType: "demo_fixture",
    sourceLabel: HARBORLINK_LABEL,
    offerVersion: 1,
    rawDocumentId: "doc_offer_b",
    documentText: DOC_OFFER_B,
    terms: {
      providerName: "HarborLink Demo",
      planName: "Flexible Home 300",
      serviceType: "broadband",
      currency: "USD",
      promotionalMonthlyPriceMinor: 3500,
      promotionalMonths: 0,
      standardMonthlyPriceMinor: 3500,
      installationFeeMinor: 0,
      activationFeeMinor: 0,
      equipmentMonthlyFeeMinor: 0,
      minimumTermMonths: 12,
      renewalType: "monthly",
      cancellationFeeMinor: 0,
      includedBenefits: [
        {
          key: "family_mobile_bundle_discount",
          description: "Northline family mobile bundle discount",
          valueMinor: 2000,
          evidenceId: "ev_b_family",
        },
      ],
      excludedBenefits: [],
      dataAllowance: "unlimited",
      routerIncluded: true,
      familyBundleDiscountRetained: true,
      materialUnknowns: [],
    },
    facts: [
      fact("promotionalMonthlyPriceMinor", "Monthly price", 3500, "ev_b_monthly"),
      fact("promotionalMonths", "Promotional period", 0, "ev_b_promo_period"),
      fact("standardMonthlyPriceMinor", "Standard monthly price", 3500, "ev_b_standard"),
      fact("installationFeeMinor", "Installation fee", 0, "ev_b_installation"),
      fact("activationFeeMinor", "Activation fee", 0, "ev_b_activation"),
      fact("equipmentMonthlyFeeMinor", "Router rental", 0, "ev_b_equipment"),
      fact("minimumTermMonths", "Contract term", 12, "ev_b_term"),
      fact("cancellationFeeMinor", "Early termination fee", 0, "ev_b_etf"),
      fact("renewalType", "Renewal", "monthly", "ev_b_renewal"),
      fact("dataAllowance", "Data allowance", "unlimited", "ev_b_data"),
      fact("familyBundleDiscountRetained", "Family mobile discount", true, "ev_b_family"),
    ],
    evidence: offerEvidence.b,
    extractionSource: "demo_fixture",
    status: "ready",
    createdAt: EXTRACTED_AT,
    updatedAt: EXTRACTED_AT,
  },
  {
    id: "offer_metronest_c",
    householdId: DEMO_HOUSEHOLD_ID,
    providerName: "MetroNest Demo",
    planName: "Home Plus",
    serviceType: "broadband",
    currency: "USD",
    sourceType: "demo_fixture",
    sourceLabel: METRONEST_LABEL,
    offerVersion: 1,
    rawDocumentId: "doc_offer_c",
    documentText: DOC_OFFER_C,
    terms: {
      providerName: "MetroNest Demo",
      planName: "Home Plus",
      serviceType: "broadband",
      currency: "USD",
      promotionalMonthlyPriceMinor: 3500,
      promotionalMonths: 12,
      standardMonthlyPriceMinor: null,
      installationFeeMinor: null,
      activationFeeMinor: null,
      equipmentMonthlyFeeMinor: 0,
      minimumTermMonths: null,
      renewalType: "unknown",
      cancellationFeeMinor: null,
      includedBenefits: [],
      excludedBenefits: [],
      dataAllowance: "unlimited",
      routerIncluded: true,
      familyBundleDiscountRetained: null,
      materialUnknowns: [
        "Standard price after the promotional period is not stated",
        "Installation fee is not stated",
        "Activation fee is not stated",
        "Minimum contract term is not stated",
        "The family bundle impact is not addressed",
      ],
    },
    facts: [
      fact("promotionalMonthlyPriceMinor", "Promotional monthly price", 3500, "ev_c_promo_price"),
      fact("promotionalMonths", "Promotional period", 12, "ev_c_promo_months"),
      fact("standardMonthlyPriceMinor", "Standard monthly price", null, "ev_c_standard", "unknown"),
      fact("installationFeeMinor", "Installation fee", null, "ev_c_installation", "unknown"),
      fact("activationFeeMinor", "Activation fee", null, "ev_c_activation", "unknown"),
      fact("equipmentMonthlyFeeMinor", "Router rental", 0, "ev_c_equipment"),
      fact("minimumTermMonths", "Contract term", null, "ev_c_term", "unknown"),
      fact("dataAllowance", "Data allowance", "unlimited", "ev_c_data"),
      fact("familyBundleDiscountRetained", "Family mobile discount", null, "ev_c_family", "unknown"),
    ],
    evidence: offerEvidence.c,
    extractionSource: "demo_fixture",
    status: "needs_verification",
    createdAt: EXTRACTED_AT,
    updatedAt: EXTRACTED_AT,
  },
];

export function buildSeedDatabase(): Database {
  return {
    households: [household],
    members,
    commitments,
    benefits,
    dependencies,
    policies: [policy],
    intents: [],
    offers,
    documents,
    analyses: [],
    evidence: [...currentEvidence, ...offerEvidence.a, ...offerEvidence.b, ...offerEvidence.c],
    approvals: [],
    executions: [],
    receipts: [],
    auditEvents: [
      {
        id: "audit_seed",
        householdId: DEMO_HOUSEHOLD_ID,
        actorType: "system",
        actorId: null,
        eventType: "demo.seeded",
        entityType: "household",
        entityId: DEMO_HOUSEHOLD_ID,
        metadata: { fixtureVersion: 1 },
        createdAt: EXTRACTED_AT,
      },
    ],
    meta: {
      seededAt: EXTRACTED_AT,
      schemaVersion: 1,
    },
  };
}

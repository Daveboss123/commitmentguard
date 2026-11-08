import { z } from "zod";

export const serviceTypeSchema = z.enum([
  "broadband",
  "mobile",
  "bundle",
  "streaming",
  "insurance",
  "utility",
  "other",
]);

export const renewalTypeSchema = z.enum([
  "monthly",
  "fixed_term",
  "automatic",
  "unknown",
]);

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO code");

/** Output contract for SERV intent extraction. */
export const ServIntentSchema = z.object({
  goal: z.string().min(1),
  serviceTypes: z.array(serviceTypeSchema).min(1),
  currency: currencySchema,
  minimumMonthlySavingMinor: z.number().int().nonnegative().nullable(),
  maxContractMonths: z.number().int().positive().nullable(),
  mustKeepBenefits: z.array(z.string()),
  mustHave: z.array(z.string()),
  mustNotHave: z.array(z.string()),
  softPreferences: z.array(z.string()),
  approvalRequiredFor: z.array(z.string()),
  unknownCriticalTermsPolicy: z.enum(["review", "block"]),
  ambiguities: z.array(z.string()),
});

export type ServIntentOutput = z.infer<typeof ServIntentSchema>;

export const offerBenefitSchema = z.object({
  key: z.string().min(1),
  description: z.string().min(1),
  valueMinor: z.number().int().nullable(),
});

/** Output contract for SERV offer-term extraction. */
export const ServOfferTermsSchema = z.object({
  providerName: z.string().nullable(),
  planName: z.string().nullable(),
  serviceType: serviceTypeSchema,
  currency: currencySchema.nullable(),
  promotionalMonthlyPriceMinor: z.number().int().nonnegative().nullable(),
  promotionalMonths: z.number().int().nonnegative().nullable(),
  standardMonthlyPriceMinor: z.number().int().nonnegative().nullable(),
  installationFeeMinor: z.number().int().nonnegative().nullable(),
  activationFeeMinor: z.number().int().nonnegative().nullable(),
  equipmentMonthlyFeeMinor: z.number().int().nonnegative().nullable(),
  minimumTermMonths: z.number().int().positive().nullable(),
  renewalType: renewalTypeSchema,
  cancellationFeeMinor: z.number().int().nonnegative().nullable(),
  includedBenefits: z.array(offerBenefitSchema),
  excludedBenefits: z.array(offerBenefitSchema),
  dataAllowance: z.string().nullable(),
  routerIncluded: z.boolean().nullable(),
  familyBundleDiscountRetained: z.boolean().nullable(),
  materialUnknowns: z.array(z.string()),
  extractedFacts: z.array(
    z.object({
      field: z.string().min(1),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      exactQuote: z.string(),
      page: z.number().int().positive().nullable(),
      section: z.string().nullable(),
    }),
  ),
});

export type ServOfferTermsOutput = z.infer<typeof ServOfferTermsSchema>;

/** Output contract for SERV consequence explanation. */
export const ServExplanationSchema = z.object({
  summary: z.string().min(1),
  materialChanges: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  evidenceIds: z.array(z.string()),
  confidenceExplanation: z.string(),
});

export type ServExplanationOutput = z.infer<typeof ServExplanationSchema>;

export const ExtractIntentRequestSchema = z.object({
  householdId: z.string().min(1),
  request: z.string().trim().min(10).max(4000),
});

export const ConfirmIntentRequestSchema = z.object({
  goal: z.string().trim().min(1).max(500).optional(),
  minimumMonthlySavingMinor: z.number().int().nonnegative().nullable().optional(),
  maxContractMonths: z.number().int().positive().nullable().optional(),
  mustKeepBenefits: z.array(z.string()).optional(),
  mustHave: z.array(z.string()).optional(),
  mustNotHave: z.array(z.string()).optional(),
  softPreferences: z.array(z.string()).optional(),
  unknownCriticalTermsPolicy: z.enum(["review", "block"]).optional(),
});

export const CreateAnalysisRequestSchema = z.object({
  intentId: z.string().min(1),
  offerId: z.string().min(1),
});

export const ApprovalRequestSchema = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  acknowledgedConsequences: z.array(z.string()).default([]),
  approverUserId: z.string().min(1).optional(),
  approverRole: z.enum(["owner", "approver"]).default("owner"),
});

export const KiteAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, "Amount must be a decimal string");

export const CreateExecutionRequestSchema = z.object({
  approvalId: z.string().min(1),
  maxTotalUsdc: KiteAmountSchema.optional(),
  maxPerTxUsdc: KiteAmountSchema.optional(),
});

export const KiteSessionActionSchema = z.object({
  action: z.enum(["refresh", "simulate_approval", "execute"]),
});

export const ExtractOfferRequestSchema = z.object({
  /** Re-extract from the offer's own document using SERV. */
  force: z.boolean().default(false),
});

export const ExplainAnalysisRequestSchema = z.object({
  regenerate: z.boolean().default(false),
});

export const CreateHouseholdRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: currencySchema.default("USD"),
  locale: z.string().trim().min(2).max(20).default("en-US"),
  ownerDisplayName: z.string().trim().min(1).max(120).default("Household owner"),
});

export const UpdateHouseholdRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    defaultCurrency: currencySchema.optional(),
    locale: z.string().trim().min(2).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one household field is required",
  });

export const CommitmentInputSchema = z.object({
  providerName: z.string().trim().min(1).max(120),
  serviceType: serviceTypeSchema,
  planName: z.string().trim().min(1).max(160),
  currency: currencySchema.default("USD"),
  recurringChargeMinor: z.number().int().nonnegative(),
  billingPeriod: z.enum(["monthly", "annual", "one_off"]).default("monthly"),
  contractStart: z.string().trim().min(1),
  contractEnd: z.string().trim().nullable().default(null),
  minimumTermMonths: z.number().int().nonnegative().default(0),
  renewalType: renewalTypeSchema.default("unknown"),
  promoEndDate: z.string().trim().nullable().default(null),
  standardChargeMinor: z.number().int().nonnegative().nullable().default(null),
  cancellationFeeMinor: z.number().int().nonnegative().nullable().default(null),
  equipmentMonthlyFeeMinor: z.number().int().nonnegative().nullable().default(null),
  dataAllowance: z.string().trim().max(120).nullable().default(null),
  routerIncluded: z.boolean().nullable().default(null),
  sourceNote: z.string().trim().max(500).optional(),
});

export const CommitmentUpdateSchema = CommitmentInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one commitment field is required" },
);

export const PolicyUpdateSchema = z.object({
  currency: currencySchema.optional(),
  minimumMonthlySavingMinor: z.number().int().nonnegative().nullable(),
  maxContractMonths: z.number().int().positive().nullable(),
  mustKeepBenefits: z.array(z.string().trim().min(1)),
  mustHave: z.array(z.string().trim().min(1)),
  mustNotHave: z.array(z.string().trim().min(1)),
  softPreferences: z.array(z.string().trim().min(1)),
  unknownCriticalTermsPolicy: z.enum(["review", "block"]),
  approvalRequiredFor: z.array(z.string().trim().min(1)),
});

export const UploadDocumentRequestSchema = z.object({
  householdId: z.string().min(1),
  label: z.string().trim().min(1).max(200),
  text: z.string().trim().min(20).max(500_000),
  kind: z.enum(["current_terms", "offer_terms", "demo_note"]).default("offer_terms"),
});

export const FetchUrlRequestSchema = z.object({
  householdId: z.string().min(1),
  label: z.string().trim().min(1).max(200).optional(),
  url: z.string().url().max(2048),
  kind: z.enum(["current_terms", "offer_terms", "demo_note"]).default("offer_terms"),
});

export const ManualOfferRequestSchema = z.object({
  householdId: z.string().min(1),
  providerName: z.string().trim().min(1).max(120),
  planName: z.string().trim().min(1).max(160),
  serviceType: serviceTypeSchema,
  currency: currencySchema.default("USD"),
  documentText: z.string().trim().min(20).max(500_000),
  sourceLabel: z.string().trim().min(1).max(200).default("Pasted offer document"),
});

export const LoginRequestSchema = z.object({
  householdId: z.string().min(1),
});

/**
 * Core domain types for the commitment consequence engine.
 *
 * Rules encoded here:
 * - Money is always an integer in minor units (cents). Never floats.
 * - Every material fact can carry evidence.
 * - Unknown is a first-class value. Never coerce it to zero.
 */

export type Decision = "allow" | "review" | "block";

export type ServiceType =
  | "broadband"
  | "mobile"
  | "bundle"
  | "streaming"
  | "insurance"
  | "utility"
  | "other";

export type BillingPeriod = "monthly" | "annual" | "one_off";

export type RenewalType = "monthly" | "fixed_term" | "automatic" | "unknown";

export type EvidenceStatus =
  | "verified"
  | "user_provided"
  | "inferred"
  | "unknown"
  | "contradicted"
  | "stale";

export type EvidenceSourceType =
  | "uploaded_document"
  | "demo_fixture"
  | "user_input"
  | "provider_api"
  | "public_url";

export interface Evidence {
  id: string;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  documentId?: string;
  /** The entity the fact belongs to, so facts about different offers never collide. */
  subjectId?: string;
  page?: number;
  section?: string;
  quote: string;
  normalizedField?: string;
  normalizedValue?: string | number | boolean | null;
  status: EvidenceStatus;
  extractedAt: string;
  sourceVersionHash: string;
  freshnessExpiresAt?: string;
}

export interface Household {
  id: string;
  ownerUserId: string;
  name: string;
  defaultCurrency: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId?: string;
  invitedEmail?: string;
  displayName: string;
  role: "owner" | "approver" | "viewer";
  status: "active" | "invited" | "disabled";
  createdAt: string;
}

export interface Commitment {
  id: string;
  householdId: string;
  providerName: string;
  serviceType: ServiceType;
  planName: string;
  currency: string;
  /** Recurring charge before benefits, in minor units. */
  recurringChargeMinor: number;
  billingPeriod: BillingPeriod;
  contractStart: string;
  contractEnd: string | null;
  minimumTermMonths: number;
  renewalType: RenewalType;
  promoEndDate: string | null;
  standardChargeMinor: number | null;
  cancellationFeeMinor: number | null;
  equipmentMonthlyFeeMinor: number | null;
  dataAllowance: string | null;
  routerIncluded: boolean | null;
  status: "active" | "ended";
  evidenceIds: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommitmentBenefit {
  id: string;
  commitmentId: string;
  householdId: string;
  benefitKey: string;
  description: string;
  valueMinor: number | null;
  currency: string;
  billingPeriod: "monthly" | "one_off";
  beneficiaryScope: "individual" | "household";
  status: "active" | "lost" | "unknown";
  evidenceId: string | null;
  createdAt: string;
}

export interface CommitmentDependency {
  id: string;
  householdId: string;
  fromCommitmentId: string;
  toCommitmentId: string | null;
  benefitId: string | null;
  dependencyType:
    | "bundle_discount"
    | "eligibility"
    | "shared_account"
    | "equipment"
    | "data_access"
    | "other";
  impactDescription: string;
  /** Monthly household cost impact if the dependency breaks, in minor units. */
  monthlyImpactMinor: number | null;
  evidenceId: string | null;
  status: "active" | "broken" | "unknown";
}

export interface UserPolicy {
  id: string;
  householdId: string;
  version: number;
  currency: string;
  minimumMonthlySavingMinor: number | null;
  maxContractMonths: number | null;
  mustKeepBenefits: string[];
  mustHave: string[];
  mustNotHave: string[];
  softPreferences: string[];
  unknownCriticalTermsPolicy: "review" | "block";
  /** Optional cap on one-off fees (installation + activation), in minor units. */
  maxOneTimeFeeMinor?: number | null;
  approvalRequiredFor: string[];
  createdAt: string;
}

export type IntentExtractionSource = "serv" | "demo_parser";

export interface IntentContract {
  id: string;
  householdId: string;
  policyId: string;
  version: number;
  originalRequest: string;
  goal: string;
  serviceTypes: ServiceType[];
  currency: string;
  minimumMonthlySavingMinor: number | null;
  maxContractMonths: number | null;
  mustKeepBenefits: string[];
  mustHave: string[];
  mustNotHave: string[];
  softPreferences: string[];
  approvalRequiredFor: string[];
  unknownCriticalTermsPolicy: "review" | "block";
  ambiguities: string[];
  extractionModel: string;
  extractionSource: IntentExtractionSource;
  servRequestId: string | null;
  servLatencyMs: number | null;
  userConfirmedAt: string | null;
  createdAt: string;
}

export interface OfferBenefit {
  key: string;
  description: string;
  valueMinor: number | null;
  evidenceId: string | null;
}

export interface ExtractedFact {
  field: string;
  label: string;
  value: string | number | boolean | null;
  evidenceId: string | null;
  status: EvidenceStatus;
}

export interface OfferTerms {
  providerName: string | null;
  planName: string | null;
  serviceType: ServiceType;
  currency: string | null;
  promotionalMonthlyPriceMinor: number | null;
  promotionalMonths: number | null;
  standardMonthlyPriceMinor: number | null;
  installationFeeMinor: number | null;
  activationFeeMinor: number | null;
  equipmentMonthlyFeeMinor: number | null;
  minimumTermMonths: number | null;
  renewalType: RenewalType;
  cancellationFeeMinor: number | null;
  includedBenefits: OfferBenefit[];
  excludedBenefits: OfferBenefit[];
  dataAllowance: string | null;
  routerIncluded: boolean | null;
  familyBundleDiscountRetained: boolean | null;
  materialUnknowns: string[];
}

export type OfferExtractionSource =
  | "serv"
  | "demo_fixture"
  | "manual"
  | "demo_parser";

export interface Offer {
  id: string;
  householdId: string;
  providerName: string;
  planName: string;
  serviceType: ServiceType;
  currency: string;
  sourceType: "demo_fixture" | "uploaded_document" | "manual";
  sourceLabel: string;
  offerVersion: number;
  rawDocumentId: string | null;
  documentText: string;
  terms: OfferTerms;
  facts: ExtractedFact[];
  evidence: Evidence[];
  extractionSource: OfferExtractionSource;
  /** Recorded extraction metadata, when the extraction service reported it. */
  extractionModel?: string | null;
  extractionLatencyMs?: number | null;
  extractionResponseId?: string | null;
  status: "draft" | "ready" | "needs_verification";
  createdAt: string;
  updatedAt: string;
}

export interface DemoDocument {
  id: string;
  householdId: string;
  label: string;
  kind: "current_terms" | "offer_terms" | "demo_note";
  text: string;
  sourceVersionHash: string;
  createdAt: string;
}

export type ConsequenceCategory =
  | "financial"
  | "contractual"
  | "household_benefit"
  | "data"
  | "service"
  | "reversibility";

export type Severity = "low" | "medium" | "high" | "critical";

export interface Consequence {
  id: string;
  analysisId: string;
  category: ConsequenceCategory;
  severity: Severity;
  title: string;
  description: string;
  direction: "gain" | "loss" | "neutral" | "unknown";
  evidenceIds: string[];
  calculation: Record<string, unknown> | null;
  status: "confirmed" | "needs_verification";
}

export interface DecisionReason {
  code: string;
  title: string;
  detail: string;
  severity: Severity;
  constraint?: string;
  evidenceIds: string[];
}

/**
 * One auditable component of a total-cost figure.
 *
 * Every displayed dollar amount must be reproducible from its line items:
 * amount × quantity over an explicit month range, in integer minor units.
 */
export interface TcoLine {
  /** Stable within an analysis, e.g. "proposed:standard-price". */
  id: string;
  label: string;
  /** Per-month (or one-off) amount in integer minor units. Negative = saving. */
  monthlyMinor: number;
  months: number;
  subtotalMinor: number;
  frequency: "monthly" | "one_off";
  quantity: number;
  currency: string;
  /** 1-based inclusive month in the horizon. Null for a one-off charge. */
  startMonth: number | null;
  endMonth: number | null;
  /** Evidence that supports the amount, when the amount came from a quote. */
  sourceEvidenceId: string | null;
  /** Whether the subtotal is part of the reported total. */
  includedInTotal: boolean;
  direction: "cost" | "saving" | "neutral";
  calculationExplanation: string;
}

export interface TcoResult {
  horizonMonths: 12 | 24;
  totalMinor: number | null;
  complete: boolean;
  missingFields: string[];
  lines: TcoLine[];
  /** Version of the cost model, recorded in the analysis hash and receipts. */
  calculationVersion: string;
}

export interface ComparisonTotals {
  current12: TcoResult;
  proposed12: TcoResult;
  current24: TcoResult;
  proposed24: TcoResult;
  delta12Minor: number | null;
  delta24Minor: number | null;
  savings12Minor: number | null;
  savings24Minor: number | null;
  averageMonthlySaving12Minor: number | null;
}

export interface EvidenceValidation {
  total: number;
  valid: number;
  invalidEvidenceIds: string[];
  contradictedEvidenceIds: string[];
}

export interface ServExplanation {
  summary: string;
  materialChanges: string[];
  tradeoffs: string[];
  followUpQuestions: string[];
  evidenceIds: string[];
  confidenceExplanation: string;
  model: string;
  responseId: string | null;
  latencyMs: number;
}

export interface Analysis {
  id: string;
  householdId: string;
  intentContractId: string;
  intentVersion: number;
  offerId: string;
  offerVersion: number;
  status: "completed" | "failed";
  decision: Decision;
  decisionReasons: DecisionReason[];
  consequences: Consequence[];
  totals: ComparisonTotals;
  unknowns: string[];
  evidenceValidation: EvidenceValidation;
  evidenceIds: string[];
  analysisVersion: string;
  inputHash: string;
  servExplanation: ServExplanation | null;
  servExplanationError?: string | null;
  createdAt: string;
}

export interface Approval {
  id: string;
  analysisId: string;
  offerVersion: number;
  analysisHash: string;
  approverUserId: string;
  approverRole: "owner" | "approver";
  decision: "approve" | "reject" | "request_changes";
  acknowledgedConsequences: string[];
  approvedAmountMinor: number | null;
  currency: string | null;
  expiresAt: string;
  createdAt: string;
}

export type ExecutionMode = "simulated" | "kite_x402" | "provider_api";

export type ExecutionStatus =
  | "not_started"
  | "pending_authorization"
  | "authorized"
  | "submitted"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Execution {
  id: string;
  analysisId: string;
  approvalId: string;
  executionMode: ExecutionMode;
  status: ExecutionStatus;
  externalReference: string | null;
  amountUsdc: string | null;
  kiteRequestId: string | null;
  kiteSessionId: string | null;
  approvalUrl: string | null;
  sessionStatus: string | null;
  providerResponseSummary: Record<string, unknown> | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionReceipt {
  id: string;
  householdId: string;
  analysisId: string;
  receiptVersion: number;
  receiptPayload: Record<string, unknown>;
  contentHash: string;
  previousReceiptHash: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  householdId: string;
  actorType: "user" | "system" | "agent" | "provider";
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Database {
  households: Household[];
  members: HouseholdMember[];
  commitments: Commitment[];
  benefits: CommitmentBenefit[];
  dependencies: CommitmentDependency[];
  policies: UserPolicy[];
  intents: IntentContract[];
  offers: Offer[];
  documents: DemoDocument[];
  analyses: Analysis[];
  evidence: Evidence[];
  approvals: Approval[];
  executions: Execution[];
  receipts: DecisionReceipt[];
  auditEvents: AuditEvent[];
  meta: {
    seededAt: string;
    schemaVersion: number;
  };
}

import "server-only";
import { getDatabase } from "@/lib/store/database";
import { averageMonthlyCost, calculateCurrentTco } from "@/lib/domain/tco";
import type {
  Analysis,
  Approval,
  AuditEvent,
  Commitment,
  CommitmentBenefit,
  CommitmentDependency,
  DecisionReceipt,
  DemoDocument,
  Evidence,
  Execution,
  Household,
  IntentContract,
  Offer,
  UserPolicy,
} from "@/lib/domain/types";

export interface HouseholdData {
  household: Household | null;
  commitments: Commitment[];
  benefits: CommitmentBenefit[];
  dependencies: CommitmentDependency[];
  policy: UserPolicy | null;
  intents: IntentContract[];
  offers: Offer[];
  documents: DemoDocument[];
  analyses: Analysis[];
  approvals: Approval[];
  executions: Execution[];
  receipts: DecisionReceipt[];
  auditEvents: AuditEvent[];
  evidence: Evidence[];
}

/**
 * Loads the household ledger in one read. Access control happens before this
 * helper is called (page context or API route). Results are sorted newest first
 * so pages never present an older decision as current.
 */
export async function getHouseholdData(
  householdId: string,
): Promise<HouseholdData> {
  const database = await getDatabase();
  const commitmentIds = new Set(
    database.commitments
      .filter((item) => item.householdId === householdId)
      .map((item) => item.id),
  );
  const analyses = database.analyses
    .filter((item) => item.householdId === householdId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const analysisIds = new Set(analyses.map((item) => item.id));

  return {
    household:
      database.households.find((item) => item.id === householdId) ?? null,
    commitments: database.commitments.filter(
      (item) => item.householdId === householdId,
    ),
    benefits: database.benefits.filter(
      (item) => item.householdId === householdId,
    ),
    dependencies: database.dependencies.filter(
      (item) => item.householdId === householdId,
    ),
    policy:
      database.policies
        .filter((item) => item.householdId === householdId)
        .sort((left, right) => right.version - left.version)[0] ?? null,
    intents: database.intents
      .filter((item) => item.householdId === householdId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    offers: database.offers.filter((item) => item.householdId === householdId),
    documents: database.documents.filter(
      (item) => item.householdId === householdId,
    ),
    analyses,
    approvals: database.approvals
      .filter((item) => analysisIds.has(item.analysisId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    executions: database.executions
      .filter((item) => analysisIds.has(item.analysisId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    receipts: database.receipts
      .filter((item) => item.householdId === householdId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    auditEvents: database.auditEvents
      .filter((item) => item.householdId === householdId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    evidence: database.evidence.filter(
      (item) =>
        Boolean(item.subjectId && commitmentIds.has(item.subjectId)) ||
        database.documents.some(
          (document) =>
            document.householdId === householdId && document.id === item.documentId,
        ),
    ),
  };
}

export function currentMonthlyCostMinor(data: HouseholdData): number | null {
  const tco = calculateCurrentTco({
    commitments: data.commitments,
    benefits: data.benefits,
    dependencies: data.dependencies,
    horizonMonths: 12,
  });
  return averageMonthlyCost(tco);
}

export function monthlyRecurringMinor(data: HouseholdData): number {
  const totalMinor = data.commitments
    .filter((item) => item.status === "active")
    .reduce((sum, item) => {
      if (item.billingPeriod === "monthly") return sum + item.recurringChargeMinor;
      if (item.billingPeriod === "annual") {
        return sum + Math.round(item.recurringChargeMinor / 12);
      }
      return sum + item.recurringChargeMinor;
    }, 0);
  const benefitMinor = data.benefits
    .filter((item) => item.status === "active" && item.billingPeriod === "monthly")
    .reduce((sum, item) => sum + (item.valueMinor ?? 0), 0);
  return totalMinor - benefitMinor;
}

export function evidenceForCommitment(
  data: HouseholdData,
  commitment: Commitment,
): Evidence[] {
  return data.evidence.filter((item) =>
    commitment.evidenceIds.includes(item.id),
  );
}

export function verifiedEvidenceCount(evidence: Evidence[]): number {
  return evidence.filter((item) => item.status === "verified").length;
}

export function latestAnalysisForOffer(
  data: HouseholdData,
  offerId: string,
): Analysis | null {
  return data.analyses.find((item) => item.offerId === offerId) ?? null;
}

export function analysesForIntent(
  data: HouseholdData,
  intentId: string,
): Analysis[] {
  return data.analyses.filter((item) => item.intentContractId === intentId);
}

export function pendingApprovalForAnalysis(
  data: HouseholdData,
  analysisId: string,
): Approval | null {
  return (
    data.approvals
      .filter(
        (item) =>
          item.analysisId === analysisId &&
          item.decision === "approve" &&
          new Date(item.expiresAt).getTime() > Date.now(),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
    null
  );
}

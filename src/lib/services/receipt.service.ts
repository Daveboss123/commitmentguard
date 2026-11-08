import "server-only";
import { randomUUID } from "node:crypto";
import type {
  Analysis,
  Approval,
  Database,
  DecisionReceipt,
  Execution,
  IntentContract,
  Offer,
} from "@/lib/domain/types";
import { hashPayload } from "@/lib/domain/canonical";
import { serverNow } from "@/lib/store/database";

export type ReceiptStage = "analysis" | "approval" | "execution";

export interface ReceiptInput {
  analysis: Analysis;
  intent: IntentContract | null;
  offer: Offer | null;
  approval?: Approval | null;
  execution?: Execution | null;
  stage: ReceiptStage;
  actorUserId: string | null;
}

export function appendReceipt(
  database: Database,
  input: ReceiptInput,
): DecisionReceipt {
  const previous = database.receipts
    .filter((receipt) => receipt.householdId === input.analysis.householdId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .at(-1);

  const { analysis, intent, offer, approval, execution } = input;
  const now = serverNow();

  const payload: Record<string, unknown> = {
    kind: "commitmentguard.decision_receipt",
    schemaVersion: 1,
    stage: input.stage,
    householdId: analysis.householdId,
    analysisId: analysis.id,
    analysisVersion: analysis.analysisVersion,
    analysisHash: analysis.inputHash,
    createdAt: now,
    intent: intent
      ? {
          id: intent.id,
          version: intent.version,
          originalRequest: intent.originalRequest,
          goal: intent.goal,
          hardConstraints: {
            minimumMonthlySavingMinor: intent.minimumMonthlySavingMinor,
            maxContractMonths: intent.maxContractMonths,
            mustKeepBenefits: intent.mustKeepBenefits,
            mustHave: intent.mustHave,
            mustNotHave: intent.mustNotHave,
            unknownCriticalTermsPolicy: intent.unknownCriticalTermsPolicy,
          },
          extraction: {
            source: intent.extractionSource,
            model: intent.extractionModel,
            servRequestId: intent.servRequestId,
            confirmedAt: intent.userConfirmedAt,
          },
        }
      : null,
    offer: offer
      ? {
          id: offer.id,
          version: offer.offerVersion,
          providerName: offer.providerName,
          planName: offer.planName,
          sourceLabel: offer.sourceLabel,
          extractionSource: offer.extractionSource,
          terms: offer.terms,
          evidenceIds: offer.evidence.map((item) => item.id),
        }
      : null,
    decision: analysis.decision,
    reasons: analysis.decisionReasons.map((reason) => ({
      code: reason.code,
      title: reason.title,
      severity: reason.severity,
    })),
    totals: {
      currentTco12Minor: analysis.totals.current12.totalMinor,
      proposedTco12Minor: analysis.totals.proposed12.totalMinor,
      delta12Minor: analysis.totals.delta12Minor,
      currentTco24Minor: analysis.totals.current24.totalMinor,
      proposedTco24Minor: analysis.totals.proposed24.totalMinor,
      delta24Minor: analysis.totals.delta24Minor,
      savings12Minor: analysis.totals.savings12Minor,
    },
    consequenceIds: analysis.consequences.map((item) => item.id),
    consequences: analysis.consequences.map((item) => ({
      id: item.id,
      category: item.category,
      severity: item.severity,
      title: item.title,
      status: item.status,
    })),
    evidenceIds: analysis.evidenceIds,
    unknowns: analysis.unknowns,
    servExplanation: analysis.servExplanation
      ? {
          summary: analysis.servExplanation.summary,
          model: analysis.servExplanation.model,
          responseId: analysis.servExplanation.responseId,
          evidenceIds: analysis.servExplanation.evidenceIds,
        }
      : null,
    approval: approval
      ? {
          id: approval.id,
          approverUserId: approval.approverUserId,
          approverRole: approval.approverRole,
          decision: approval.decision,
          acknowledgedConsequences: approval.acknowledgedConsequences,
          approvedAmountMinor: approval.approvedAmountMinor,
          currency: approval.currency,
          expiresAt: approval.expiresAt,
          approvedAt: approval.createdAt,
        }
      : null,
    execution: execution
      ? {
          id: execution.id,
          mode: execution.executionMode,
          status: execution.status,
          externalReference: execution.externalReference,
          amountUsdc: execution.amountUsdc,
          kiteRequestId: execution.kiteRequestId,
          kiteSessionId: execution.kiteSessionId,
          simulated: execution.executionMode === "simulated",
          paymentSucceeded: execution.status === "succeeded",
          providerActivation:
            execution.executionMode === "provider_api" ? "integrated" : "not_integrated",
          updatedAt: execution.updatedAt,
        }
      : null,
    states: {
      analysisCompleted: true,
      decisionApproved: approval?.decision === "approve",
      kiteSessionApproved:
        execution?.sessionStatus === "session_active" ||
        execution?.status === "authorized" ||
        execution?.status === "submitted" ||
        execution?.status === "succeeded",
      paymentSubmitted:
        execution?.status === "submitted" || execution?.status === "succeeded",
      paymentSucceeded: execution?.status === "succeeded",
      providerActionSucceeded: false,
      providerActivation: "not_integrated",
    },
    actorUserId: input.actorUserId,
  };

  const receipt: DecisionReceipt = {
    id: `rcpt_${randomUUID()}`,
    householdId: analysis.householdId,
    analysisId: analysis.id,
    receiptVersion: (previous?.receiptVersion ?? 0) + 1,
    receiptPayload: payload,
    contentHash: hashPayload(payload),
    previousReceiptHash: previous?.contentHash ?? null,
    createdAt: now,
  };

  database.receipts.push(receipt);
  return receipt;
}

export interface ReceiptVerification {
  valid: boolean;
  computedHash: string;
  storedHash: string;
  chainValid: boolean | null;
  previousReceiptHash: string | null;
  previousReceiptFound: boolean;
  checkedAt: string;
}

export function verifyReceipt(
  database: Database,
  receipt: DecisionReceipt,
): ReceiptVerification {
  const computedHash = hashPayload(receipt.receiptPayload);
  const valid = computedHash === receipt.contentHash;

  let chainValid: boolean | null = null;
  let previousReceiptFound = false;
  if (receipt.previousReceiptHash) {
    const previous = database.receipts.find(
      (candidate) => candidate.contentHash === receipt.previousReceiptHash,
    );
    previousReceiptFound = Boolean(previous);
    chainValid = Boolean(previous && previous.contentHash === receipt.previousReceiptHash);
  }

  return {
    valid,
    computedHash,
    storedHash: receipt.contentHash,
    chainValid,
    previousReceiptHash: receipt.previousReceiptHash,
    previousReceiptFound,
    checkedAt: serverNow(),
  };
}

export function receiptsForAnalysis(
  database: Database,
  analysisId: string,
): DecisionReceipt[] {
  return database.receipts
    .filter((receipt) => receipt.analysisId === analysisId)
    .sort((left, right) => left.receiptVersion - right.receiptVersion);
}

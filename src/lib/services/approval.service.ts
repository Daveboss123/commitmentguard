import "server-only";
import { randomUUID } from "node:crypto";
import type {
  Analysis,
  Approval,
  DecisionReceipt,
  Execution,
  IntentContract,
  Offer,
} from "@/lib/domain/types";
import { mutateDatabase, getDatabase } from "@/lib/store/database";
import {
  appendAudit,
  getAnalysis,
  getApproval,
  requireHouseholdAccess,
  requireWritableHousehold,
  type HouseholdAccess,
} from "@/lib/store/repository";
import { ApiError } from "@/lib/http/errors";
import { assertAnalysisCurrent } from "./analysis.service";
import { appendReceipt } from "./receipt.service";

export interface CreateApprovalInput {
  analysisId: string;
  decision: "approve" | "reject" | "request_changes";
  acknowledgedConsequences: string[];
  approverRole: "owner" | "approver";
}

export interface ApprovalResult {
  approval: Approval;
  receipt: DecisionReceipt | null;
  analysis: Analysis;
}

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

function materialConsequenceIds(
  analysis: Pick<Analysis, "consequences">,
): string[] {
  return analysis.consequences
    .filter(
      (consequence) =>
        consequence.severity === "critical" || consequence.severity === "high",
    )
    .map((consequence) => consequence.id);
}

export type ApprovalBasis = Pick<
  Analysis,
  "decision" | "unknowns" | "evidenceValidation" | "consequences"
>;

/**
 * The fail-closed checks that decide whether an analysis may be approved at
 * all. Exported separately so the gate can be tested without a session or a
 * database and can never drift into a UI-only check.
 */
export function assertApprovalBasis(
  analysis: ApprovalBasis,
  acknowledgedConsequences: string[],
): string[] {
  if (analysis.decision !== "allow") {
    throw new ApiError(
      "HARD_CONSTRAINT_VIOLATION",
      "This analysis cannot be approved. Resolve the block or review reasons first.",
    );
  }
  if (analysis.unknowns.length > 0) {
    throw new ApiError(
      "ANALYSIS_INCOMPLETE",
      "Material terms remain unknown. Approval is not allowed until they are resolved.",
      { unknowns: analysis.unknowns },
    );
  }
  if (
    analysis.evidenceValidation.invalidEvidenceIds.length > 0 ||
    analysis.evidenceValidation.contradictedEvidenceIds.length > 0
  ) {
    throw new ApiError(
      "EVIDENCE_INVALID",
      "The evidence is not fully valid. Approval is not allowed.",
    );
  }
  const required = materialConsequenceIds(analysis);
  const missing = required.filter(
    (id) => !acknowledgedConsequences.includes(id),
  );
  if (missing.length > 0) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "Every high or critical consequence must be explicitly acknowledged.",
      { missingConsequenceIds: missing },
    );
  }
  return required;
}

export async function createApproval(
  input: CreateApprovalInput,
): Promise<ApprovalResult> {
  const analysis = await getAnalysis(input.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const access = await requireWritableHousehold(analysis.householdId);
  if (access.member.role === "approver" && input.approverRole !== "approver") {
    throw new ApiError(
      "HOUSEHOLD_ACCESS_DENIED",
      "An approver must record the approval with the approver role.",
    );
  }

  const current = await assertAnalysisCurrent(analysis);

  if (input.decision === "approve") {
    assertApprovalBasis(analysis, input.acknowledgedConsequences);
  }

  const result = await mutateDatabase((database) => {
    const storedAnalysis = database.analyses.find((item) => item.id === analysis.id);
    if (!storedAnalysis) throw new ApiError("NOT_FOUND", "Analysis not found.");

    if (input.decision === "approve") {
      const existing = database.approvals.find(
        (item) =>
          item.analysisId === analysis.id &&
          item.decision === "approve" &&
          item.analysisHash === analysis.inputHash &&
          new Date(item.expiresAt).getTime() > Date.now(),
      );
      if (existing) {
        return {
          approval: existing,
          receipt: null,
          analysis: storedAnalysis,
        };
      }
    }

    const now = Date.now();
    const approval: Approval = {
      id: `appr_${randomUUID()}`,
      analysisId: analysis.id,
      offerVersion: current.offer.offerVersion,
      analysisHash: analysis.inputHash,
      approverUserId: access.session.userId,
      approverRole: input.approverRole,
      decision: input.decision,
      acknowledgedConsequences: [...new Set(input.acknowledgedConsequences)],
      approvedAmountMinor:
        input.decision === "approve"
          ? analysis.totals.proposed12.totalMinor
          : null,
      currency:
        input.decision === "approve" ? current.intent.currency : null,
      expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(),
      createdAt: new Date(now).toISOString(),
    };
    database.approvals.push(approval);

    const offer = database.offers.find((item) => item.id === analysis.offerId) ?? null;
    const intent = database.intents.find(
      (item) => item.id === analysis.intentContractId,
    ) ?? null;
    const receipt =
      input.decision === "approve"
        ? appendReceipt(database, {
            analysis: storedAnalysis,
            intent,
            offer,
            approval,
            stage: "approval",
            actorUserId: access.session.userId,
          })
        : null;

    appendAudit(database, {
      householdId: analysis.householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: `approval.${input.decision}`,
      entityType: "approval",
      entityId: approval.id,
      metadata: {
        analysisId: analysis.id,
        analysisHash: analysis.inputHash,
        acknowledgedConsequences: approval.acknowledgedConsequences.length,
        expiresAt: approval.expiresAt,
        receiptId: receipt?.id ?? null,
      },
    });

    if (input.decision !== "approve") {
      appendAudit(database, {
        householdId: analysis.householdId,
        actorType: "system",
        actorId: null,
        eventType: "execution.blocked_by_approval",
        entityType: "analysis",
        entityId: analysis.id,
        metadata: { approvalDecision: input.decision },
      });
    }

    return {
      approval,
      receipt,
      analysis: storedAnalysis,
    };
  });

  return result;
}

export async function recordApprovalDecision(input: {
  approvalId: string;
  decision: "approve" | "reject" | "request_changes";
}): Promise<ApprovalResult> {
  const approval = await getApproval(input.approvalId);
  if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
  const analysis = await getAnalysis(approval.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const access = await requireWritableHousehold(analysis.householdId);

  if (input.decision === "approve") {
    if (approval.decision !== "approve") {
      throw new ApiError(
        "APPROVAL_IMMUTABLE",
        "A rejected approval cannot be approved directly. Create a fresh approval against a current analysis.",
      );
    }
    return { approval, receipt: null, analysis };
  }

  const database = await getDatabase();
  const executions = database.executions.filter(
    (execution) => execution.approvalId === approval.id,
  );
  if (
    executions.some((execution) =>
      ["authorized", "submitted", "succeeded"].includes(execution.status),
    )
  ) {
    throw new ApiError(
      "EXECUTION_ALREADY_SUBMITTED",
      "This approval has already advanced to Kite authorization or execution. It cannot be revoked here.",
    );
  }

  const result = await mutateDatabase((db) => {
    const stored = db.approvals.find((item) => item.id === approval.id);
    const storedAnalysis = db.analyses.find((item) => item.id === analysis.id);
    if (!stored || !storedAnalysis) {
      throw new ApiError("NOT_FOUND", "Approval or analysis not found.");
    }
    stored.decision = input.decision;
    const offer = db.offers.find((item) => item.id === storedAnalysis.offerId) ?? null;
    const intent = db.intents.find(
      (item) => item.id === storedAnalysis.intentContractId,
    ) ?? null;
    const receipt = appendReceipt(db, {
      analysis: storedAnalysis,
      intent,
      offer,
      approval: stored,
      stage: "approval",
      actorUserId: access.session.userId,
    });
    appendAudit(db, {
      householdId: storedAnalysis.householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: `approval.${input.decision}`,
      entityType: "approval",
      entityId: stored.id,
      metadata: { receiptId: receipt.id, supersedesPriorDecision: approval.decision },
    });
    return { approval: stored, receipt, analysis: storedAnalysis };
  });

  return result;
}

export interface ApprovalBundle {
  approval: Approval;
  analysis: Analysis;
  intent: IntentContract | null;
  offer: Offer | null;
  executions: Execution[];
  receipts: DecisionReceipt[];
}

export async function getApprovalBundle(
  approvalId: string,
  access?: HouseholdAccess,
): Promise<ApprovalBundle> {
  const approval = await getApproval(approvalId);
  if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
  const analysis = await getAnalysis(approval.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  await (access
    ? Promise.resolve(access)
    : requireHouseholdAccess(analysis.householdId));
  const database = await getDatabase();
  return {
    approval,
    analysis,
    intent:
      database.intents.find((item) => item.id === analysis.intentContractId) ?? null,
    offer: database.offers.find((item) => item.id === analysis.offerId) ?? null,
    executions: database.executions.filter(
      (execution) => execution.approvalId === approval.id,
    ),
    receipts: database.receipts
      .filter((receipt) => receipt.analysisId === analysis.id)
      .sort((left, right) => left.receiptVersion - right.receiptVersion),
  };
}

export async function latestApprovalForAnalysis(
  analysisId: string,
): Promise<Approval | null> {
  const database = await getDatabase();
  return (
    database.approvals
      .filter((approval) => approval.analysisId === analysisId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
}

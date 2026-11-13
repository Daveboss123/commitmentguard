import "server-only";
import { randomUUID } from "node:crypto";
import type {
  Analysis,
  Approval,
  Database,
  DecisionReceipt,
  Execution,
  ExecutionStatus,
  IntentContract,
  Offer,
} from "@/lib/domain/types";
import { compareUsdcAmounts, minUsdcAmount } from "@/lib/domain/money";
import { serverConfig } from "@/lib/app/config";
import { mutateDatabase, getDatabase, serverNow } from "@/lib/store/database";
import {
  appendAudit,
  getAnalysis,
  getApproval,
  getExecution,
  requireHouseholdAccess,
  requireWritableHousehold,
  type HouseholdAccess,
} from "@/lib/store/repository";
import { ApiError } from "@/lib/http/errors";
import { assertAnalysisCurrent, assertAnalysisSnapshotCurrent } from "./analysis.service";
import { assertApprovalBasis } from "./approval.service";
import { appendReceipt } from "./receipt.service";
import {
  getKiteAdapter,
  isKiteExecutionLive,
  KiteMockAdapter,
} from "@/lib/integrations/kite/factory";
import type {
  KiteSessionRequest,
  KiteExecutionResult,
  KiteSessionStatus,
  KiteStatus,
} from "@/lib/integrations/kite/types";

function assertAmount(value: string, label: string): void {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new ApiError("VALIDATION_FAILED", `${label} must be a decimal USDC amount.`);
  }
  if (compareUsdcAmounts(value, "0") <= 0) {
    throw new ApiError("VALIDATION_FAILED", `${label} must be greater than zero.`);
  }
}

function assertEnvCaps(input: { maxTotalUsdc: string; maxPerTxUsdc: string }): void {
  if (compareUsdcAmounts(input.maxTotalUsdc, serverConfig.kite.maxTotalUsdc) > 0) {
    throw new ApiError(
      "KITE_BUDGET_EXCEEDED",
      `The requested session total exceeds the server cap of ${serverConfig.kite.maxTotalUsdc} USDC.`,
    );
  }
  if (compareUsdcAmounts(input.maxPerTxUsdc, serverConfig.kite.maxPerTxUsdc) > 0) {
    throw new ApiError(
      "KITE_BUDGET_EXCEEDED",
      `The requested per-transaction amount exceeds the server cap of ${serverConfig.kite.maxPerTxUsdc} USDC.`,
    );
  }
  if (compareUsdcAmounts(input.maxPerTxUsdc, input.maxTotalUsdc) > 0) {
    throw new ApiError(
      "KITE_BUDGET_EXCEEDED",
      "The per-transaction cap cannot exceed the session total.",
    );
  }
}

function assertApprovalSnapshot(database: Database, approvalId: string) {
  const approval = database.approvals.find((item) => item.id === approvalId);
  const analysis = database.analyses.find((item) => item.id === approval?.analysisId);
  if (!approval || !analysis) throw new ApiError("APPROVAL_STALE", "The execution basis no longer exists.");
  if (approval.decision !== "approve") throw new ApiError("APPROVAL_REQUIRED", "Consent is required.");
  if (new Date(approval.expiresAt).getTime() <= Date.now()) {
    throw new ApiError("APPROVAL_EXPIRED", "The approval expired. Nothing can execute.");
  }
  const current = assertAnalysisSnapshotCurrent(analysis, database);
  if (approval.analysisHash !== analysis.inputHash || approval.offerVersion !== current.offer.offerVersion) {
    throw new ApiError("APPROVAL_STALE", "The approval no longer matches the ledger.");
  }
  assertApprovalBasis(analysis, approval.acknowledgedConsequences);
  return { approval, analysis, offer: current.offer, intent: current.intent };
}

async function loadVerifiedApproval(input: {
  approvalId: string;
  requireActiveSession?: boolean;
}): Promise<{
  approval: Approval;
  analysis: Analysis;
  offer: Offer;
  intent: IntentContract;
}> {
  const approval = await getApproval(input.approvalId);
  if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
  const analysis = await getAnalysis(approval.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  await requireWritableHousehold(analysis.householdId);

  if (approval.decision !== "approve") {
    throw new ApiError(
      "APPROVAL_REQUIRED",
      "The latest recorded decision is not an approval. Execution is refused.",
    );
  }
  if (new Date(approval.expiresAt).getTime() < Date.now()) {
    throw new ApiError(
      "APPROVAL_EXPIRED",
      "The approval expired. The household must approve a current analysis again.",
    );
  }
  if (analysis.decision !== "allow") {
    throw new ApiError(
      "HARD_CONSTRAINT_VIOLATION",
      "The analysis did not return ALLOW. Execution is refused.",
    );
  }
  if (analysis.unknowns.length > 0) {
    throw new ApiError(
      "ANALYSIS_INCOMPLETE",
      "Material terms remain unknown. Execution is refused.",
    );
  }
  if (approval.analysisHash !== analysis.inputHash) {
    throw new ApiError(
      "APPROVAL_STALE",
      "The approval no longer matches the analysis. Re-run the analysis and approve again.",
    );
  }

  const current = await assertAnalysisCurrent(analysis);
  if (approval.offerVersion !== current.offer.offerVersion) {
    throw new ApiError(
      "APPROVAL_STALE",
      "The offer version changed after approval. Execution is refused.",
    );
  }

  return { approval, analysis, offer: current.offer, intent: current.intent };
}

function mapSessionStatus(
  status: KiteSessionStatus,
  previous: ExecutionStatus,
): { executionStatus: ExecutionStatus; errorCode: string | null } {
  if (status.status === "session_expired") {
    return { executionStatus: "failed", errorCode: "KITE_SESSION_EXPIRED" };
  }
  if (status.status === "session_exhausted") {
    return { executionStatus: "failed", errorCode: "KITE_SESSION_EXHAUSTED" };
  }
  if (status.active) {
    return {
      executionStatus:
        previous === "succeeded" || previous === "submitted"
          ? previous
          : "authorized",
      errorCode: null,
    };
  }
  if (status.status === "execution_succeeded") {
    return { executionStatus: "succeeded", errorCode: null };
  }
  if (status.status === "execution_failed") {
    return { executionStatus: "failed", errorCode: "KITE_EXECUTION_FAILED" };
  }
  return {
    executionStatus:
      previous === "succeeded" || previous === "submitted"
        ? previous
        : "pending_authorization",
    errorCode: null,
  };
}

export interface StartExecutionInput {
  approvalId: string;
  maxTotalUsdc: string;
  maxPerTxUsdc: string;
}

export async function startExecution(
  input: StartExecutionInput,
): Promise<Execution> {
  assertAmount(input.maxTotalUsdc, "Session total");
  assertAmount(input.maxPerTxUsdc, "Per-transaction cap");
  assertEnvCaps(input);

  const verified = await loadVerifiedApproval({ approvalId: input.approvalId });
  const database = await getDatabase();
  const existing = database.executions.find(
    (execution) =>
      execution.approvalId === input.approvalId &&
      ["pending_authorization", "authorized", "submitted", "succeeded"].includes(
        execution.status,
      ),
  );
  if (existing) {
    throw new ApiError(
      "EXECUTION_ALREADY_SUBMITTED",
      "An execution already exists for this approval. Duplicate execution is refused.",
      { executionId: existing.id, status: existing.status },
    );
  }

  const adapter = getKiteAdapter();
  const request: KiteSessionRequest = await adapter.createSession({
    taskSummary: `trycommit demo checkout — analysis ${verified.analysis.id}`,
    maxTotalUsdc: input.maxTotalUsdc,
    maxPerTxUsdc: input.maxPerTxUsdc,
    ttl: serverConfig.kite.sessionTtl,
    orderId: `order_${verified.analysis.id}`,
  });

  const execution: Execution = {
    id: `exec_${randomUUID()}`,
    analysisId: verified.analysis.id,
    approvalId: verified.approval.id,
    executionMode: isKiteExecutionLive() ? "kite_x402" : "simulated",
    status:
      request.status === "session_active" ? "authorized" : "pending_authorization",
    externalReference: null,
    amountUsdc: input.maxTotalUsdc,
    kiteRequestId: request.requestId,
    kiteSessionId: request.sessionId,
    approvalUrl: request.approvalUrl,
    sessionStatus: request.status,
    providerResponseSummary: {
      sessionSimulated: request.simulated,
      executionMode: isKiteExecutionLive() ? "kite_x402" : "simulated",
      maxPerTxUsdc: input.maxPerTxUsdc,
      note: request.note,
    },
    errorCode: null,
    createdAt: serverNow(),
    updatedAt: serverNow(),
  };

  await mutateDatabase((db) => {
    assertApprovalSnapshot(db, input.approvalId);
    if (db.executions.some((item) => item.approvalId === input.approvalId &&
      ["pending_authorization", "authorized", "submitted", "succeeded"].includes(item.status))) {
      throw new ApiError("EXECUTION_ALREADY_SUBMITTED", "An execution already exists for this approval.");
    }
    db.executions.push(execution);
    appendAudit(db, {
      householdId: verified.analysis.householdId,
      actorType: "agent",
      actorId: verified.approval.approverUserId,
      eventType: "kite.session_requested",
      entityType: "execution",
      entityId: execution.id,
      metadata: {
        analysisId: verified.analysis.id,
        approvalId: verified.approval.id,
        kiteRequestId: execution.kiteRequestId,
        sessionStatus: execution.sessionStatus,
        sessionSimulated: request.simulated,
        executionMode: execution.executionMode,
        maxTotalUsdc: input.maxTotalUsdc,
        maxPerTxUsdc: input.maxPerTxUsdc,
      },
    });
  });

  return execution;
}

export async function refreshExecution(executionId: string): Promise<Execution> {
  const execution = await getExecution(executionId);
  if (!execution) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
  const analysis = await getAnalysis(execution.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const access = await requireHouseholdAccess(analysis.householdId);
  if (!execution.kiteRequestId) {
    throw new ApiError("KITE_SESSION_EXPIRED", "This execution has no Kite session.");
  }

  const adapter = getKiteAdapter();
  const status = await adapter.getSessionStatus(execution.kiteRequestId);

  return mutateDatabase((db) => {
    const stored = db.executions.find((item) => item.id === executionId);
    if (!stored) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
    if (["submitted", "succeeded", "cancelled"].includes(stored.status)) return { ...stored };
    const mapped = mapSessionStatus(status, stored.status);
    const changed =
      stored.status !== mapped.executionStatus ||
      stored.sessionStatus !== status.status;
    stored.status = mapped.executionStatus;
    stored.sessionStatus = status.status;
    stored.kiteSessionId = status.sessionId ?? stored.kiteSessionId;
    stored.approvalUrl = status.approvalUrl ?? stored.approvalUrl;
    stored.errorCode = mapped.errorCode;
    stored.updatedAt = serverNow();
    if (changed) {
      appendAudit(db, {
        householdId: analysis.householdId,
        actorType: "user",
        actorId: access.session.userId,
        eventType: "kite.session_status_refreshed",
        entityType: "execution",
        entityId: executionId,
        metadata: { sessionStatus: status.status, status: stored.status },
      });
    }
    return { ...stored };
  });
}

export async function simulateKiteApproval(
  executionId: string,
): Promise<Execution> {
  const execution = await getExecution(executionId);
  if (!execution) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
  const analysis = await getAnalysis(execution.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const access = await requireWritableHousehold(analysis.householdId);
  const adapter = getKiteAdapter();
  if (!(adapter instanceof KiteMockAdapter)) {
    throw new ApiError(
      "VALIDATION_FAILED",
      "This deployment uses a real Kite session. Approve it with your Passport passkey, then refresh the status.",
    );
  }
  if (!execution.kiteRequestId) {
    throw new ApiError("KITE_SESSION_EXPIRED", "This execution has no Kite session.");
  }
  if (["submitted", "succeeded", "cancelled"].includes(execution.status)) {
    throw new ApiError("EXECUTION_ALREADY_SUBMITTED", "A completed or cancelled execution cannot be reauthorized.");
  }
  const status = await adapter.simulateApproval(execution.kiteRequestId);

  return mutateDatabase((db) => {
    const stored = db.executions.find((item) => item.id === executionId);
    if (!stored) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
    if (["submitted", "succeeded", "cancelled"].includes(stored.status)) {
      throw new ApiError("EXECUTION_ALREADY_SUBMITTED", "This execution cannot be reauthorized.");
    }
    stored.status = status.active ? "authorized" : "failed";
    stored.sessionStatus = status.status;
    stored.updatedAt = serverNow();
    appendAudit(db, {
      householdId: analysis.householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: "kite.simulated_approval",
      entityType: "execution",
      entityId: executionId,
      metadata: {
        sessionStatus: status.status,
        simulated: true,
        note: status.note,
      },
    });
    return { ...stored };
  });
}

export async function executeApprovedPayment(
  executionId: string,
): Promise<{ execution: Execution; receipt: DecisionReceipt | null }> {
  const execution = await getExecution(executionId);
  if (!execution) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
  const verified = await loadVerifiedApproval({ approvalId: execution.approvalId });
  if (
    execution.status === "succeeded" ||
    execution.status === "submitted" ||
    execution.externalReference
  ) {
    throw new ApiError(
      "EXECUTION_ALREADY_SUBMITTED",
      "This execution has already been submitted. Duplicate execution is refused.",
      { executionId: execution.id, status: execution.status },
    );
  }
  if (!execution.kiteRequestId) {
    throw new ApiError("KITE_SESSION_EXPIRED", "This execution has no Kite session.");
  }

  const adapter = getKiteAdapter();
  const refreshed = await refreshExecution(executionId);
  if (refreshed.status === "failed" && refreshed.sessionStatus === "session_expired") {
    throw new ApiError(
      "KITE_SESSION_EXPIRED",
      "The Kite session expired. Nothing was executed.",
    );
  }
  if (refreshed.status !== "authorized") {
    throw new ApiError(
      "KITE_SESSION_PENDING",
      "The Kite session is not active. Approve it first; nothing was executed.",
    );
  }

  const sessionCap = refreshed.amountUsdc ?? serverConfig.kite.maxTotalUsdc;
  const amount = minUsdcAmount(
    sessionCap,
    serverConfig.kite.maxTotalUsdc,
  );
  assertAmount(amount, "Execution amount");

  // Reserve the submission atomically before calling the adapter. Competing
  // requests see submitted and fail; a timeout leaves an unknown/pending state,
  // never a claimed success or an automatically retried payment.
  const reserved = await mutateDatabase((db) => {
    const stored = db.executions.find((item) => item.id === executionId);
    if (!stored) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
    if (stored.status !== "authorized" || stored.externalReference) {
      throw new ApiError("EXECUTION_ALREADY_SUBMITTED", "Execution is no longer available for submission.");
    }
    const current = assertApprovalSnapshot(db, stored.approvalId);
    stored.status = "submitted";
    stored.updatedAt = serverNow();
    return current;
  });

  let result: KiteExecutionResult;
  try {
    result = await adapter.executePaidRequest({
      requestId: execution.kiteRequestId,
      sessionId: refreshed.kiteSessionId,
      url: serverConfig.kite.checkoutUrl || "https://demo.invalid/trycommit-checkout",
      method: "POST",
      body: {
        orderId: `order_${reserved.analysis.id}`,
        analysisId: reserved.analysis.id,
        approvalId: reserved.approval.id,
      },
      maxAmountUsdc: amount,
      idempotencyKey: refreshed.id,
    });
  } catch {
    throw new ApiError("KITE_EXECUTION_FAILED", "The adapter did not confirm an outcome. Execution remains submitted/unknown; do not resubmit. No payment success is claimed.");
  }

  return mutateDatabase((db) => {
    const stored = db.executions.find((item) => item.id === executionId);
    const storedAnalysis = db.analyses.find(
      (item) => item.id === verified.analysis.id,
    );
    const storedApproval = db.approvals.find(
      (item) => item.id === verified.approval.id,
    );
    if (!stored || !storedAnalysis || !storedApproval) {
      throw new ApiError("NOT_FOUND", "Execution inputs not found.");
    }

    stored.status =
      result.status === "succeeded"
        ? "succeeded"
        : result.status === "pending"
          ? "submitted"
          : "failed";
    stored.externalReference = result.externalReference;
    stored.amountUsdc = result.amountUsdc ?? stored.amountUsdc;
    stored.providerResponseSummary = {
      ...(result.responseSummary ?? {}),
      simulated: result.simulated,
      providerActivation: result.providerActivation,
      note: result.note,
    };
    stored.errorCode = result.errorCode;
    stored.kiteSessionId =
      refreshed.kiteSessionId ?? stored.kiteSessionId;
    stored.approvalUrl = refreshed.approvalUrl ?? stored.approvalUrl;
    stored.sessionStatus = refreshed.sessionStatus;
    stored.updatedAt = serverNow();

    const receipt = appendReceipt(db, {
      analysis: storedAnalysis,
      intent: reserved.intent,
      offer: reserved.offer,
      approval: storedApproval,
      execution: stored,
      stage: "execution",
      actorUserId: storedApproval.approverUserId,
    });

    appendAudit(db, {
      householdId: storedAnalysis.householdId,
      actorType: "agent",
      actorId: storedApproval.approverUserId,
      eventType:
        stored.status === "succeeded"
          ? "execution.succeeded"
          : stored.status === "submitted"
            ? "execution.submitted"
            : "execution.failed",
      entityType: "execution",
      entityId: stored.id,
      metadata: {
        simulated: result.simulated,
        executionMode: stored.executionMode,
        externalReference: stored.externalReference,
        providerActivation: result.providerActivation,
        receiptId: receipt.id,
        errorCode: stored.errorCode,
      },
    });

    return { execution: { ...stored }, receipt };
  });
}

export async function cancelExecution(executionId: string): Promise<Execution> {
  const execution = await getExecution(executionId);
  if (!execution) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
  const analysis = await getAnalysis(execution.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const access = await requireWritableHousehold(analysis.householdId);
  if (["submitted", "succeeded"].includes(execution.status)) {
    throw new ApiError(
      "EXECUTION_ALREADY_SUBMITTED",
      "A submitted or succeeded execution cannot be cancelled.",
    );
  }
  return mutateDatabase((db) => {
    const stored = db.executions.find((item) => item.id === executionId);
    if (!stored) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
    stored.status = "cancelled";
    stored.updatedAt = serverNow();
    appendAudit(db, {
      householdId: analysis.householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: "execution.cancelled",
      entityType: "execution",
      entityId: executionId,
      metadata: { simulated: stored.executionMode === "simulated" },
    });
    return { ...stored };
  });
}

export async function getKiteStatus(): Promise<KiteStatus> {
  return getKiteAdapter().getStatus();
}

export interface ExecutionBundle {
  execution: Execution;
  analysis: Analysis;
  approval: Approval;
  receipts: DecisionReceipt[];
}

export async function getExecutionBundle(
  executionId: string,
  access?: HouseholdAccess,
): Promise<ExecutionBundle> {
  const execution = await getExecution(executionId);
  if (!execution) throw new ApiError("EXECUTION_NOT_FOUND", "Execution not found.");
  const analysis = await getAnalysis(execution.analysisId);
  if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
  const approval = await getApproval(execution.approvalId);
  if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
  await (access
    ? Promise.resolve(access)
    : requireHouseholdAccess(analysis.householdId));
  const database = await getDatabase();
  return {
    execution,
    analysis,
    approval,
    receipts: database.receipts
      .filter((receipt) => receipt.analysisId === analysis.id)
      .sort((left, right) => left.receiptVersion - right.receiptVersion),
  };
}

export async function latestExecutionForApproval(
  approvalId: string,
): Promise<Execution | null> {
  const database = await getDatabase();
  return (
    database.executions
      .filter((execution) => execution.approvalId === approvalId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ??
    null
  );
}

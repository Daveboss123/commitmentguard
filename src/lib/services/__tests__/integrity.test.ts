import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntentContract } from "@/lib/domain/types";
import { getDatabase, mutateDatabase, resetDatabase } from "@/lib/store/database";
import { createAnalysis } from "@/lib/services/analysis.service";
import { createApproval } from "@/lib/services/approval.service";
import {
  executeApprovedPayment,
  simulateKiteApproval,
  startExecution,
} from "@/lib/services/execution.service";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { serverConfig } from "@/lib/app/config";
import { policy } from "@/lib/fixtures/demo";

/**
 * Execution-path integrity tests. `workflow.test.ts` covers the happy path and
 * the consent-time bindings; this suite repeats the reviewer's seven checks at
 * the point where money would actually move, and proves that every refusal
 * leaves no execution and no execution receipt behind.
 */
vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({
    userId: "user_demo_owner",
    householdId: "hh_morgan_demo",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60 * 60 * 1000,
  }),
}));

const HOUSEHOLD_ID = "hh_morgan_demo";
const INTENT_ID = "intent_integrity_test";

const confirmedIntent: IntentContract = {
  id: INTENT_ID,
  householdId: HOUSEHOLD_ID,
  policyId: policy.id,
  version: 1,
  originalRequest:
    "Switch broadband, keep the family mobile bundle discount, avoid contracts over 12 months and save at least $10 a month.",
  goal: "Lower the household broadband cost without losing the mobile bundle discount.",
  serviceTypes: ["broadband"],
  currency: "USD",
  minimumMonthlySavingMinor: policy.minimumMonthlySavingMinor,
  maxContractMonths: policy.maxContractMonths,
  mustKeepBenefits: policy.mustKeepBenefits,
  mustHave: policy.mustHave,
  mustNotHave: policy.mustNotHave,
  softPreferences: policy.softPreferences,
  approvalRequiredFor: policy.approvalRequiredFor,
  unknownCriticalTermsPolicy: policy.unknownCriticalTermsPolicy,
  ambiguities: [],
  extractionModel: "test-fixture",
  extractionSource: "demo_parser",
  servRequestId: null,
  servLatencyMs: null,
  userConfirmedAt: "2026-11-01T09:00:00.000Z",
  createdAt: "2026-11-01T09:00:00.000Z",
};

async function approveCompliantOffer() {
  const created = await createAnalysis({
    householdId: HOUSEHOLD_ID,
    intentId: INTENT_ID,
    offerId: "offer_harborlink_b",
  });
  expect(created.analysis.decision).toBe("allow");
  const acknowledgedConsequences = created.analysis.consequences
    .filter((item) => item.severity === "critical" || item.severity === "high")
    .map((item) => item.id);
  const approval = await createApproval({
    analysisId: created.analysis.id,
    decision: "approve",
    acknowledgedConsequences,
    approverRole: "owner",
  });
  return { created, approval };
}

function startCappedExecution(approvalId: string) {
  return startExecution({
    approvalId,
    maxTotalUsdc: serverConfig.kite.maxTotalUsdc,
    maxPerTxUsdc: serverConfig.kite.maxPerTxUsdc,
  });
}

async function authorizedExecution() {
  const { approval } = await approveCompliantOffer();
  const execution = await startCappedExecution(approval.approval.id);
  await simulateKiteApproval(execution.id);
  return { approval, execution };
}

beforeEach(async () => {
  await resetDatabase();
  await mutateDatabase((database) => {
    database.intents.push(structuredClone(confirmedIntent));
  });
});

describe("deterministic engine input boundary", () => {
  it("refuses to run an analysis on an unconfirmed SERV draft", async () => {
    await mutateDatabase((database) => {
      const stored = database.intents.find((item) => item.id === INTENT_ID);
      if (!stored) throw new Error("intent missing");
      stored.userConfirmedAt = null;
    });

    await expect(
      createAnalysis({
        householdId: HOUSEHOLD_ID,
        intentId: INTENT_ID,
        offerId: "offer_harborlink_b",
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_INCOMPLETE" });

    expect(
      (await getDatabase()).analyses.some(
        (item) => item.intentContractId === INTENT_ID,
      ),
    ).toBe(false);
  });
});

describe("approval invalidation on offer change", () => {
  it("records the offer version at consent and refuses execution after the offer moves on", async () => {
    const { created, approval } = await approveCompliantOffer();
    const before = await getDatabase();
    const originalVersion =
      before.offers.find((item) => item.id === created.analysis.offerId)
        ?.offerVersion ?? 0;

    expect(approval.approval.offerVersion).toBe(originalVersion);

    await mutateDatabase((database) => {
      const offer = database.offers.find(
        (item) => item.id === created.analysis.offerId,
      );
      if (!offer) throw new Error("offer missing");
      offer.offerVersion = originalVersion + 1;
      offer.updatedAt = new Date().toISOString();
    });

    await expect(
      startCappedExecution(approval.approval.id),
    ).rejects.toMatchObject({ code: "APPROVAL_STALE" });

    const after = await getDatabase();
    expect(
      after.executions.filter(
        (item) => item.approvalId === approval.approval.id,
      ),
    ).toHaveLength(0);
    expect(
      after.receipts.filter(
        (item) => item.receiptPayload.stage === "execution",
      ),
    ).toHaveLength(0);
  });

  it("refuses execution once the 24-hour approval window has closed", async () => {
    const { created, approval } = await approveCompliantOffer();

    await mutateDatabase((database) => {
      const stored = database.approvals.find(
        (item) => item.id === approval.approval.id,
      );
      if (!stored) throw new Error("approval missing");
      stored.expiresAt = new Date(Date.now() - 1_000).toISOString();
    });

    await expect(
      startCappedExecution(approval.approval.id),
    ).rejects.toMatchObject({ code: "APPROVAL_EXPIRED" });

    const after = await getDatabase();
    expect(
      after.executions.filter(
        (item) => item.approvalId === approval.approval.id,
      ),
    ).toHaveLength(0);
    expect(created.analysis.decision).toBe("allow");
  });
});

describe("kite session limits, expiry and duplicate protection", () => {
  it("refuses a session or per-transaction request above the server cap", async () => {
    const { approval } = await approveCompliantOffer();

    await expect(
      startExecution({
        approvalId: approval.approval.id,
        maxTotalUsdc: "0.10",
        maxPerTxUsdc: "0.05",
      }),
    ).rejects.toMatchObject({ code: "KITE_BUDGET_EXCEEDED" });

    await expect(
      startExecution({
        approvalId: approval.approval.id,
        maxTotalUsdc: "0.05",
        maxPerTxUsdc: "0.10",
      }),
    ).rejects.toMatchObject({ code: "KITE_BUDGET_EXCEEDED" });

    await expect(
      startExecution({
        approvalId: approval.approval.id,
        maxTotalUsdc: "0.05",
        maxPerTxUsdc: "0.06",
      }),
    ).rejects.toMatchObject({ code: "KITE_BUDGET_EXCEEDED" });

    expect((await getDatabase()).executions).toHaveLength(0);
  });

  it("refuses to execute after the simulated Kite session expired", async () => {
    const { execution } = await authorizedExecution();

    await mutateDatabase((database) => {
      const session = database.simulatedKiteSessions?.find(
        (item) => item.requestId === execution.kiteRequestId,
      );
      if (!session) throw new Error("simulated session missing");
      session.expiresAt = new Date(Date.now() - 1_000).toISOString();
    });

    await expect(executeApprovedPayment(execution.id)).rejects.toMatchObject({
      code: "KITE_SESSION_EXPIRED",
    });

    const after = await getDatabase();
    const stored = after.executions.find((item) => item.id === execution.id);
    expect(stored).toMatchObject({
      status: "failed",
      sessionStatus: "session_expired",
      errorCode: "KITE_SESSION_EXPIRED",
      externalReference: null,
    });
    expect(
      after.receipts.filter(
        (item) =>
          item.analysisId === execution.analysisId &&
          item.receiptPayload.stage === "execution",
      ),
    ).toHaveLength(0);
  });

  it("refuses an amount above the session's own cap at the adapter boundary", async () => {
    const { execution } = await authorizedExecution();

    await mutateDatabase((database) => {
      const session = database.simulatedKiteSessions?.find(
        (item) => item.requestId === execution.kiteRequestId,
      );
      if (!session) throw new Error("simulated session missing");
      session.maxTotalUsdc = "0.01";
      session.maxPerTxUsdc = "0.01";
    });

    const result = await executeApprovedPayment(execution.id);

    expect(result.execution).toMatchObject({
      status: "failed",
      errorCode: "KITE_BUDGET_EXCEEDED",
      externalReference: null,
      executionMode: "simulated",
    });
    expect(result.receipt?.receiptPayload.execution).toMatchObject({
      simulated: true,
      paymentSucceeded: false,
      providerActivation: "not_integrated",
    });
  });

  it("submits the same payment once and rejects every repeat", async () => {
    const { approval, execution } = await authorizedExecution();
    const first = await executeApprovedPayment(execution.id);
    expect(first.execution.status).toBe("succeeded");
    expect(first.execution.externalReference).toMatch(/^SIMULATED-KITE-/);

    await expect(executeApprovedPayment(execution.id)).rejects.toMatchObject({
      code: "EXECUTION_ALREADY_SUBMITTED",
    });
    await expect(
      startCappedExecution(approval.approval.id),
    ).rejects.toMatchObject({ code: "EXECUTION_ALREADY_SUBMITTED" });

    const after = await getDatabase();
    expect(
      after.receipts.filter(
        (item) =>
          item.analysisId === execution.analysisId &&
          item.receiptPayload.stage === "execution",
      ),
    ).toHaveLength(1);
  });
});

describe("receipt contents and chain relationships", () => {
  it("verifies a three-stage chain and fails when a middle receipt is altered", async () => {
    const { execution } = await authorizedExecution();
    const completed = await executeApprovedPayment(execution.id);
    expect(completed.receipt).not.toBeNull();

    const database = await getDatabase();
    const receipts = database.receipts
      .filter((item) => item.analysisId === execution.analysisId)
      .sort((left, right) => left.receiptVersion - right.receiptVersion);

    expect(receipts.map((item) => item.receiptPayload.stage)).toEqual([
      "analysis",
      "approval",
      "execution",
    ]);
    expect(receipts.map((item) => item.receiptVersion)).toEqual([1, 2, 3]);

    expect(verifyReceipt(database, completed.receipt!)).toMatchObject({
      verified: true,
      formatValid: true,
      linkedAnalysisValid: true,
      stageOrderValid: true,
      chainValid: true,
      previousReceiptFound: true,
    });

    const middle = receipts[1];
    const originalStage = middle.receiptPayload.stage;
    middle.receiptPayload.stage = "tampered";

    const tampered = verifyReceipt(database, completed.receipt!);
    expect(tampered.chainValid).toBe(false);
    expect(tampered.stageOrderValid).toBe(false);
    expect(tampered.verified).toBe(false);
    expect(verifyReceipt(database, middle)).toMatchObject({
      valid: false,
      verified: false,
    });

    middle.receiptPayload.stage = originalStage;
    expect(verifyReceipt(database, completed.receipt!).verified).toBe(true);
  });

  it("rejects a receipt that only has a hash-shaped value", async () => {
    const { created } = await approveCompliantOffer();
    const database = await getDatabase();
    const genuine = database.receipts.find(
      (item) => item.id === created.receipt.id,
    );
    if (!genuine) throw new Error("analysis receipt missing");

    const forged = structuredClone(genuine);
    forged.id = "rcpt_forged";
    forged.contentHash = "a".repeat(64);
    forged.previousReceiptHash = null;
    forged.receiptPayload.decision = "allow";
    forged.receiptPayload.totals = {
      ...(genuine.receiptPayload.totals as Record<string, unknown>),
      proposedTco12Minor: 1,
    };

    const verification = verifyReceipt(database, forged);
    expect(verification.storedHash).toBe("a".repeat(64));
    expect(verification.computedHash).not.toBe(verification.storedHash);
    expect(verification.valid).toBe(false);
    expect(verification.verified).toBe(false);
  });
});

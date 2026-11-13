import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntentContract } from "@/lib/domain/types";
import { mutateDatabase, getDatabase, resetDatabase } from "@/lib/store/database";
import { createAnalysis, runAnalysisScenario } from "@/lib/services/analysis.service";
import { createApproval, assertApprovalBasis } from "@/lib/services/approval.service";
import {
  executeApprovedPayment,
  simulateKiteApproval,
  startExecution,
} from "@/lib/services/execution.service";
import { appendReceipt, verifyReceipt } from "@/lib/services/receipt.service";
import { serverConfig } from "@/lib/app/config";
import { policy } from "@/lib/fixtures/demo";

import { ApiError } from "@/lib/http/errors";
import { KiteMockAdapter } from "@/lib/integrations/kite/mock";

/**
 * The services call `requireSession()` to resolve the acting member. In these
 * tests the cookie flow is replaced by a fixed demo owner; the household and
 * membership still come from the real seeded repository.
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
const INTENT_ID = "intent_test_switch";

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

async function seedIntent(): Promise<void> {
  await mutateDatabase((database) => {
    database.intents.push(structuredClone(confirmedIntent));
  });
}

async function analyse(offerId: string) {
  return createAnalysis({
    householdId: HOUSEHOLD_ID,
    intentId: INTENT_ID,
    offerId,
  });
}

function materialIds(analysis: Awaited<ReturnType<typeof analyse>>["analysis"]) {
  return analysis.consequences
    .filter((item) => item.severity === "critical" || item.severity === "high")
    .map((item) => item.id);
}

async function approveCompliantOffer() {
  const created = await analyse("offer_harborlink_b");
  expect(created.analysis.decision).toBe("allow");
  const approval = await createApproval({
    analysisId: created.analysis.id,
    decision: "approve",
    acknowledgedConsequences: materialIds(created.analysis),
    approverRole: "owner",
  });
  return { created, approval };
}

beforeEach(async () => {
  await resetDatabase();
  await seedIntent();
});

describe("consent approval service", () => {
  it("refuses to approve a blocked analysis and records a chain-linked receipt for a compliant one", async () => {
    const blocked = await analyse("offer_brightwave_a");
    expect(blocked.analysis.decision).toBe("block");

    await expect(
      createApproval({
        analysisId: blocked.analysis.id,
        decision: "approve",
        acknowledgedConsequences: [],
        approverRole: "owner",
      }),
    ).rejects.toMatchObject({ code: "HARD_CONSTRAINT_VIOLATION" });

    const allowed = await analyse("offer_harborlink_b");
    expect(allowed.analysis.decision).toBe("allow");
    expect(materialIds(allowed.analysis)).toHaveLength(0);

    const result = await createApproval({
      analysisId: allowed.analysis.id,
      decision: "approve",
      acknowledgedConsequences: [],
      approverRole: "owner",
    });

    expect(result.approval.analysisHash).toBe(allowed.analysis.inputHash);
    expect(result.approval.offerVersion).toBe(allowed.analysis.offerVersion);
    expect(result.approval.decision).toBe("approve");
    expect(result.receipt?.receiptPayload.stage).toBe("approval");
    expect(result.receipt?.previousReceiptHash).toBe(
      allowed.receipt.contentHash,
    );
    expect(
      new Date(result.approval.expiresAt).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  it("refuses approval once the offer version changes", async () => {
    const created = await analyse("offer_harborlink_b");

    await mutateDatabase((database) => {
      const offer = database.offers.find(
        (item) => item.id === created.analysis.offerId,
      );
      if (!offer) throw new Error("offer missing");
      offer.offerVersion += 1;
    });

    await expect(
      createApproval({
        analysisId: created.analysis.id,
        decision: "approve",
        acknowledgedConsequences: materialIds(created.analysis),
        approverRole: "owner",
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_STALE" });
  });

  it("returns the existing approval instead of minting a duplicate", async () => {
    const { created, approval } = await approveCompliantOffer();

    const second = await createApproval({
      analysisId: created.analysis.id,
      decision: "approve",
      acknowledgedConsequences: materialIds(created.analysis),
      approverRole: "owner",
    });

    expect(second.approval.id).toBe(approval.approval.id);
    expect(second.receipt).toBeNull();
  });
});

describe("approval basis gate", () => {
  const baseEvidence = {
    total: 1,
    valid: 1,
    invalidEvidenceIds: [],
    contradictedEvidenceIds: [],
    byId: {} as Record<string, never>,
  };

  const highConsequence = {
    id: "cons_high_upload",
    analysisId: "analysis_synthetic",
    category: "reversibility" as const,
    severity: "high" as const,
    title: "Synthetic high consequence",
    description: "A material effect the household must see before consenting.",
    direction: "loss" as const,
    evidenceIds: [],
    calculation: null,
    status: "confirmed" as const,
  };

  it("accepts an allowed basis with every high consequence acknowledged", () => {
    const required = assertApprovalBasis(
      {
        decision: "allow",
        unknowns: [],
        evidenceValidation: baseEvidence,
        consequences: [highConsequence],
      },
      ["cons_high_upload"],
    );
    expect(required).toEqual(["cons_high_upload"]);
  });

  it("refuses review and unknowns before the acknowledgement gate", () => {
    expect(() =>
      assertApprovalBasis(
        {
          decision: "review",
          unknowns: [],
          evidenceValidation: baseEvidence,
          consequences: [],
        },
        [],
      ),
    ).toThrow(ApiError);

    expect(() =>
      assertApprovalBasis(
        {
          decision: "allow",
          unknowns: ["The monthly price after the promotion is unknown"],
          evidenceValidation: baseEvidence,
          consequences: [],
        },
        [],
      ),
    ).toThrow(ApiError);
  });

  it("refuses invalid evidence and missing acknowledgements", () => {
    expect(() =>
      assertApprovalBasis(
        {
          decision: "allow",
          unknowns: [],
          evidenceValidation: {
            ...baseEvidence,
            invalidEvidenceIds: ["ev_missing"],
          },
          consequences: [],
        },
        [],
      ),
    ).toThrow(ApiError);

    expect(
      () =>
        assertApprovalBasis(
          {
            decision: "allow",
            unknowns: [],
            evidenceValidation: baseEvidence,
            consequences: [highConsequence],
          },
          [],
        ),
    ).toThrow(/explicitly acknowledged/);
  });
});

describe("kite payment execution", () => {
  it("allows only one adapter call when two execute requests race", async () => {
    const { approval } = await approveCompliantOffer();
    const execution = await startExecution({
      approvalId: approval.approval.id,
      maxTotalUsdc: "0.05",
      maxPerTxUsdc: "0.05",
    });
    await simulateKiteApproval(execution.id);
    const spy = vi.spyOn(KiteMockAdapter.prototype, "executePaidRequest");
    try {
      const results = await Promise.allSettled([
        executeApprovedPayment(execution.id), executeApprovedPayment(execution.id),
      ]);
      expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect((await getDatabase()).receipts.filter((item) => item.receiptPayload.stage === "execution")).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("retains submitted/unknown state after an adapter exception without retrying", async () => {
    const { approval } = await approveCompliantOffer();
    const execution = await startExecution({
      approvalId: approval.approval.id,
      maxTotalUsdc: "0.05",
      maxPerTxUsdc: "0.05",
    });
    await simulateKiteApproval(execution.id);
    const spy = vi.spyOn(KiteMockAdapter.prototype, "executePaidRequest")
      .mockRejectedValueOnce(new Error("Timeout; outcome unknown"));
    try {
      await expect(executeApprovedPayment(execution.id)).rejects.toThrow();
      expect((await getDatabase()).executions.find((item) => item.id === execution.id)?.status).toBe("submitted");
      await expect(executeApprovedPayment(execution.id)).rejects.toMatchObject({ code: "EXECUTION_ALREADY_SUBMITTED" });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("enforces caps, requires approval, and refuses a duplicate execution", async () => {
    const { approval } = await approveCompliantOffer();
    const { maxTotalUsdc, maxPerTxUsdc } = serverConfig.kite;

    await expect(
      startExecution({
        approvalId: approval.approval.id,
        maxTotalUsdc: "0.10",
        maxPerTxUsdc,
      }),
    ).rejects.toMatchObject({ code: "KITE_BUDGET_EXCEEDED" });

    const execution = await startExecution({
      approvalId: approval.approval.id,
      maxTotalUsdc,
      maxPerTxUsdc,
    });

    expect(execution.status).toBe("pending_authorization");
    expect(execution.executionMode).toBe("simulated");
    expect(execution.providerResponseSummary?.sessionSimulated).toBe(true);
    expect(execution.approvalUrl).toBeNull();

    await expect(
      startExecution({
        approvalId: approval.approval.id,
        maxTotalUsdc,
        maxPerTxUsdc,
      }),
    ).rejects.toMatchObject({ code: "EXECUTION_ALREADY_SUBMITTED" });

    await expect(executeApprovedPayment(execution.id)).rejects.toMatchObject({
      code: "KITE_SESSION_PENDING",
    });

    const authorized = await simulateKiteApproval(execution.id);
    expect(authorized.status).toBe("authorized");

    const completed = await executeApprovedPayment(execution.id);
    expect(completed.execution.status).toBe("succeeded");
    expect(completed.execution.externalReference).toMatch(/^SIMULATED-KITE-/);
    expect(completed.execution.providerResponseSummary?.providerActivation).toBe(
      "not_integrated",
    );
    expect(completed.receipt?.receiptPayload.stage).toBe("execution");
    expect(completed.receipt?.receiptPayload.execution).toMatchObject({
      simulated: true,
      paymentSucceeded: true,
      providerActivation: "not_integrated",
    });

    await expect(executeApprovedPayment(execution.id)).rejects.toMatchObject({
      code: "EXECUTION_ALREADY_SUBMITTED",
    });
  });

  it("refuses to execute after the approval itself is rejected", async () => {
    const { created, approval } = await approveCompliantOffer();
    const database = await getDatabase();
    const stored = database.approvals.find(
      (item) => item.id === approval.approval.id,
    );
    if (!stored) throw new Error("approval missing");
    stored.decision = "reject";

    await expect(
      startExecution({
        approvalId: approval.approval.id,
        maxTotalUsdc: serverConfig.kite.maxTotalUsdc,
        maxPerTxUsdc: serverConfig.kite.maxPerTxUsdc,
      }),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });

    expect(created.analysis.decision).toBe("allow");
  });
});

describe("scenario sandbox", () => {
  it("re-runs the engine without persisting anything", async () => {
    const created = await analyse("offer_brightwave_a");
    expect(created.analysis.decision).toBe("block");
    const before = await getDatabase();
    const analysisCount = before.analyses.length;
    const receiptCount = before.receipts.length;

    const evaluation = await runAnalysisScenario(created.analysis.id, {
      maxContractMonths: 24,
      retainFamilyDiscount: true,
    });

    expect(evaluation.notPersisted).toBe(true);
    expect(evaluation.base.decision).toBe("block");
    expect(evaluation.appliedOverrides.map((item) => item.field)).toEqual([
      "maxContractMonths",
      "familyBundleDiscountRetained",
    ]);
    // Relaxing the term limit removes that blocker...
    expect(evaluation.base.reasonCodes).toContain("MAX_CONTRACT_MONTHS");
    expect(evaluation.scenario.reasonCodes).not.toContain("MAX_CONTRACT_MONTHS");
    // ...but an explicit document exclusion wins over a hypothetical retention
    // flag, and the minimum-saving target still governs.
    expect(evaluation.retentionLockedByExclusion).toBe(true);
    expect(evaluation.scenario.reasonCodes).toContain("BENEFIT_NOT_RETAINED");
    expect(evaluation.scenario.decision).toBe("block");

    const after = await getDatabase();
    expect(after.analyses.length).toBe(analysisCount);
    expect(after.receipts.length).toBe(receiptCount);
  });

  it("can turn an allowed offer into a blocked one by tightening a limit", async () => {
    const created = await analyse("offer_harborlink_b");
    expect(created.analysis.decision).toBe("allow");
    const before = await getDatabase();
    const counts = [before.analyses.length, before.receipts.length];

    const evaluation = await runAnalysisScenario(created.analysis.id, {
      minimumMonthlySavingMinor: 1_500,
    });

    expect(evaluation.scenario.decision).toBe("block");
    expect(evaluation.scenario.reasonCodes).toContain("MINIMUM_SAVING_NOT_MET");
    expect(evaluation.base.decision).toBe("allow");
    const after = await getDatabase();
    expect([after.analyses.length, after.receipts.length]).toEqual(counts);
  });
});

describe("decision receipts", () => {
  it("verifies the content hash and links each receipt to the previous one", async () => {
    const created = await analyse("offer_harborlink_b");
    const second = await mutateDatabase((database) =>
      appendReceipt(database, {
        analysis: created.analysis,
        intent: structuredClone(confirmedIntent),
        offer:
          database.offers.find(
            (item) => item.id === created.analysis.offerId,
          ) ?? null,
        stage: "approval",
        actorUserId: "user_demo_owner",
      }),
    );

    expect(second.previousReceiptHash).toBe(created.receipt.contentHash);

    const database = await getDatabase();
    const firstVerification = verifyReceipt(database, created.receipt);
    const secondVerification = verifyReceipt(database, second);

    expect(firstVerification.valid).toBe(true);
    expect(firstVerification.chainValid).toBeNull();
    expect(secondVerification.valid).toBe(true);
    expect(secondVerification.chainValid).toBe(true);
    expect(secondVerification.previousReceiptFound).toBe(true);
    expect(secondVerification.verified).toBe(true);
    expect(secondVerification.stageOrderValid).toBe(true);
  });

  it("rejects an approval whose analysis receipt exists but is not in its ancestry", async () => {
    const created = await analyse("offer_harborlink_b");
    const database = await getDatabase();
    const second = appendReceipt(database, {
      analysis: created.analysis,
      intent: confirmedIntent,
      offer: database.offers.find((item) => item.id === created.analysis.offerId) ?? null,
      stage: "approval",
      actorUserId: "user_demo_owner",
    });
    second.previousReceiptHash = null;
    expect(verifyReceipt(database, second).valid).toBe(true);
    expect(verifyReceipt(database, second).stageOrderValid).toBe(false);
    expect(verifyReceipt(database, second).verified).toBe(false);
  });

  it("recomputes the preceding payload rather than trusting its stored hash", async () => {
    const created = await analyse("offer_harborlink_b");
    const database = await getDatabase();
    const second = appendReceipt(database, {
      analysis: created.analysis,
      intent: confirmedIntent,
      offer: database.offers.find((item) => item.id === created.analysis.offerId) ?? null,
      stage: "approval",
      actorUserId: "user_demo_owner",
    });
    created.receipt.receiptPayload.stage = "tampered";
    expect(verifyReceipt(database, second).chainValid).toBe(false);
    expect(verifyReceipt(database, second).verified).toBe(false);
  });

  it("marks a tampered payload as invalid even when the stored hash is untouched", async () => {
    const created = await analyse("offer_harborlink_b");
    const database = await getDatabase();
    const stored = database.receipts.find(
      (item) => item.id === created.receipt.id,
    );
    if (!stored) throw new Error("receipt missing");

    const originalStage = stored.receiptPayload.stage;
    stored.receiptPayload.stage = "tampered";

    const verification = verifyReceipt(database, stored);
    expect(verification.valid).toBe(false);
    expect(verification.computedHash).not.toBe(verification.storedHash);

    stored.receiptPayload.stage = originalStage;
    expect(verifyReceipt(database, stored).valid).toBe(true);
  });
});

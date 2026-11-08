import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Commitment } from "@/lib/domain/types";
import { CommitmentInputSchema } from "@/lib/domain/schemas";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import {
  appendAudit,
  getBenefits,
  getCommitments,
  getDependencies,
  requireHouseholdAccess,
  requireWritableHousehold,
} from "@/lib/store/repository";
import { buildUserEvidence } from "@/lib/server/commitment-evidence";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireHouseholdAccess(id);
    const [commitments, benefits, dependencies] = await Promise.all([
      getCommitments(id),
      getBenefits(id),
      getDependencies(id),
    ]);
    return jsonResponse({ commitments, benefits, dependencies });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const access = await requireWritableHousehold(id);
    const input = await readJson(request, CommitmentInputSchema);
    const now = serverNow();
    const commitmentId = `cm_${randomUUID()}`;

    const evidence = [
      buildUserEvidence({
        commitmentId,
        field: "recurringChargeMinor",
        label: "Recurring charge",
        value: input.recurringChargeMinor,
        quote: `Household entered a recurring charge of ${input.currency} ${(
          input.recurringChargeMinor / 100
        ).toFixed(2)} per ${input.billingPeriod}.`,
      }),
      buildUserEvidence({
        commitmentId,
        field: "minimumTermMonths",
        label: "Minimum term",
        value: input.minimumTermMonths,
        quote: `Household entered a minimum term of ${input.minimumTermMonths} months.`,
      }),
      buildUserEvidence({
        commitmentId,
        field: "cancellationFeeMinor",
        label: "Cancellation fee",
        value: input.cancellationFeeMinor,
        quote:
          input.cancellationFeeMinor === null
            ? "Household did not state a cancellation fee."
            : `Household entered a cancellation fee of ${(
                input.cancellationFeeMinor / 100
              ).toFixed(2)}.`,
      }),
    ];

    const commitment: Commitment = {
      id: commitmentId,
      householdId: id,
      providerName: input.providerName,
      serviceType: input.serviceType,
      planName: input.planName,
      currency: input.currency,
      recurringChargeMinor: input.recurringChargeMinor,
      billingPeriod: input.billingPeriod,
      contractStart: input.contractStart,
      contractEnd: input.contractEnd,
      minimumTermMonths: input.minimumTermMonths,
      renewalType: input.renewalType,
      promoEndDate: input.promoEndDate,
      standardChargeMinor: input.standardChargeMinor,
      cancellationFeeMinor: input.cancellationFeeMinor,
      equipmentMonthlyFeeMinor: input.equipmentMonthlyFeeMinor,
      dataAllowance: input.dataAllowance,
      routerIncluded: input.routerIncluded,
      status: "active",
      evidenceIds: evidence.map((item) => item.id),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await mutateDatabase((database) => {
      database.evidence.push(...evidence);
      database.commitments.push(commitment);
      appendAudit(database, {
        householdId: id,
        actorType: "user",
        actorId: access.session.userId,
        eventType: "commitment.created",
        entityType: "commitment",
        entityId: commitmentId,
        metadata: {
          providerName: commitment.providerName,
          serviceType: commitment.serviceType,
          recurringChargeMinor: commitment.recurringChargeMinor,
          evidenceIds: commitment.evidenceIds,
          sourceNote: input.sourceNote ?? null,
        },
      });
    });

    return jsonResponse({ commitment, evidence }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import type { Commitment } from "@/lib/domain/types";
import { CommitmentUpdateSchema } from "@/lib/domain/schemas";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import {
  appendAudit,
  getCommitment,
  requireWritableHousehold,
} from "@/lib/store/repository";
import { buildUserEvidence } from "@/lib/server/commitment-evidence";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const commitment = await getCommitment(id);
    if (!commitment) throw new ApiError("NOT_FOUND", "Commitment not found.");
    await requireWritableHousehold(commitment.householdId);
    return jsonResponse({ commitment });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const existing = await getCommitment(id);
    if (!existing) throw new ApiError("NOT_FOUND", "Commitment not found.");
    const access = await requireWritableHousehold(existing.householdId);
    const input = await readJson(request, CommitmentUpdateSchema);

    const result = await mutateDatabase((database) => {
      const commitment = database.commitments.find((item) => item.id === id);
      if (!commitment) throw new ApiError("NOT_FOUND", "Commitment not found.");

      const materialFields = [
        "recurringChargeMinor",
        "minimumTermMonths",
        "cancellationFeeMinor",
      ] as const;
      const changedMaterial = materialFields.filter(
        (field) => input[field] !== undefined && input[field] !== commitment[field],
      );

      Object.assign(commitment, input);
      commitment.version += 1;
      commitment.updatedAt = serverNow();

      const evidence = changedMaterial.map((field) => {
        const value = commitment[field];
        const labels: Record<(typeof materialFields)[number], string> = {
          recurringChargeMinor: "Recurring charge",
          minimumTermMonths: "Minimum term",
          cancellationFeeMinor: "Cancellation fee",
        };
        return buildUserEvidence({
          commitmentId: commitment.id,
          field,
          label: labels[field],
          value,
          quote:
            value === null
              ? `Household updated ${labels[field].toLowerCase()} to not stated.`
              : `Household updated ${labels[field].toLowerCase()} to ${String(value)}.`,
        });
      });
      database.evidence.push(...evidence);
      commitment.evidenceIds = [...commitment.evidenceIds, ...evidence.map((item) => item.id)];

      appendAudit(database, {
        householdId: commitment.householdId,
        actorType: "user",
        actorId: access.session.userId,
        eventType: "commitment.updated",
        entityType: "commitment",
        entityId: commitment.id,
        metadata: {
          fields: Object.keys(input),
          version: commitment.version,
          evidenceIds: evidence.map((item) => item.id),
        },
      });
      return { commitment: { ...commitment } as Commitment, evidence };
    });

    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

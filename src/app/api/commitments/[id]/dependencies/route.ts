import type { NextRequest } from "next/server";
import {
  getBenefits,
  getCommitment,
  getDependencies,
  requireHouseholdAccess,
} from "@/lib/store/repository";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const commitment = await getCommitment(id);
    if (!commitment) throw new ApiError("NOT_FOUND", "Commitment not found.");
    await requireHouseholdAccess(commitment.householdId);
    const [allDependencies, benefits] = await Promise.all([
      getDependencies(commitment.householdId),
      getBenefits(commitment.householdId),
    ]);
    const dependencies = allDependencies.filter(
      (item) => item.fromCommitmentId === id || item.toCommitmentId === id,
    );
    return jsonResponse({
      commitment,
      dependencies,
      benefits: benefits.filter((item) => item.commitmentId === id),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

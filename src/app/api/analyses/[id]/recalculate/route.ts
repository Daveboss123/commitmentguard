import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/store/database";
import { getAnalysis, requireWritableHousehold } from "@/lib/store/repository";
import { createAnalysis } from "@/lib/services/analysis.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

/**
 * Re-runs the deterministic engine against the current ledger snapshot.
 * A new analysis record is produced; prior approvals remain bound to the
 * analysis they were made against.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const analysis = await getAnalysis(id);
    if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
    await requireWritableHousehold(analysis.householdId);
    const result = await createAnalysis({
      householdId: analysis.householdId,
      intentId: analysis.intentContractId,
      offerId: analysis.offerId,
    });
    const database = await getDatabase();
    return jsonResponse({
      analysis: result.analysis,
      receipt: result.receipt,
      supersedesAnalysisId: analysis.id,
      offerVersion: database.offers.find((offer) => offer.id === analysis.offerId)
        ?.offerVersion ?? null,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

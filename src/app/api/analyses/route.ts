import type { NextRequest } from "next/server";
import { CreateAnalysisRequestSchema } from "@/lib/domain/schemas";
import { getIntent, getOffer, requireWritableHousehold } from "@/lib/store/repository";
import { createAnalysis } from "@/lib/services/analysis.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";


export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, CreateAnalysisRequestSchema);
    const [intent, offer] = await Promise.all([
      getIntent(input.intentId),
      getOffer(input.offerId),
    ]);
    if (!intent) throw new ApiError("NOT_FOUND", "Intent not found.");
    if (!offer) throw new ApiError("NOT_FOUND", "Offer not found.");
    if (intent.householdId !== offer.householdId) {
      throw new ApiError(
        "HOUSEHOLD_ACCESS_DENIED",
        "The intent and offer belong to different households.",
      );
    }
    await requireWritableHousehold(intent.householdId);
    const result = await createAnalysis({
      householdId: intent.householdId,
      intentId: intent.id,
      offerId: offer.id,
    });
    return jsonResponse(
      {
        analysis: result.analysis,
        receipt: result.receipt,
        explanationError: result.explanationError,
      },
      201,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

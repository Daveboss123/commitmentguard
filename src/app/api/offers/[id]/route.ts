import type { NextRequest } from "next/server";
import {
  getOffer,
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
    const offer = await getOffer(id);
    if (!offer) throw new ApiError("NOT_FOUND", "Offer not found.");
    await requireHouseholdAccess(offer.householdId);
    return jsonResponse({ offer });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

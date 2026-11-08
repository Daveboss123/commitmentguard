import type { NextRequest } from "next/server";
import {
  getIntent,
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
    const intent = await getIntent(id);
    if (!intent) throw new ApiError("NOT_FOUND", "Intent not found.");
    await requireHouseholdAccess(intent.householdId);
    return jsonResponse({ intent });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

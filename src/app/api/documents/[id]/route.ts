import type { NextRequest } from "next/server";
import {
  getDocument,
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
    const document = await getDocument(id);
    if (!document) throw new ApiError("NOT_FOUND", "Document not found.");
    await requireHouseholdAccess(document.householdId);
    return jsonResponse({ document });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/store/database";
import { getReceipt, requireHouseholdAccess } from "@/lib/store/repository";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const receipt = await getReceipt(id);
    if (!receipt) throw new ApiError("NOT_FOUND", "Receipt not found.");
    await requireHouseholdAccess(receipt.householdId);
    const database = await getDatabase();
    return jsonResponse({
      receipt,
      verification: verifyReceipt(database, receipt),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

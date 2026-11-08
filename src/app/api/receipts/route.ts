import type { NextRequest } from "next/server";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/store/database";
import { listReceipts, requireHouseholdAccess } from "@/lib/store/repository";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, getSearchParam } from "@/lib/http/route";


export async function GET(request: NextRequest) {
  await connection();
  try {
    const session = await getSession();
    if (!session) throw new ApiError("AUTH_REQUIRED", "Sign in to continue.");
    const householdId = getSearchParam(request, "householdId") ?? session.householdId;
    await requireHouseholdAccess(householdId);
    const database = await getDatabase();
    const receipts = await listReceipts(householdId);
    return jsonResponse({
      receipts: receipts.map((receipt) => ({
        ...receipt,
        verification: verifyReceipt(database, receipt),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/store/database";
import {
  listReceipts,
  requireHouseholdAccess,
} from "@/lib/store/repository";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireHouseholdAccess(id);
    const database = await getDatabase();
    const receipts = await listReceipts(id);
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

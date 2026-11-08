import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/store/database";
import { getExecutionBundle } from "@/lib/services/execution.service";
import { verifyReceipt } from "@/lib/services/receipt.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const bundle = await getExecutionBundle(id);
    const database = await getDatabase();
    return jsonResponse({
      ...bundle,
      receipts: bundle.receipts.map((receipt) => ({
        ...receipt,
        verification: verifyReceipt(database, receipt),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

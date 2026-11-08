import type { NextRequest } from "next/server";
import { executeApprovedPayment } from "@/lib/services/execution.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

/**
 * Executes an approved payment through the configured Kite adapter. Duplicate
 * submissions are refused by the service using the idempotency key and the
 * stored execution state.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await executeApprovedPayment(id);
    return jsonResponse(
      { execution: result.execution, receipt: result.receipt },
      result.receipt ? 201 : 200,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

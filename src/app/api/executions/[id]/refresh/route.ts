import type { NextRequest } from "next/server";
import { refreshExecution } from "@/lib/services/execution.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

/**
 * Polls the stored Kite session and updates the execution. The service checks
 * household membership before reading any provider state.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    return jsonResponse({ execution: await refreshExecution(id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { getDatabase } from "@/lib/store/database";
import { getAnalysis, requireHouseholdAccess } from "@/lib/store/repository";
import { getKiteAdapter } from "@/lib/integrations/kite/factory";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

/**
 * Returns the live session state for a stored Kite request. The request must
 * belong to an execution in the caller's household; unknown ids are not
 * proxied to the provider.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await context.params;
    const database = await getDatabase();
    const execution = database.executions.find(
      (item) => item.kiteRequestId === requestId,
    );
    if (!execution) throw new ApiError("NOT_FOUND", "Kite session not found.");
    const analysis = await getAnalysis(execution.analysisId);
    if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
    await requireHouseholdAccess(analysis.householdId);

    const adapter = getKiteAdapter();
    const status = await adapter.getSessionStatus(requestId);
    return jsonResponse({
      requestId,
      status,
      executionId: execution.id,
      executionStatus: execution.status,
      simulated: execution.executionMode === "simulated",
      adapterMode: adapter.mode,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

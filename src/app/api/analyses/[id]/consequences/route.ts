import type { NextRequest } from "next/server";
import { getAnalysisBundle } from "@/lib/services/analysis.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const bundle = await getAnalysisBundle(id);
    return jsonResponse({
      decision: bundle.analysis.decision,
      reasons: bundle.analysis.decisionReasons,
      consequences: bundle.analysis.consequences,
      totals: bundle.analysis.totals,
      unknowns: bundle.analysis.unknowns,
      evidenceValidation: bundle.analysis.evidenceValidation,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

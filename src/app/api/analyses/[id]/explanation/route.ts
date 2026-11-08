import type { NextRequest } from "next/server";
import { ExplainAnalysisRequestSchema } from "@/lib/domain/schemas";
import { getAnalysis, requireWritableHousehold } from "@/lib/store/repository";
import { generateExplanationForAnalysis } from "@/lib/services/analysis.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const analysis = await getAnalysis(id);
    if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
    const access = await requireWritableHousehold(analysis.householdId);
    const input = await readJson(request, ExplainAnalysisRequestSchema);
    if (analysis.servExplanation && !input.regenerate) {
      return jsonResponse({ analysis, cached: true });
    }
    const explained = await generateExplanationForAnalysis({
      analysisId: analysis.id,
      actorUserId: access.session.userId,
    });
    return jsonResponse({ analysis: explained, cached: false });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

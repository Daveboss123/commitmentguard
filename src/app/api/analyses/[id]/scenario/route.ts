import type { NextRequest } from "next/server";
import { ScenarioRequestSchema } from "@/lib/domain/schemas";
import { runAnalysisScenario } from "@/lib/services/analysis.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

/**
 * What-if evaluation.
 *
 * Re-runs the deterministic engine with hypothetical policy or offer terms.
 * Nothing is written: no analysis, no receipt, no approval. The response is
 * explicitly labelled as not an approval basis.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const overrides = await readJson(request, ScenarioRequestSchema);
    const evaluation = await runAnalysisScenario(id, overrides);
    return jsonResponse(evaluation);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

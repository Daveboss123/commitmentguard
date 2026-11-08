import type { NextRequest } from "next/server";
import { validateEvidence } from "@/lib/domain/evidence";
import { getDatabase } from "@/lib/store/database";
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
    const database = await getDatabase();
    const evidence = database.evidence.filter((item) =>
      bundle.analysis.evidenceIds.includes(item.id),
    );
    const sourceTexts = Object.fromEntries(
      database.documents
        .filter((document) => document.householdId === bundle.analysis.householdId)
        .map((document) => [document.id, document.text]),
    );
    const validation = validateEvidence(evidence, sourceTexts);
    return jsonResponse({
      evidence,
      validation: {
        total: validation.total,
        valid: validation.valid,
        invalidEvidenceIds: validation.invalidEvidenceIds,
        contradictedEvidenceIds: validation.contradictedEvidenceIds,
        byId: validation.byId,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { ApprovalRequestSchema } from "@/lib/domain/schemas";
import { createApproval } from "@/lib/services/approval.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = await readJson(request, ApprovalRequestSchema);
    const result = await createApproval({
      analysisId: id,
      decision: input.decision,
      acknowledgedConsequences: input.acknowledgedConsequences,
      approverRole: input.approverRole,
    });
    return jsonResponse(
      {
        approval: result.approval,
        receipt: result.receipt,
        analysis: result.analysis,
      },
      result.receipt ? 201 : 200,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

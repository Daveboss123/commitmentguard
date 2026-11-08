import type { NextRequest } from "next/server";
import { ApprovalRequestSchema } from "@/lib/domain/schemas";
import { recordApprovalDecision } from "@/lib/services/approval.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = await readJson(request, ApprovalRequestSchema);
    const result = await recordApprovalDecision({
      approvalId: id,
      decision: input.decision,
    });
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

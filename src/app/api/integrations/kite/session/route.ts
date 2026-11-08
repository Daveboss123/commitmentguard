import type { NextRequest } from "next/server";
import { CreateExecutionRequestSchema } from "@/lib/domain/schemas";
import { serverConfig } from "@/lib/app/config";
import {
  getAnalysis,
  getApproval,
  requireWritableHousehold,
} from "@/lib/store/repository";
import { startExecution } from "@/lib/services/execution.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";


export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, CreateExecutionRequestSchema);
    const approval = await getApproval(input.approvalId);
    if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
    const analysis = await getAnalysis(approval.analysisId);
    if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
    await requireWritableHousehold(analysis.householdId);
    const execution = await startExecution({
      approvalId: approval.id,
      maxTotalUsdc: input.maxTotalUsdc ?? serverConfig.kite.maxTotalUsdc,
      maxPerTxUsdc: input.maxPerTxUsdc ?? serverConfig.kite.maxPerTxUsdc,
    });
    return jsonResponse({ execution }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

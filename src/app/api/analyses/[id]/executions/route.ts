import type { NextRequest } from "next/server";
import { CreateExecutionRequestSchema } from "@/lib/domain/schemas";
import { serverConfig } from "@/lib/app/config";
import {
  getAnalysis,
  getApproval,
  getExecution,
  requireHouseholdAccess,
  requireWritableHousehold,
} from "@/lib/store/repository";
import {
  latestExecutionForApproval,
} from "@/lib/services/execution.service";
import { latestApprovalForAnalysis } from "@/lib/services/approval.service";
import { startExecution } from "@/lib/services/execution.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const analysis = await getAnalysis(id);
    if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
    await requireHouseholdAccess(analysis.householdId);
    const approval = await latestApprovalForAnalysis(analysis.id);
    const execution = approval
      ? await latestExecutionForApproval(approval.id)
      : null;
    return jsonResponse({ analysis, approval, execution });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const analysis = await getAnalysis(id);
    if (!analysis) throw new ApiError("NOT_FOUND", "Analysis not found.");
    await requireWritableHousehold(analysis.householdId);

    const raw = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const fallbackApproval = await latestApprovalForAnalysis(analysis.id);
    const approvalId =
      typeof raw?.approvalId === "string" ? raw.approvalId : fallbackApproval?.id;
    if (!approvalId) {
      throw new ApiError(
        "APPROVAL_REQUIRED",
        "A recorded approval is required before a Kite session can be requested.",
      );
    }
    const approval = await getApproval(approvalId);
    if (!approval) throw new ApiError("NOT_FOUND", "Approval not found.");
    if (approval.analysisId !== analysis.id) {
      throw new ApiError(
        "VALIDATION_FAILED",
        "The approval does not belong to this analysis.",
      );
    }
    const existing = await latestExecutionForApproval(approval.id);
    if (existing) {
      return jsonResponse({ execution: await getExecution(existing.id) }, 200);
    }

    const parsed = CreateExecutionRequestSchema.safeParse({
      ...(raw ?? {}),
      approvalId,
    });
    if (!parsed.success) {
      throw new ApiError("VALIDATION_FAILED", "Request validation failed.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "body",
          message: issue.message,
        })),
      });
    }
    const execution = await startExecution({
      approvalId,
      maxTotalUsdc: parsed.data.maxTotalUsdc ?? serverConfig.kite.maxTotalUsdc,
      maxPerTxUsdc: parsed.data.maxPerTxUsdc ?? serverConfig.kite.maxPerTxUsdc,
    });
    return jsonResponse({ execution }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

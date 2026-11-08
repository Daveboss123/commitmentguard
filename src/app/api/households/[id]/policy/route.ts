import type { NextRequest } from "next/server";
import { PolicyUpdateSchema } from "@/lib/domain/schemas";
import { getPolicy, requireHouseholdAccess } from "@/lib/store/repository";
import { updatePolicy } from "@/lib/services/policy.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireHouseholdAccess(id);
    const policy = await getPolicy(id);
    if (!policy) throw new ApiError("NOT_FOUND", "Household policy not found.");
    return jsonResponse({ policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = await readJson(request, PolicyUpdateSchema);
    const policy = await updatePolicy(id, input);
    return jsonResponse({ policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

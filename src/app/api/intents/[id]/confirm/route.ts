import type { NextRequest } from "next/server";
import { ConfirmIntentRequestSchema } from "@/lib/domain/schemas";
import { getIntent, requireWritableHousehold } from "@/lib/store/repository";
import { confirmIntent } from "@/lib/services/intent.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const existing = await getIntent(id);
    if (!existing) throw new ApiError("NOT_FOUND", "Intent not found.");
    await requireWritableHousehold(existing.householdId);
    const input = await readJson(request, ConfirmIntentRequestSchema);
    return jsonResponse({ intent: await confirmIntent(id, input) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

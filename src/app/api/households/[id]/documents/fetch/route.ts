import type { NextRequest } from "next/server";
import { FetchUrlRequestSchema } from "@/lib/domain/schemas";
import { requireWritableHousehold } from "@/lib/store/repository";
import { fetchDocumentFromUrl } from "@/lib/services/document.service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const input = await readJson(request, FetchUrlRequestSchema);
    if (input.householdId !== id) {
      return jsonResponse({ error: { code: "VALIDATION_FAILED", message: "The household in the body does not match the route." } }, 400);
    }
    const access = await requireWritableHousehold(id);
    const document = await fetchDocumentFromUrl({
      householdId: id,
      label: input.label,
      url: input.url,
      kind: input.kind,
      actorUserId: access.session.userId,
    });
    return jsonResponse({ document }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import {
  getDocument,
  requireWritableHousehold,
} from "@/lib/store/repository";
import { createOfferFromDocument } from "@/lib/services/document.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const document = await getDocument(id);
    if (!document) throw new ApiError("NOT_FOUND", "Document not found.");
    const access = await requireWritableHousehold(document.householdId);
    const result = await createOfferFromDocument({
      householdId: document.householdId,
      documentId: document.id,
      actorUserId: access.session.userId,
    });
    return jsonResponse(
      {
        offer: result.offer,
        document: result.document,
        extraction: result.meta,
        injection: result.injection,
      },
      201,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

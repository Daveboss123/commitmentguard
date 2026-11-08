import type { NextRequest } from "next/server";
import { z } from "zod";
import { ManualOfferRequestSchema } from "@/lib/domain/schemas";
import {
  getDocument,
  requireWritableHousehold,
} from "@/lib/store/repository";
import {
  createOfferFromDocument,
  createOfferFromText,
} from "@/lib/services/document.service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";


const CreateOfferRequestSchema = z.union([
  z.object({
    householdId: z.string().min(1),
    documentId: z.string().min(1),
  }),
  ManualOfferRequestSchema,
]);

export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, CreateOfferRequestSchema);
    const access = await requireWritableHousehold(input.householdId);

    if ("documentId" in input) {
      const document = await getDocument(input.documentId);
      if (!document) throw new ApiError("NOT_FOUND", "Document not found.");
      if (document.householdId !== input.householdId) {
        throw new ApiError(
          "HOUSEHOLD_ACCESS_DENIED",
          "That document belongs to another household.",
        );
      }
      const result = await createOfferFromDocument({
        householdId: input.householdId,
        documentId: input.documentId,
        actorUserId: access.session.userId,
      });
      return jsonResponse(
        {
          offer: result.offer,
          extraction: result.meta,
          injection: result.injection,
        },
        201,
      );
    }

    const result = await createOfferFromText({
      householdId: input.householdId,
      providerName: input.providerName,
      planName: input.planName,
      serviceType: input.serviceType,
      currency: input.currency,
      documentText: input.documentText,
      sourceLabel: input.sourceLabel,
      actorUserId: access.session.userId,
    });
    return jsonResponse(
      {
        offer: result.offer,
        extraction: result.meta,
        injection: result.injection,
      },
      201,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

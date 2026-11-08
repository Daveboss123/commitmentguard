import type { NextRequest } from "next/server";
import { ExtractOfferRequestSchema } from "@/lib/domain/schemas";
import {
  getBenefits,
  getOffer,
  requireWritableHousehold,
} from "@/lib/store/repository";
import { reextractOfferTerms } from "@/lib/integrations/serv/service";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

/**
 * Re-extracts the offer's own document and bumps offerVersion. Any approval
 * bound to the previous version is deterministically invalidated.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const offer = await getOffer(id);
    if (!offer) throw new ApiError("NOT_FOUND", "Offer not found.");
    const access = await requireWritableHousehold(offer.householdId);
    await readJson(request, ExtractOfferRequestSchema);
    const benefits = await getBenefits(offer.householdId);
    const result = await reextractOfferTerms({
      offer,
      knownBenefitKeys: [
        ...new Set([
          ...benefits.map((benefit) => benefit.benefitKey),
          "family_mobile_bundle_discount",
          "streaming_credit",
        ]),
      ],
      actorUserId: access.session.userId,
    });
    return jsonResponse({
      offer: result.offer,
      extraction: result.meta,
      injection: result.injection,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

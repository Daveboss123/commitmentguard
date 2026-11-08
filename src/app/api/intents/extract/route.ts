import type { NextRequest } from "next/server";
import { ExtractIntentRequestSchema } from "@/lib/domain/schemas";
import {
  getBenefits,
  getPolicy,
  requireWritableHousehold,
} from "@/lib/store/repository";
import { extractIntent } from "@/lib/integrations/serv/service";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";


export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, ExtractIntentRequestSchema);
    const access = await requireWritableHousehold(input.householdId);
    const [policy, benefits] = await Promise.all([
      getPolicy(input.householdId),
      getBenefits(input.householdId),
    ]);
    const result = await extractIntent({
      householdId: input.householdId,
      request: input.request,
      policy,
      knownBenefitKeys: [
        ...new Set([
          ...benefits.map((benefit) => benefit.benefitKey),
          "family_mobile_bundle_discount",
          "streaming_credit",
        ]),
      ],
      actorUserId: access.session.userId,
    });
    return jsonResponse({ intent: result.intent, extraction: result.meta }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

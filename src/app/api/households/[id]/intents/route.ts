import type { NextRequest } from "next/server";
import {
  listIntents,
  listOffers,
  requireHouseholdAccess,
} from "@/lib/store/repository";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireHouseholdAccess(id);
    const [intents, offers] = await Promise.all([listIntents(id), listOffers(id)]);
    return jsonResponse({ intents, offers });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

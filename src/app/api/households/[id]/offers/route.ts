import type { NextRequest } from "next/server";
import { listOffers, requireHouseholdAccess } from "@/lib/store/repository";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireHouseholdAccess(id);
    return jsonResponse({ offers: await listOffers(id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

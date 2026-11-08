import type { NextRequest } from "next/server";
import {
  listAuditEvents,
  requireHouseholdAccess,
} from "@/lib/store/repository";
import { apiErrorResponse } from "@/lib/http/errors";
import { getSearchParam, jsonResponse } from "@/lib/http/route";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireHouseholdAccess(id);
    const limit = Number(getSearchParam(request, "limit") ?? "50");
    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.trunc(limit), 1), 200)
      : 50;
    return jsonResponse({
      events: await listAuditEvents(id, safeLimit),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

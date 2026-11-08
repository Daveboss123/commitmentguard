import type { NextRequest } from "next/server";
import { resetDatabase } from "@/lib/store/database";
import { requireWritableHousehold } from "@/lib/store/repository";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";


export async function POST(request: NextRequest) {
  try {
    if (process.env.DEMO_RESET_ENABLED === "0") {
      throw new ApiError(
        "CONFLICT",
        "Demo reset is disabled on this deployment.",
      );
    }
    const payload = (await request.json().catch(() => ({}))) as {
      householdId?: string;
    };
    const householdId = payload.householdId ?? "hh_morgan_demo";
    await requireWritableHousehold(householdId);
    const database = await resetDatabase();
    return jsonResponse({
      reset: true,
      householdId,
      seededAt: database.meta.seededAt,
      note: "The demo database was reseeded. Prior approvals and receipts were removed with it.",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

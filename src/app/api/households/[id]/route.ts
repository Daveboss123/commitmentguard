import type { NextRequest } from "next/server";
import { UpdateHouseholdRequestSchema } from "@/lib/domain/schemas";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import { appendAudit, requireHouseholdAccess, requireWritableHousehold } from "@/lib/store/repository";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const access = await requireHouseholdAccess(id);
    return jsonResponse({
      household: access.household,
      member: access.member,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const access = await requireWritableHousehold(id);
    const input = await readJson(request, UpdateHouseholdRequestSchema);

    return jsonResponse(
      await mutateDatabase(async (database) => {
        const household = database.households.find((item) => item.id === id);
        if (!household) throw new ApiError("NOT_FOUND", "Household not found.");
        if (input.name !== undefined) household.name = input.name;
        if (input.defaultCurrency !== undefined) {
          household.defaultCurrency = input.defaultCurrency;
        }
        if (input.locale !== undefined) household.locale = input.locale;
        household.updatedAt = serverNow();
        appendAudit(database, {
          householdId: id,
          actorType: "user",
          actorId: access.session.userId,
          eventType: "household.updated",
          entityType: "household",
          entityId: id,
          metadata: { fields: Object.keys(input) },
        });
        return { household };
      }),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

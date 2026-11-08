import type { NextRequest } from "next/server";
import { getDatabase, mutateDatabase } from "@/lib/store/database";
import { appendAudit } from "@/lib/store/repository";
import { setSessionCookie } from "@/lib/auth/session";
import { LoginRequestSchema } from "@/lib/domain/schemas";
import { apiErrorResponse, ApiError } from "@/lib/http/errors";
import { jsonResponse } from "@/lib/http/route";


async function resolveHouseholdId(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return String(form.get("householdId") ?? "");
  }
  const payload = await request.json().catch(() => ({}));
  const parsed = LoginRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_FAILED", "A householdId is required.");
  }
  return parsed.data.householdId;
}

export async function POST(request: NextRequest) {
  try {
    const requestedHouseholdId = await resolveHouseholdId(request);
    const database = await getDatabase();
    const household =
      database.households.find((item) => item.id === requestedHouseholdId) ??
      database.households[0];
    if (!household) {
      throw new ApiError("NOT_FOUND", "No demo household is available.");
    }
    const member = database.members.find(
      (item) => item.householdId === household.id && item.status === "active",
    );
    if (!member?.userId) {
      throw new ApiError("AUTH_REQUIRED", "This demo household has no active owner.");
    }

    await setSessionCookie(member.userId, household.id);
    await mutateDatabase((db) => {
      appendAudit(db, {
        householdId: household.id,
        actorType: "user",
        actorId: member.userId ?? null,
        eventType: "auth.demo_login",
        entityType: "household",
        entityId: household.id,
        metadata: { demoAuth: true },
      });
    });

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/app", "Cache-Control": "no-store" },
      });
    }
    return jsonResponse({ ok: true, householdId: household.id });
  } catch (error) {
    if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
      return errorResponseOrRedirect(request, error);
    }
    return apiErrorResponse(error);
  }
}

function errorResponseOrRedirect(request: NextRequest, error: ApiError): Response {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return new Response(null, {
      status: 303,
      headers: { Location: "/login?error=1", "Cache-Control": "no-store" },
    });
  }
  return apiErrorResponse(error);
}

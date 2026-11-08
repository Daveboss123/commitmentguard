import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { Household, HouseholdMember, UserPolicy } from "@/lib/domain/types";
import { CreateHouseholdRequestSchema } from "@/lib/domain/schemas";
import { listVisibleHouseholds, appendAudit } from "@/lib/store/repository";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import { requireSession } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/http/errors";
import { jsonResponse, readJson } from "@/lib/http/route";


export async function GET() {
  try {
    return jsonResponse({ households: await listVisibleHouseholds() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const input = await readJson(request, CreateHouseholdRequestSchema);
    const now = serverNow();
    const householdId = `hh_${randomUUID()}`;
    const household: Household = {
      id: householdId,
      ownerUserId: session.userId,
      name: input.name,
      defaultCurrency: input.currency,
      locale: input.locale,
      createdAt: now,
      updatedAt: now,
    };
    const member: HouseholdMember = {
      id: `hm_${randomUUID()}`,
      householdId,
      userId: session.userId,
      displayName: input.ownerDisplayName,
      role: "owner",
      status: "active",
      createdAt: now,
    };
    const policy: UserPolicy = {
      id: `pol_${randomUUID()}`,
      householdId,
      version: 1,
      currency: input.currency,
      minimumMonthlySavingMinor: null,
      maxContractMonths: null,
      mustKeepBenefits: [],
      mustHave: [],
      mustNotHave: [],
      softPreferences: [],
      unknownCriticalTermsPolicy: "review",
      approvalRequiredFor: ["provider_switch", "new_contract", "payment"],
      createdAt: now,
    };

    await mutateDatabase((database) => {
      database.households.push(household);
      database.members.push(member);
      database.policies.push(policy);
      appendAudit(database, {
        householdId,
        actorType: "user",
        actorId: session.userId,
        eventType: "household.created",
        entityType: "household",
        entityId: householdId,
        metadata: { currency: input.currency, policyId: policy.id },
      });
    });

    return jsonResponse({ household, member, policy }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

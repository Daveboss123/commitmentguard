import "server-only";
import { randomUUID } from "node:crypto";
import type { UserPolicy } from "@/lib/domain/types";
import { mutateDatabase, serverNow } from "@/lib/store/database";
import { appendAudit, getPolicy, requireWritableHousehold } from "@/lib/store/repository";
import { ApiError } from "@/lib/http/errors";

export interface PolicyUpdateInput {
  currency?: string;
  minimumMonthlySavingMinor: number | null;
  maxContractMonths: number | null;
  mustKeepBenefits: string[];
  mustHave: string[];
  mustNotHave: string[];
  softPreferences: string[];
  unknownCriticalTermsPolicy: "review" | "block";
  approvalRequiredFor: string[];
}

/**
 * Policies are append-only versions. A new analysis captures the policy id and
 * version, so changing a policy never silently rewrites a prior decision.
 */
export async function updatePolicy(
  householdId: string,
  input: PolicyUpdateInput,
): Promise<UserPolicy> {
  const access = await requireWritableHousehold(householdId);
  const current = await getPolicy(householdId);
  if (!current) throw new ApiError("NOT_FOUND", "Household policy not found.");

  return mutateDatabase((database) => {
    const policy: UserPolicy = {
      id: `pol_${randomUUID()}`,
      householdId,
      version: current.version + 1,
      currency: input.currency ?? current.currency,
      minimumMonthlySavingMinor: input.minimumMonthlySavingMinor,
      maxContractMonths: input.maxContractMonths,
      mustKeepBenefits: [...new Set(input.mustKeepBenefits)],
      mustHave: [...new Set(input.mustHave)],
      mustNotHave: [...new Set(input.mustNotHave)],
      softPreferences: [...new Set(input.softPreferences)],
      unknownCriticalTermsPolicy: input.unknownCriticalTermsPolicy,
      approvalRequiredFor: [...new Set(input.approvalRequiredFor)],
      createdAt: serverNow(),
    };
    database.policies.push(policy);
    appendAudit(database, {
      householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: "policy.updated",
      entityType: "policy",
      entityId: policy.id,
      metadata: {
        previousPolicyId: current.id,
        previousVersion: current.version,
        version: policy.version,
        minimumMonthlySavingMinor: policy.minimumMonthlySavingMinor,
        maxContractMonths: policy.maxContractMonths,
        unknownCriticalTermsPolicy: policy.unknownCriticalTermsPolicy,
      },
    });
    return policy;
  });
}

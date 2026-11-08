import "server-only";
import type { IntentContract } from "@/lib/domain/types";
import type { z } from "zod";
import type { ConfirmIntentRequestSchema } from "@/lib/domain/schemas";
import { mutateDatabase } from "@/lib/store/database";
import { appendAudit, getIntent, requireWritableHousehold } from "@/lib/store/repository";
import { ApiError } from "@/lib/http/errors";
import { serverNow } from "@/lib/store/database";

type ConfirmInput = z.infer<typeof ConfirmIntentRequestSchema>;

/**
 * Confirmation is the authority boundary: an extracted intent is only a draft.
 * Editing any constraint creates a new intent version.
 */
export async function confirmIntent(
  intentId: string,
  input: ConfirmInput,
): Promise<IntentContract> {
  const existing = await getIntent(intentId);
  if (!existing) throw new ApiError("NOT_FOUND", "Intent not found.");
  const access = await requireWritableHousehold(existing.householdId);

  return mutateDatabase((database) => {
    const intent = database.intents.find((item) => item.id === intentId);
    if (!intent) throw new ApiError("NOT_FOUND", "Intent not found.");
    const before = JSON.stringify({
      goal: intent.goal,
      minimumMonthlySavingMinor: intent.minimumMonthlySavingMinor,
      maxContractMonths: intent.maxContractMonths,
      mustKeepBenefits: intent.mustKeepBenefits,
      mustHave: intent.mustHave,
      mustNotHave: intent.mustNotHave,
      softPreferences: intent.softPreferences,
      unknownCriticalTermsPolicy: intent.unknownCriticalTermsPolicy,
    });

    if (input.goal !== undefined) intent.goal = input.goal;
    if (input.minimumMonthlySavingMinor !== undefined) {
      intent.minimumMonthlySavingMinor = input.minimumMonthlySavingMinor;
    }
    if (input.maxContractMonths !== undefined) {
      intent.maxContractMonths = input.maxContractMonths;
    }
    if (input.mustKeepBenefits !== undefined) {
      intent.mustKeepBenefits = [...new Set(input.mustKeepBenefits)];
    }
    if (input.mustHave !== undefined) {
      intent.mustHave = [...new Set(input.mustHave)];
    }
    if (input.mustNotHave !== undefined) {
      intent.mustNotHave = [...new Set(input.mustNotHave)];
    }
    if (input.softPreferences !== undefined) {
      intent.softPreferences = [...new Set(input.softPreferences)];
    }
    if (input.unknownCriticalTermsPolicy !== undefined) {
      intent.unknownCriticalTermsPolicy = input.unknownCriticalTermsPolicy;
    }

    const after = JSON.stringify({
      goal: intent.goal,
      minimumMonthlySavingMinor: intent.minimumMonthlySavingMinor,
      maxContractMonths: intent.maxContractMonths,
      mustKeepBenefits: intent.mustKeepBenefits,
      mustHave: intent.mustHave,
      mustNotHave: intent.mustNotHave,
      softPreferences: intent.softPreferences,
      unknownCriticalTermsPolicy: intent.unknownCriticalTermsPolicy,
    });
    const changed = before !== after;
    if (changed) intent.version += 1;
    intent.userConfirmedAt = serverNow();

    appendAudit(database, {
      householdId: intent.householdId,
      actorType: "user",
      actorId: access.session.userId,
      eventType: changed ? "intent.confirmed_with_edits" : "intent.confirmed",
      entityType: "intent",
      entityId: intent.id,
      metadata: {
        version: intent.version,
        edited: changed,
        fields: Object.keys(input),
      },
    });
    return { ...intent };
  });
}

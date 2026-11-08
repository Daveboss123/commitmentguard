import "server-only";
import { randomUUID } from "node:crypto";
import type { Evidence } from "@/lib/domain/types";
import { sourceVersionHash } from "@/lib/domain/evidence";
import { serverNow } from "@/lib/store/database";

/**
 * Household-entered commitment figures are traceable assertions, not verified
 * provider documents. They stay labelled `user_provided` so the engine never
 * promotes them to a document-verified fact.
 */
export function buildUserEvidence(input: {
  commitmentId: string;
  field: string;
  label: string;
  value: string | number | boolean | null;
  quote: string;
}): Evidence {
  return {
    id: `ev_${randomUUID()}`,
    sourceType: "user_input",
    sourceLabel: "Household-entered commitment",
    subjectId: input.commitmentId,
    quote: input.quote,
    normalizedField: input.field,
    normalizedValue: input.value,
    status: "user_provided",
    extractedAt: serverNow(),
    sourceVersionHash: sourceVersionHash(input.quote),
  };
}

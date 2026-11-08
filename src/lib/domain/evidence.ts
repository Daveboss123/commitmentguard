import type { Evidence, EvidenceStatus, EvidenceValidation } from "./types";
import { canonicalJson, hashPayload } from "./canonical";

/** Quote matching is whitespace-insensitive but otherwise exact. */
export function normalizeQuotes(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function quoteExists(quote: string, sourceText: string): boolean {
  if (!quote.trim()) return false;
  return normalizeQuotes(sourceText).includes(normalizeQuotes(quote));
}

export function sourceVersionHash(text: string): string {
  return hashPayload({ text: normalizeQuotes(text) });
}

export interface EvidenceValidationResult extends EvidenceValidation {
  byId: Record<
    string,
    {
      valid: boolean;
      reason: string | null;
      status: EvidenceStatus;
    }
  >;
}

/**
 * Validates every evidence quote against its source document. A fact is only
 * "verified" when the quote can actually be found in the source text.
 */
export function validateEvidence(
  evidence: Evidence[],
  sourceTexts: Record<string, string>,
): EvidenceValidationResult {
  const byId: EvidenceValidationResult["byId"] = {};
  const invalidEvidenceIds: string[] = [];
  const contradictedEvidenceIds: string[] = [];
  const normalizedValues = new Map<string, Set<string>>();

  for (const item of evidence) {
    const source = item.documentId ? sourceTexts[item.documentId] : undefined;
    let valid = false;
    let reason: string | null = null;

    if (item.status === "unknown") {
      if (!item.quote.trim()) {
        reason = "No evidence quote supplied for the unknown fact";
      } else if (!source) {
        reason = "Source document is unavailable";
      } else if (!quoteExists(item.quote, source)) {
        reason = "Quote could not be located in the source document";
      } else {
        // A quote can validly prove that a term is absent from a document.
        valid = true;
      }
    } else if (item.sourceType === "user_input" || item.status === "user_provided") {
      // A household assertion is traceable to the person who entered it. It is
      // still labelled user-provided and never promoted to a verified document fact.
      valid = item.quote.trim().length > 0;
      if (!valid) reason = "User-provided evidence has no assertion text";
    } else if (!item.quote.trim()) {
      reason = "No evidence quote supplied";
    } else if (!source) {
      reason = "Source document is unavailable";
    } else if (!quoteExists(item.quote, source)) {
      reason = "Quote could not be located in the source document";
    } else {
      const expectedHash = sourceVersionHash(source);
      if (item.sourceVersionHash && item.sourceVersionHash !== expectedHash) {
        reason = "Source changed after extraction";
      } else {
        valid = true;
      }
    }

    const status: EvidenceStatus = valid
      ? item.status
      : item.status === "unknown"
        ? "unknown"
        : "contradicted";

    if (!valid) invalidEvidenceIds.push(item.id);
    if (status === "contradicted") contradictedEvidenceIds.push(item.id);

    if (item.normalizedField && item.normalizedValue !== undefined) {
      const key = `${item.subjectId ?? item.documentId ?? item.sourceLabel}:${item.normalizedField}`;
      const bucket = normalizedValues.get(key) ?? new Set<string>();
      bucket.add(canonicalJson(item.normalizedValue));
      normalizedValues.set(key, bucket);
    }

    byId[item.id] = { valid, reason, status };
  }

  for (const [fieldKey, values] of normalizedValues) {
    if (values.size > 1) {
      for (const item of evidence) {
        const itemKey = `${item.subjectId ?? item.documentId ?? item.sourceLabel}:${item.normalizedField}`;
        if (itemKey === fieldKey) {
          contradictedEvidenceIds.push(item.id);
          byId[item.id] = {
            valid: false,
            reason: `Sources disagree on "${item.normalizedField}"`,
            status: "contradicted",
          };
        }
      }
    }
  }

  const uniqueContradicted = [...new Set(contradictedEvidenceIds)];

  return {
    total: evidence.length,
    valid: evidence.filter((item) => byId[item.id]?.valid).length,
    invalidEvidenceIds: [...new Set(invalidEvidenceIds)],
    contradictedEvidenceIds: uniqueContradicted,
    byId,
  };
}

export function evidenceIds(items: Evidence[]): string[] {
  return items.map((item) => item.id);
}

export function evidenceForField(items: Evidence[], field: string): Evidence[] {
  return items.filter((item) => item.normalizedField === field);
}

export function staleEvidence(item: Evidence, now = new Date()): boolean {
  if (!item.freshnessExpiresAt) return false;
  return new Date(item.freshnessExpiresAt).getTime() < now.getTime();
}

export function evidenceStatusLabel(status: EvidenceStatus): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "user_provided":
      return "User provided";
    case "inferred":
      return "Inferred";
    case "unknown":
      return "Unknown";
    case "contradicted":
      return "Contradicted";
    case "stale":
      return "Stale";
  }
}

import { createHash } from "node:crypto";

/**
 * Deterministic JSON serialisation: object keys are sorted recursively so the
 * same logical payload always produces the same hash.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue(record[key]);
        return result;
      }, {});
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashPayload(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function shortHash(hash: string | null | undefined, length = 12): string {
  if (!hash) return "—";
  return hash.slice(0, length);
}

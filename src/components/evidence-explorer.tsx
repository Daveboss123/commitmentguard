import type { Evidence } from "@/lib/domain/types";
import type { EvidenceValidationResult } from "@/lib/domain/evidence";
import { quoteExists, sourceVersionHash } from "@/lib/domain/evidence";
import { Badge, Panel, PanelHeader } from "./ui";
import { formatDate, humanize } from "@/lib/format";
import { formatMoneyMinor } from "@/lib/domain/money";
import { ChevronDown } from "lucide-react";

function factLabel(field: string) {
  return humanize(field.replace(/Minor$/, "").replace(/([a-z])([A-Z])/g, "$1 $2"));
}

function factValue(item: Evidence, currency: string) {
  const value = item.normalizedValue;
  if (value === null || value === undefined) return "Not stated";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && item.normalizedField?.endsWith("Minor")) {
    return formatMoneyMinor(value, currency);
  }
  return `${value}${item.normalizedField?.endsWith("Months") ? " months" : ""}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlighted(text: string, quote: string) {
  const normalized = quote.replace(/\s+/g, " ").trim();
  if (!normalized) return text;
  const pattern = normalized.split(" ").map(escapeRegExp).join("\\s+");
  const match = new RegExp(pattern, "i").exec(text);
  if (!match) return text;
  const start = match.index ?? 0;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[2px] bg-caution-soft px-0.5 text-ink">
        {match[0]}
      </mark>
      {text.slice(start + match[0].length)}
    </>
  );
}

type LayerTone = "ok" | "danger" | "caution" | "neutral";

function Layer({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone: LayerTone;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div>
        <div className="text-[12px] text-ink-muted">{label}</div>
        {note ? <div className="mt-1 text-[11px] leading-4 text-ink-faint">{note}</div> : null}
      </div>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

/**
 * Evidence is shown as separate claims, never one collapsed "Verified" badge:
 * the quote can be located, the document hash can match the recorded version,
 * the source can be unauthenticated, and the fact can still be stale.
 */
export function EvidenceExplorer({
  evidence,
  sourceTexts,
  validation,
  now,
  currency = "USD",
}: {
  evidence: Evidence[];
  sourceTexts: Record<string, string>;
  validation: EvidenceValidationResult;
  now: number;
  currency?: string;
}) {
  const conflicts = new Set(validation.contradictedEvidenceIds);

  return (
    <Panel id="evidence" className="overflow-hidden scroll-mt-6">
      <PanelHeader
        title="Evidence explorer"
        description="Each fact carries its own statuses. A located quote is not the same as an authenticated source."
        action={
          <Badge tone={validation.invalidEvidenceIds.length > 0 ? "danger" : "ok"}>
            {validation.valid}/{validation.total} quotes located
          </Badge>
        }
      />
      <ul className="divide-y divide-line">
        {evidence.map((item) => {
          const check = validation.byId[item.id];
          const source = item.documentId ? sourceTexts[item.documentId] : undefined;
          const quoteLocated = source ? quoteExists(item.quote, source) : false;
          const hashRecorded = Boolean(item.sourceVersionHash);
          const hashMatches =
            Boolean(source) &&
            hashRecorded &&
            item.sourceVersionHash === sourceVersionHash(source as string);
          const contradicted = conflicts.has(item.id);
          const freshness = item.freshnessExpiresAt
            ? new Date(item.freshnessExpiresAt).getTime() > now
              ? "current"
              : "stale"
            : "unrecorded";
          const overallTone: LayerTone = contradicted
            ? "danger"
            : !quoteLocated || !hashMatches
              ? "danger"
              : freshness === "stale"
                ? "caution"
                : "ok";
          const overallLabel = contradicted
            ? "Contradicted"
             : !quoteLocated
               ? "Quote not found"
               : !hashMatches
                 ? "Hash mismatch"
              : freshness === "stale"
                ? "Stale"
                : "Quote and hash match";

          return (
            <li key={item.id} id={`evidence-${item.id}`} className="scroll-mt-24">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 hover:bg-surface sm:flex-row sm:items-start">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-ink">
                        {factLabel(item.normalizedField ?? "fact")}
                      </span>
                      <span className="font-mono-num text-[12px] text-ink-muted">{factValue(item, currency)}</span>
                      {item.page ? (
                        <span className="text-[11px] text-ink-faint">
                          page {item.page}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block border-l-2 border-line pl-2.5 text-[13px] leading-6 text-ink-muted">
                      “{item.quote}”
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={overallTone}>{overallLabel}</Badge>
                    <ChevronDown className="size-4 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
                  </span>
                </summary>

                <div className="border-t border-line bg-surface px-5 py-3">
                  <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    <div className="divide-y divide-line/70">
                      <Layer
                        label="Quote located in source"
                        value={quoteLocated ? "Verified" : "Failed"}
                        tone={quoteLocated ? "ok" : "danger"}
                      />
                      <Layer
                        label="Document integrity"
                        value={
                          hashMatches
                            ? "Hash matches"
                            : hashRecorded
                              ? "Hash mismatch"
                              : "Not recorded"
                        }
                        tone={hashMatches ? "ok" : "danger"}
                        note="Integrity against the recorded version only — not authenticity."
                      />
                      <Layer
                        label="Source authenticity"
                        value="Not checked"
                        tone="neutral"
                        note="No provider-authentication service is integrated."
                      />
                    </div>
                    <div className="divide-y divide-line/70">
                      <Layer
                        label="Currentness"
                        value={
                          freshness === "current"
                            ? "Current"
                            : freshness === "stale"
                              ? "Stale"
                              : "Not recorded"
                        }
                        tone={
                          freshness === "current"
                            ? "ok"
                            : freshness === "stale"
                              ? "caution"
                              : "neutral"
                        }
                        note={
                          item.freshnessExpiresAt
                            ? `Expires ${formatDate(item.freshnessExpiresAt)}`
                            : undefined
                        }
                      />
                      <Layer
                        label="Conflicting evidence"
                        value={contradicted ? "Conflict" : "None"}
                        tone={contradicted ? "danger" : "ok"}
                        note={
                          contradicted
                            ? "Another source states a different value for this field."
                            : undefined
                        }
                      />
                      <Layer
                        label="Extracted"
                        value={item.extractedAt.slice(0, 10)}
                        tone="neutral"
                      />
                    </div>
                  </div>

                  {check?.reason ? (
                    <p className="mt-2 text-[10px] text-danger">{check.reason}</p>
                  ) : null}

                  <p className="mt-3 break-words text-[12px] leading-5 text-ink-muted">Recorded origin: {humanize(item.sourceType)} — {item.sourceLabel}</p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-3 font-mono-num text-[11px] text-ink-faint sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <dt>evidence id</dt>
                      <dd className="min-w-0 break-all text-right">{item.id}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>document</dt>
                      <dd className="min-w-0 break-all text-right">{item.documentId ?? item.sourceLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>doc hash</dt>
                      <dd className="min-w-0 break-all text-right" title={item.sourceVersionHash}>{item.sourceVersionHash.slice(0, 20)}…</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>section</dt>
                      <dd className="min-w-0 break-words text-right">{item.section ?? "—"}</dd>
                    </div>
                  </dl>

                  {source ? (
                    <div className="mt-3">
                      <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-[12px] font-medium text-ink-muted">
                          Source viewer — quoted passage highlighted
                        </span>
                        <span className="break-words text-[11px] text-ink-faint">
                          {item.sourceLabel}
                        </span>
                      </div>
                      <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-raised px-4 py-3 text-[13px] leading-6 text-ink-muted">
                        {renderHighlighted(source, item.quote)}
                      </pre>
                      <p className="mt-2 text-[11px] leading-5 text-ink-faint">
                        Source text is treated as data. Instructions inside a document
                        cannot change tool permissions or the decision rules.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-[10px] text-caution">
                      Source document is unavailable; this fact cannot be visually
                      inspected or revalidated.
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

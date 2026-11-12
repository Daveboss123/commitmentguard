import type { Evidence } from "@/lib/domain/types";
import type { EvidenceValidationResult } from "@/lib/domain/evidence";
import { quoteExists, sourceVersionHash } from "@/lib/domain/evidence";
import { Badge, Panel, PanelHeader } from "./ui";
import { formatDate, humanize } from "@/lib/format";

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
        <div className="text-[10px] text-ink-muted">{label}</div>
        {note ? <div className="text-[9px] leading-4 text-ink-faint">{note}</div> : null}
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
}: {
  evidence: Evidence[];
  sourceTexts: Record<string, string>;
  validation: EvidenceValidationResult;
  now: number;
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
            : !quoteLocated
              ? "danger"
              : freshness === "stale"
                ? "caution"
                : "ok";
          const overallLabel = contradicted
            ? "Contradicted"
            : !quoteLocated
              ? "Quote not found"
              : freshness === "stale"
                ? "Stale"
                : "Quote + document verified";

          return (
            <li key={item.id} id={`evidence-${item.id}`} className="scroll-mt-24">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-3 hover:bg-surface">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-num text-[10px] text-ink-faint">
                        {humanize(item.normalizedField ?? "fact")}
                      </span>
                      {item.page ? (
                        <span className="font-mono-num text-[9px] text-ink-faint">
                          page {item.page}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block border-l-2 border-line pl-2.5 text-[11px] leading-5 text-ink-muted">
                      “{item.quote}”
                    </span>
                  </span>
                  <Badge tone={overallTone}>{overallLabel}</Badge>
                </summary>

                <div className="border-t border-line bg-surface px-5 py-3">
                  <div className="grid gap-x-6 sm:grid-cols-2">
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

                  <dl className="mt-3 grid gap-x-6 gap-y-1 border-t border-line pt-2 font-mono-num text-[9px] text-ink-faint sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <dt>evidence id</dt>
                      <dd className="truncate">{item.id}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>document</dt>
                      <dd className="truncate">{item.documentId ?? item.sourceLabel}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>doc hash</dt>
                      <dd className="truncate">{item.sourceVersionHash.slice(0, 20)}…</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>section</dt>
                      <dd className="truncate">{item.section ?? "—"}</dd>
                    </div>
                  </dl>

                  {source ? (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-ink-muted">
                          Source viewer — quoted passage highlighted
                        </span>
                        <span className="font-mono-num text-[9px] text-ink-faint">
                          {item.sourceLabel}
                        </span>
                      </div>
                      <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap border border-line bg-raised px-3 py-2 font-mono-num text-[10px] leading-5 text-ink-muted">
                        {renderHighlighted(source, item.quote)}
                      </pre>
                      <p className="mt-1 text-[9px] leading-4 text-ink-faint">
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

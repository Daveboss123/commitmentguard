"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleAlert,
  Loader2,
  PencilLine,
  ShieldCheck,
  X,
} from "lucide-react";
import { Badge, InlineNotice, Money, Panel, SeverityBadge } from "@/components/ui";
import { buttonClass } from "@/components/button";
import type { Consequence } from "@/lib/domain/types";

export interface ConsentConsequenceView {
  id: string;
  title: string;
  description: string;
  severity: Consequence["severity"];
  category: Consequence["category"];
  direction: Consequence["direction"];
}

function message(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

function categoryLabel(value: Consequence["category"]): string {
  return value.replaceAll("_", " ");
}

export function ConsentForm({
  analysisId,
  offerVersion,
  currency,
  proposed12Minor,
  consequences,
  approveBlockedReason,
  canRecord,
  approverRole,
}: {
  analysisId: string;
  offerVersion: number;
  currency: string;
  proposed12Minor: number | null;
  consequences: ConsentConsequenceView[];
  approveBlockedReason: string | null;
  canRecord: boolean;
  approverRole: "owner" | "approver";
}) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<
    "approve" | "reject" | "request_changes" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const allAcknowledged = useMemo(
    () => consequences.every((item) => acknowledged.includes(item.id)),
    [acknowledged, consequences],
  );
  const approveEnabled =
    canRecord &&
    approveBlockedReason === null &&
    allAcknowledged &&
    understood &&
    busy === null;

  function toggle(id: string) {
    setAcknowledged((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function submit(decision: "approve" | "reject" | "request_changes") {
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch(`/api/analyses/${analysisId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          acknowledgedConsequences: acknowledged,
          approverRole,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        approval?: { id: string };
      };
      if (!response.ok || !payload.approval?.id) {
        throw new Error(
          message(payload, "The consent decision could not be recorded."),
        );
      }
      router.push(`/app/approvals/${payload.approval.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The consent decision could not be recorded.",
      );
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <Panel tone="raised" className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-[19px] leading-tight text-ink">
            Material consequences to acknowledge
          </h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-5 text-ink-muted">
            Every high or critical consequence must be ticked before consent can
            be recorded. The engine checks this list server-side; the button state
            is only a convenience.
          </p>
        </div>

        {consequences.length === 0 ? (
          <div className="px-5 py-5">
            <p className="text-[12px] leading-5 text-ink-muted">
              No high or critical consequence was recorded for this offer. The
              overall decision and totals still apply.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {consequences.map((item) => {
              const checked = acknowledged.includes(item.id);
              return (
                <li key={item.id} className="px-5 py-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.id)}
                      disabled={!canRecord || busy !== null}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium leading-5 text-ink">
                          {item.title}
                        </span>
                        <SeverityBadge severity={item.severity} />
                        <Badge
                          tone={
                            item.direction === "loss"
                              ? "danger"
                              : item.direction === "gain"
                                ? "ok"
                                : "neutral"
                          }
                        >
                          {item.direction}
                        </Badge>
                        <span className="text-[10px] text-ink-faint">
                          {categoryLabel(item.category)}
                        </span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-5 text-ink-muted">
                        {item.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-line bg-surface px-5 py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              disabled={!canRecord || busy !== null}
              className="mt-1 size-4 shrink-0"
            />
            <span className="text-[12px] leading-5 text-ink">
              I understand that this approval is bound to offer version{" "}
              <span className="font-mono-num">v{offerVersion}</span> and to the
              analysis on this page. It expires after 24 hours, and it is refused
              if the offer, ledger or evidence changes.
            </span>
          </label>
        </div>

        {error ? (
          <div className="border-t border-line px-5 py-4">
            <InlineNotice tone="danger" title="Consent was not recorded">
              {error}
            </InlineNotice>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <div className="text-[11px] leading-4 text-ink-faint">
            Recorded as {approverRole} ·{" "}
            {allAcknowledged
              ? "all material consequences acknowledged"
              : `${acknowledged.length}/${consequences.length} acknowledged`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => submit("reject")}
              disabled={!canRecord || busy !== null}
              className={buttonClass("danger")}
            >
              {busy === "reject" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Reject
            </button>
            <button
              type="button"
              onClick={() => submit("request_changes")}
              disabled={!canRecord || busy !== null}
              className={buttonClass("secondary")}
            >
              {busy === "request_changes" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PencilLine className="size-4" />
              )}
              Request changes
            </button>
            <button
              type="button"
              onClick={() => submit("approve")}
              disabled={!approveEnabled}
              className={buttonClass("primary")}
            >
              {busy === "approve" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Approve and record consent
            </button>
          </div>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <ShieldCheck className="size-4 text-accent" />
              What consent means
            </div>
          </div>
          <dl className="space-y-3 px-5 py-4 text-[12px]">
            <div>
              <dt className="text-[10px] text-ink-faint">Amount at consent</dt>
              <dd className="mt-0.5 font-display text-[24px] leading-none text-ink">
                <Money
                  minor={proposed12Minor}
                  currency={currency}
                  unknownLabel="Incomplete"
                />
              </dd>
              <div className="mt-1 text-[10px] text-ink-faint">
                Proposed household cost for 12 months. Payment sessions are capped
                separately in USDC.
              </div>
            </div>
            <div className="border-t border-line pt-3">
              <dt className="text-[10px] text-ink-faint">What is approved</dt>
              <dd className="mt-0.5 leading-5 text-ink-muted">
                The exact offer, the exact analysis and the consequences listed on
                this page. Nothing else.
              </dd>
            </div>
            <div className="border-t border-line pt-3">
              <dt className="text-[10px] text-ink-faint">What is not approved</dt>
              <dd className="mt-0.5 leading-5 text-ink-muted">
                Any later offer version, any changed term, any uncapped payment and
                any provider activation. Those require a new decision.
              </dd>
            </div>
          </dl>
        </Panel>

        {approveBlockedReason ? (
          <InlineNotice tone="danger" title="Approval is unavailable">
            {approveBlockedReason}
          </InlineNotice>
        ) : (
          <InlineNotice tone="ok" title="Approval is available">
            The analysis passed every hard constraint and has no material unknown.
            Ticking the consequences above unlocks the approve action.
          </InlineNotice>
        )}

        {!canRecord ? (
          <InlineNotice tone="caution" title="Read-only access">
            This member cannot record consent. Ask the household owner or an
            approver to review it.
          </InlineNotice>
        ) : null}

        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-medium text-ink-muted">
            <CircleAlert className="size-3.5 text-caution" />
            Refusal is a valid outcome
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
            Rejecting or requesting changes also writes a decision record and a
            receipt-stage approval entry. Nothing is paid, and no provider is
            contacted.
          </p>
        </div>
      </div>
    </div>
  );
}

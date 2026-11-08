"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, ShieldCheck } from "lucide-react";
import { InlineNotice } from "@/components/ui";
import { buttonClass } from "@/components/button";

export interface PolicyEditorValues {
  version: number;
  currency: string;
  minimumMonthlySavingMinor: number | null;
  maxContractMonths: number | null;
  mustKeepBenefits: string[];
  mustHave: string[];
  mustNotHave: string[];
  softPreferences: string[];
  unknownCriticalTermsPolicy: "review" | "block";
  approvalRequiredFor: string[];
}

function dollars(value: number | null): string {
  return value === null ? "" : (value / 100).toFixed(2);
}

function list(value: string[]): string {
  return value.join(", ");
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function PolicyEditor({
  householdId,
  policy,
  canEdit,
}: {
  householdId: string;
  policy: PolicyEditorValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [currency, setCurrency] = useState(policy.currency);
  const [minimumSaving, setMinimumSaving] = useState(
    dollars(policy.minimumMonthlySavingMinor),
  );
  const [maxTerm, setMaxTerm] = useState(
    policy.maxContractMonths === null ? "" : String(policy.maxContractMonths),
  );
  const [mustKeepBenefits, setMustKeepBenefits] = useState(
    list(policy.mustKeepBenefits),
  );
  const [mustHave, setMustHave] = useState(list(policy.mustHave));
  const [mustNotHave, setMustNotHave] = useState(list(policy.mustNotHave));
  const [softPreferences, setSoftPreferences] = useState(
    list(policy.softPreferences),
  );
  const [unknownPolicy, setUnknownPolicy] = useState<"review" | "block">(
    policy.unknownCriticalTermsPolicy,
  );
  const [approvalRequiredFor, setApprovalRequiredFor] = useState(
    list(policy.approvalRequiredFor),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setPending(true);
    setError(null);
    setSaved(false);

    const savingMinor = minimumSaving.trim()
      ? Math.round(Number.parseFloat(minimumSaving) * 100)
      : null;
    const term = maxTerm.trim() ? Number.parseInt(maxTerm, 10) : null;

    if (savingMinor !== null && (!Number.isFinite(savingMinor) || savingMinor < 0)) {
      setError("The minimum monthly saving must be a valid non-negative amount.");
      setPending(false);
      return;
    }
    if (term !== null && (!Number.isFinite(term) || term < 1)) {
      setError("The maximum contract must be a positive whole number of months.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch(`/api/households/${householdId}/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          minimumMonthlySavingMinor: savingMinor,
          maxContractMonths: term,
          mustKeepBenefits: parseList(mustKeepBenefits),
          mustHave: parseList(mustHave),
          mustNotHave: parseList(mustNotHave),
          softPreferences: parseList(softPreferences),
          unknownCriticalTermsPolicy: unknownPolicy,
          approvalRequiredFor: parseList(approvalRequiredFor),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        policy?: { version: number };
        error?: { message?: string };
      };
      if (!response.ok || !payload.policy) {
        throw new Error(
          payload.error?.message ?? "The policy could not be saved.",
        );
      }
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The policy could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent disabled:opacity-60";

  return (
    <form onSubmit={submit} className="space-y-4 px-5 py-5">
      {error ? (
        <InlineNotice tone="danger" title="Policy not saved">
          {error}
        </InlineNotice>
      ) : null}
      {saved ? (
        <InlineNotice tone="ok" title="Policy saved">
          A new policy version is active. Past analyses keep the policy version
          they ran against; recalculate to apply the new rules.
        </InlineNotice>
      ) : null}
      {!canEdit ? (
        <InlineNotice tone="caution" title="Read-only policy">
          Only the household owner or an approver can change these rules.
        </InlineNotice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] text-ink-muted">
          Currency
          <select
            className={inputClass}
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            disabled={!canEdit}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </label>
        <label className="block text-[12px] text-ink-muted">
          Minimum monthly saving (USD, blank for no floor)
          <input
            className={inputClass}
            value={minimumSaving}
            onChange={(event) => setMinimumSaving(event.target.value)}
            inputMode="decimal"
            placeholder="No floor"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Maximum contract (months, blank for no limit)
          <input
            className={inputClass}
            value={maxTerm}
            onChange={(event) => setMaxTerm(event.target.value)}
            inputMode="numeric"
            placeholder="No limit"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Unknown critical terms
          <select
            className={inputClass}
            value={unknownPolicy}
            onChange={(event) =>
              setUnknownPolicy(event.target.value as "review" | "block")
            }
            disabled={!canEdit}
          >
            <option value="review">Review — ask the household</option>
            <option value="block">Block — refuse the offer</option>
          </select>
        </label>
        <label className="block text-[12px] text-ink-muted sm:col-span-2">
          Benefits that must be kept (comma-separated keys)
          <input
            className={inputClass}
            value={mustKeepBenefits}
            onChange={(event) => setMustKeepBenefits(event.target.value)}
            placeholder="family_mobile_bundle_discount"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Must have (comma-separated)
          <input
            className={inputClass}
            value={mustHave}
            onChange={(event) => setMustHave(event.target.value)}
            placeholder="broadband, minimum_data_allowance"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Must not have (comma-separated)
          <input
            className={inputClass}
            value={mustNotHave}
            onChange={(event) => setMustNotHave(event.target.value)}
            placeholder="automatic_24_month_renewal"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Soft preferences (comma-separated)
          <input
            className={inputClass}
            value={softPreferences}
            onChange={(event) => setSoftPreferences(event.target.value)}
            placeholder="lower_installation_fee, router_included"
            disabled={!canEdit}
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Approval required for (comma-separated)
          <input
            className={inputClass}
            value={approvalRequiredFor}
            onChange={(event) => setApprovalRequiredFor(event.target.value)}
            placeholder="provider_switch, new_contract, payment"
            disabled={!canEdit}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-[52ch] text-[11px] leading-5 text-ink-faint">
          The policy is a hard-constraint source. SERV may read it but cannot
          relax it. Saving creates policy version {policy.version + 1}.
        </p>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-faint">
            <ShieldCheck className="size-3.5" />
            v{policy.version}
          </span>
          <button
            type="submit"
            disabled={pending || !canEdit}
            className={buttonClass("primary")}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {pending ? "Saving…" : "Save policy"}
          </button>
        </div>
      </div>
    </form>
  );
}

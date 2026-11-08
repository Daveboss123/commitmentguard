"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import type { Commitment } from "@/lib/domain/types";
import { buttonClass } from "@/components/button";
import { InlineNotice } from "@/components/ui";

function dollars(minor: number | null): string {
  return minor === null ? "" : (minor / 100).toFixed(2);
}

export function CommitmentEditor({ commitment }: { commitment: Commitment }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [providerName, setProviderName] = useState(commitment.providerName);
  const [planName, setPlanName] = useState(commitment.planName);
  const [recurring, setRecurring] = useState(dollars(commitment.recurringChargeMinor));
  const [standard, setStandard] = useState(dollars(commitment.standardChargeMinor));
  const [cancellation, setCancellation] = useState(
    dollars(commitment.cancellationFeeMinor),
  );
  const [minimumTerm, setMinimumTerm] = useState(String(commitment.minimumTermMonths));
  const [renewalType, setRenewalType] = useState(commitment.renewalType);
  const [contractEnd, setContractEnd] = useState(commitment.contractEnd ?? "");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);

    const recurringMinor = Math.round(Number.parseFloat(recurring) * 100);
    const standardMinor = standard.trim()
      ? Math.round(Number.parseFloat(standard) * 100)
      : null;
    const cancellationMinor = cancellation.trim()
      ? Math.round(Number.parseFloat(cancellation) * 100)
      : null;
    const term = Number.parseInt(minimumTerm, 10);

    if (!Number.isFinite(recurringMinor) || recurringMinor < 0) {
      setError("Recurring charge must be a valid non-negative amount.");
      setPending(false);
      return;
    }
    if (!Number.isFinite(term) || term < 0) {
      setError("Minimum term must be a valid non-negative number of months.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch(`/api/commitments/${commitment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName,
          planName,
          recurringChargeMinor: recurringMinor,
          standardChargeMinor: standardMinor,
          cancellationFeeMinor: cancellationMinor,
          minimumTermMonths: term,
          renewalType,
          contractEnd: contractEnd || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "The commitment could not be saved.");
      }
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The commitment could not be saved.");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-[13px] text-ink shadow-none placeholder:text-ink-faint focus:border-accent";

  return (
    <form onSubmit={submit} className="space-y-4 px-5 py-5">
      {error ? (
        <InlineNotice tone="danger" title="Not saved">
          {error}
        </InlineNotice>
      ) : null}
      {saved ? (
        <InlineNotice tone="ok" title="Saved">
          A new commitment version and user-provided evidence entries were recorded.
          Existing analyses keep the terms they were run against.
        </InlineNotice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] text-ink-muted">
          Provider
          <input
            className={inputClass}
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
            required
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Plan name
          <input
            className={inputClass}
            value={planName}
            onChange={(event) => setPlanName(event.target.value)}
            required
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Recurring charge (USD)
          <input
            className={inputClass}
            value={recurring}
            onChange={(event) => setRecurring(event.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Standard charge after promotion (USD, optional)
          <input
            className={inputClass}
            value={standard}
            onChange={(event) => setStandard(event.target.value)}
            inputMode="decimal"
            placeholder="Not stated"
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Cancellation fee (USD, optional)
          <input
            className={inputClass}
            value={cancellation}
            onChange={(event) => setCancellation(event.target.value)}
            inputMode="decimal"
            placeholder="Not stated"
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Minimum term (months)
          <input
            className={inputClass}
            value={minimumTerm}
            onChange={(event) => setMinimumTerm(event.target.value)}
            inputMode="numeric"
            required
          />
        </label>
        <label className="block text-[12px] text-ink-muted">
          Renewal type
          <select
            className={inputClass}
            value={renewalType}
            onChange={(event) =>
              setRenewalType(event.target.value as Commitment["renewalType"])
            }
          >
            <option value="monthly">Monthly</option>
            <option value="fixed_term">Fixed term</option>
            <option value="automatic">Automatic</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="block text-[12px] text-ink-muted">
          Contract end (optional)
          <input
            className={inputClass}
            type="date"
            value={contractEnd}
            onChange={(event) => setContractEnd(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-[46ch] text-[11px] leading-5 text-ink-faint">
          Changes create new user-provided evidence. They do not rewrite a provider
          document or silently update a past decision.
        </p>
        <button type="submit" className={buttonClass("secondary")} disabled={pending}>
          <Save className="size-4" />
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
